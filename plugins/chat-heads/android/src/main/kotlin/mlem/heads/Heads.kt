package mlem.heads

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.app.Activity
import android.app.ActivityManager
import android.app.ActivityOptions
import android.app.Application
import android.app.Notification
import android.app.PendingIntent
import android.app.Person
import android.app.RemoteInput
import android.content.ComponentCallbacks
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.Settings
import android.text.TextUtils
import android.view.Choreographer
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsAnimation
import android.view.WindowManager
import android.view.animation.AccelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.view.inputmethod.InputMethodManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

private const val MAX = 5

class Head(val key: String, val view: HeadView) {
    var title = ""
    var text = ""
    var group = false
    var intent: PendingIntent? = null
    var test = false
    var lines: List<Line> = emptyList()
    var reply: Notification.Action? = null
    var seenAt = 0L
    var repliedAt = 0L
    var avatarFile: String? = null

    fun merge(fresh: List<Line>) {
        val seen = HashSet<String>()
        lines = (lines + fresh).filter { seen.add("${it.senderKey}|${it.time}|${it.text}") }.sortedBy { it.time }.takeLast(40)
    }

    fun unread(): Int {
        if (lines.isEmpty()) return if (test) 2 else 1
        val from = max(lines.lastOrNull { it.mine }?.time ?: 0, max(seenAt, repliedAt))
        return lines.count { !it.mine && it.time > from }
    }

    fun json(): JSONObject = JSONObject()
        .put("key", key)
        .put("title", title)
        .put("group", group)
        .put("test", test)
        .put("canReply", reply != null || test)
        .put("avatar", avatarFile)
        .put("lines", JSONArray().also { a ->
            for (l in lines) a.put(JSONObject().put("sender", l.sender).put("senderKey", l.senderKey).put("text", l.text).put("time", l.time).put("mine", l.mine))
        })
}

class Opts(
    var dms: Boolean = true,
    var groups: Boolean = true,
    var quick: Boolean = true,
    var preview: Boolean = false,
    var haptics: Boolean = true,
)

@SuppressLint("ClickableViewAccessibility")
class Heads(private val app: Context, private val storage: File, private val log: (String, Throwable?) -> Unit) : Application.ActivityLifecycleCallbacks {
    private val main = Handler(Looper.getMainLooper())
    private val wm = app.getSystemService(WindowManager::class.java)
    private val imm = app.getSystemService(InputMethodManager::class.java)
    private val vibrator = runCatching { app.getSystemService(Vibrator::class.java) }.getOrNull()
    private val fonts by lazy { Fonts(app) }
    private val heads = ArrayList<Head>()
    private val byTag = HashMap<String, String>()

    private val application = (app as? Application) ?: runCatching {
        Class.forName("android.app.ActivityThread").getMethod("currentApplication").invoke(null) as Application
    }.getOrNull()
    private val surface = application?.let { Surface(it, File(storage, "surface.txt"), log) }

    private val started = HashSet<Activity>()
    private var foreground = run {
        val info = ActivityManager.RunningAppProcessInfo()
        ActivityManager.getMyMemoryState(info)
        info.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
    }

    private var opts = Opts()
    private var optsStamp = -1L
    private var palette = Palette.load(storage)
    var cardReady = false
        set(v) {
            field = v
            jsReported = true
            main.post { if (v) warmDone() else warmGaveUp() }
        }
    private var jsReported = false
    private var waiting: HeadView? = null
    private val warmTimeout = Runnable { warmGaveUp() }
    private val warmPoll = object : Runnable {
        override fun run() {
            val hv = waiting ?: return
            if (surface?.hasContext() != true) { main.postDelayed(this, 100); return }
            hv.loading = false
            if (heads.isEmpty() || fan != null || !hv.isAttachedToWindow) { stopWaiting(); return }
            expand(options().quick && !surfaceBroken, hv)
            if (fan == null || fan !== cardWin) warmGaveUp()
        }
    }
    private var surfaceBroken = false

    private val sample by lazy { HeadView(app, fonts.bold) }
    private val size get() = sample.size
    private val step get() = app.dp(4f).toInt()
    private fun d(v: Float) = app.dp(v).toInt()

    private var stack: FrameLayout? = null
    private var stackLp: WindowManager.LayoutParams? = null
    private var stackX: Spring? = null
    private var stackY: Spring? = null
    private var trash: TrashView? = null
    private var trashLp: WindowManager.LayoutParams? = null

    private var fan: FrameLayout? = null
    private var cardView: View? = null
    private var cardWin: FrameLayout? = null
    private var cardLp: WindowManager.LayoutParams? = null
    private val cells = LinkedHashMap<Head, FrameLayout>()
    private val cellX = HashMap<Head, Float>()
    private var selected: Head? = null
    private var backCb: Any? = null
    private var ime = 0
    private var nav = 0

    private var left = false
    private var anchorY = -1

    private val dismiss = object : android.content.BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            if (fan != null) main.post { collapse(animate = true) }
        }
    }

    private val config = object : ComponentCallbacks {
        override fun onConfigurationChanged(c: Configuration) {
            main.post { if (stack != null && !dragging) { stackX?.snap(edgeX(left).toFloat()); stackY?.snap(clampY(anchorY).toFloat()) } }
        }
        @Deprecated("") override fun onLowMemory() {}
    }
    private var dragging = false

    init {
        application?.registerActivityLifecycleCallbacks(this)
        app.registerComponentCallbacks(config)
        runCatching {
            @Suppress("DEPRECATION")
            val f = android.content.IntentFilter(Intent.ACTION_CLOSE_SYSTEM_DIALOGS)
            if (Build.VERSION.SDK_INT >= 33) app.registerReceiver(dismiss, f, Context.RECEIVER_EXPORTED) else app.registerReceiver(dismiss, f)
        }
    }

    fun allowed() = Settings.canDrawOverlays(app)

    fun close() = main.post {
        application?.unregisterActivityLifecycleCallbacks(this)
        runCatching { app.unregisterComponentCallbacks(config) }
        runCatching { app.unregisterReceiver(dismiss) }
        started.clear()
        stopWaiting()
        heads.clear()
        byTag.clear()
        drop()
    }

    private fun options(): Opts {
        val f = File(storage, "storage.json")
        val stamp = if (f.exists()) f.lastModified() else 0L
        if (stamp != optsStamp) {
            optsStamp = stamp
            opts = runCatching {
                val j = JSONObject(f.readText())
                val o = j.optJSONObject("data") ?: j
                Opts(o.optBoolean("dms", true), o.optBoolean("groups", true), o.optBoolean("quickReply", true), o.optBoolean("preview", false), o.optBoolean("haptics", true))
            }.getOrDefault(Opts())
        }
        return opts
    }

    private var savedTheme = runCatching { JSONObject(File(storage, "theme.json").readText()).optString("theme") }.getOrNull().orEmpty()

    fun theme(json: String) {
        val p = runCatching { Palette.from(JSONObject(json)) }.getOrNull() ?: return
        runCatching { File(storage, "theme.json").writeText(json) }
        runCatching { JSONObject(json).optString("theme") }.getOrNull()?.takeIf { it.isNotEmpty() }?.let { savedTheme = it }
        main.post {
            palette = p
            for (h in heads) h.view.badgeColor = p.badge
            trashWin?.tint = p.trashIcon
        }
    }

    private fun haptic(v: View?, constant: Int) {
        if (!options().haptics) return
        v?.performHapticFeedback(constant)
    }

    private fun tick(v: View?) {
        if (!options().haptics) return
        val vib = vibrator
        if (Build.VERSION.SDK_INT >= 29 && vib != null) {
            runCatching { vib.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK)) }.onSuccess { return }
        }
        v?.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
    }

    fun posted(tag: String?, id: Int, n: Notification, test: Boolean = false) {
        val msg = runCatching { read(app, tag, id, n, d(64f)) }.getOrNull() ?: return
        main.post { add(msg, "${tag.orEmpty()}|$id", test) }
    }

    fun cancelled(tag: String?, id: Int) = main.post {
        val key = byTag.remove("${tag.orEmpty()}|$id") ?: return@post
        val h = heads.firstOrNull { it.key == key } ?: return@post
        val busy = h === selected || System.currentTimeMillis() - h.repliedAt < 3 * 60_000
        if (busy) {
            h.seenAt = System.currentTimeMillis()
            h.view.count = 0
            return@post
        }
        remove(h)
    }

    fun cancelledAll() = main.post {
        heads.filter { !it.test && it !== selected }.forEach { remove(it, sync = false) }
        byTag.clear()
        sync()
    }

    private fun add(msg: Msg, tagKey: String, test: Boolean) {
        val o = options()
        if (!test && (if (msg.group) !o.groups else !o.dms)) return
        byTag[tagKey] = msg.key
        var head = heads.firstOrNull { it.key == msg.key }
        val fresh = head == null
        if (head == null) {
            head = Head(msg.key, HeadView(app, fonts.bold).apply { badgeColor = palette.badge })
            heads.add(head)
            while (heads.size > MAX) heads.firstOrNull { it !== selected }?.let { remove(it, sync = false) } ?: break
        }
        head.title = msg.title
        head.text = msg.text
        head.group = msg.group
        head.intent = msg.intent
        head.test = test
        if (msg.reply != null) head.reply = msg.reply
        head.merge(msg.lines)
        head.view.title = msg.title
        head.view.avatar = msg.avatar ?: head.view.avatar
        msg.avatar?.let { bmp ->
            runCatching {
                val f = File(File(app.cacheDir, "mlemheads").apply { mkdirs() }, "${head.key.hashCode()}.png")
                f.outputStream().use { bmp.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
                head.avatarFile = "file://" + f.absolutePath
            }
        }
        if (head === selected && fan != null) head.seenAt = System.currentTimeMillis()
        head.view.count = head.unread()
        head.view.contentDescription = msg.title
        if (fan != null) {
            if (fresh) layoutCells(animate = true)
            emit(JSONObject().put("t", "update").put("head", head.json()))
            return
        }
        sync()
    }

    private fun remove(h: Head, sync: Boolean = true) {
        heads.remove(h)
        byTag.values.removeAll { it == h.key }
        cells.remove(h)?.let { c -> c.animate().alpha(0f).setDuration(200).withEndAction { (c.parent as? ViewGroup)?.removeView(c) }.start() }
        cellX.remove(h)
        if (h === selected) selected = null
        if (!sync) return
        if (fan != null) {
            if (heads.isEmpty()) collapse(animate = true) else {
                layoutCells(animate = true)
                if (selected == null) heads.lastOrNull()?.let { select(it, quiet = true) }
                emit(JSONObject().put("t", "heads").put("heads", JSONArray(heads.map { it.json() })))
            }
        } else sync()
    }

    private fun visible() = heads.isNotEmpty() && allowed() && (!foreground || heads.any { it.test })

    private fun sync() {
        if (!visible()) {
            drop()
            return
        }
        if (fan != null) return
        val root = stack ?: makeStack()
        stackShown(true)
        root.removeAllViews()
        val shown = heads.takeLast(3)
        for ((i, h) in shown.withIndex()) {
            (h.view.parent as? ViewGroup)?.removeView(h.view)
            h.view.translationX = 0f
            h.view.translationY = ((shown.size - 1 - i) * step).toFloat()
            h.view.scaleX = 1f
            h.view.scaleY = 1f
            h.view.alpha = 1f
            h.view.translationZ = 0f
            h.view.chrome = i == shown.size - 1
            h.view.badgeStart = !left
            root.addView(h.view, FrameLayout.LayoutParams(size, size))
        }
        root.contentDescription = heads.lastOrNull()?.let { "${it.title}, ${it.view.count}" }
    }

    private fun drop() {
        stackX?.cancel()
        stackY?.cancel()
        stack?.let { runCatching { wm.removeView(it) } }
        stack = null
        stackLp = null
        hideTrash(now = true)
        fan?.let { f ->
            runCatching { imm.hideSoftInputFromWindow(f.windowToken, 0) }
            releaseBack(f)
            if (f !== cardWin) runCatching { wm.removeView(f) }
        }
        cardWin?.let { runCatching { wm.removeView(it) } }
        cardWin = null
        cardLp = null
        endSurface()
        fan = null
        cells.clear()
        cellX.clear()
        selected = null
    }

    private fun screen(): Rect {
        if (Build.VERSION.SDK_INT >= 30) return wm.currentWindowMetrics.bounds
        val m = app.resources.displayMetrics
        return Rect(0, 0, m.widthPixels, m.heightPixels)
    }

    private fun safe(): Rect {
        val s = screen()
        if (Build.VERSION.SDK_INT >= 30) {
            val i = wm.currentWindowMetrics.windowInsets.getInsetsIgnoringVisibility(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
            return Rect(s.left + i.left, s.top + i.top, s.right - i.right, s.bottom - i.bottom)
        }
        return s
    }

    private fun params(w: Int, h: Int, touch: Boolean, focus: Boolean = false) = WindowManager.LayoutParams(
        w, h,
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
        WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED or
            WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
            (if (focus) 0 else WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE) or
            (if (touch) 0 else WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE),
        PixelFormat.TRANSLUCENT,
    ).apply {
        gravity = Gravity.TOP or Gravity.START
        layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
        if (Build.VERSION.SDK_INT >= 30) fitInsetsTypes = 0
        if (focus) softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING or WindowManager.LayoutParams.SOFT_INPUT_STATE_HIDDEN
    }

    private fun edgeX(left: Boolean): Int {
        val s = screen()
        val m = d(16f)
        return if (left) s.left - m else s.right + m - size
    }

    private fun clampY(y: Int): Int {
        val s = screen()
        val m = d(16f)
        return y.coerceIn(s.top + m, s.bottom - m - size - step * 2)
    }

    private fun stackShown(on: Boolean) {
        val root = stack ?: return
        val lp = stackLp ?: return
        val wasOn = lp.alpha > 0f
        if (wasOn == on) return
        lp.alpha = if (on) 1f else 0f
        lp.flags = if (on) lp.flags and WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE.inv() else lp.flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
        if (root.isAttachedToWindow) wm.updateViewLayout(root, lp)
    }

    private fun makeStack(): FrameLayout {
        val root = FrameLayout(app).apply {
            clipChildren = false
            clipToPadding = false
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
        }
        if (anchorY < 0) anchorY = (screen().height() * 0.28f).toInt()
        val lp = params(size, size + step * 2, true).apply {
            x = edgeX(left)
            y = clampY(anchorY)
        }
        root.setOnTouchListener(Drag())
        wm.addView(root, lp)
        stack = root
        stackLp = lp
        stackX = Spring { v -> lp.x = v.toInt(); relayout() }.also { it.snap(lp.x.toFloat()) }
        stackY = Spring { v -> lp.y = v.toInt(); relayout() }.also { it.snap(lp.y.toFloat()) }
        makeTrash()
        return root
    }

    private var relayoutQueued = false
    private val relayoutFrame = Choreographer.FrameCallback {
        relayoutQueued = false
        val root = stack
        val lp = stackLp
        if (root != null && lp != null && root.isAttachedToWindow) wm.updateViewLayout(root, lp)
    }

    private fun relayout() {
        if (relayoutQueued) return
        relayoutQueued = true
        Choreographer.getInstance().postFrameCallback(relayoutFrame)
    }

    private val trashIcon by lazy {
        runCatching {
            val id = app.resources.getIdentifier("design_components_icon_native_redesign_generated_images_xsmallicon", "drawable", app.packageName)
            if (id == 0) null else app.resources.getDrawable(id, null).mutate()
        }.getOrNull()
    }
    private var trashWin: TrashView? = null
    private var trashAnim: ValueAnimator? = null

    private fun makeTrash() {
        if (trashWin != null) return
        val v = TrashView(app, trashIcon).apply { tint = palette.trashIcon }
        val h = v.zoneH.toInt()
        val lp = params(WindowManager.LayoutParams.MATCH_PARENT, h, false).apply { y = screen().bottom - h }
        v.alpha = 0f
        v.translationY = app.dp(64f)
        runCatching { wm.addView(v, lp) }.onFailure { return }
        trashWin = v
        trashLp = lp
    }

    private fun showTrash() {
        if (trash != null) return
        makeTrash()
        val v = trashWin ?: return
        trash = v
        trashAnim?.cancel()
        v.animate().cancel()
        v.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        v.animate().alpha(1f).setDuration(200).setInterpolator(AccelerateInterpolator()).start()
        trashAnim = ValueAnimator.ofFloat(v.translationY, 0f).apply {
            duration = 400
            interpolator = OvershootInterpolator()
            addUpdateListener { v.translationY = it.animatedValue as Float }
            addListener(object : android.animation.AnimatorListenerAdapter() {
                override fun onAnimationEnd(a: android.animation.Animator) { v.setLayerType(View.LAYER_TYPE_NONE, null) }
            })
            start()
        }
    }

    private fun hideTrash(now: Boolean = false) {
        if (now) {
            trash = null
            trashAnim?.cancel()
            trashWin?.let { runCatching { wm.removeView(it) } }
            trashWin = null
            trashLp = null
            return
        }
        val v = trash ?: return
        trash = null
        trashAnim?.cancel()
        v.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        v.animate().alpha(0f).setDuration(200).setInterpolator(AccelerateInterpolator()).start()
        trashAnim = ValueAnimator.ofFloat(v.translationY, app.dp(64f)).apply {
            duration = 400
            interpolator = AccelerateInterpolator()
            addUpdateListener { v.translationY = it.animatedValue as Float }
            addListener(object : android.animation.AnimatorListenerAdapter() {
                override fun onAnimationEnd(a: android.animation.Animator) { v.active = false; v.hover = 1f; v.setLayerType(View.LAYER_TYPE_NONE, null) }
            })
            start()
        }
    }

    private fun inTrash(rawX: Float, rawY: Float): Boolean {
        val v = trash ?: return false
        val lp = trashLp ?: return false
        val z = v.zone()
        return z.contains(rawX - lp.x, rawY - lp.y)
    }

    private fun trashSpot(): Pair<Int, Int>? {
        val v = trash ?: return null
        val lp = trashLp ?: return null
        return Pair((lp.x + v.centerX() - size / 2f).toInt(), (lp.y + v.centerY() - size / 2f - step * 2).toInt())
    }

    private fun hover(v: TrashView, on: Boolean) {
        v.active = on
        if (!on) { v.hover = 1f; return }
        ValueAnimator.ofFloat(1f, 1.75f).apply {
            duration = 200
            interpolator = OvershootInterpolator()
            addUpdateListener { v.hover = it.animatedValue as Float }
            start()
        }
    }

    private fun press(on: Boolean) {
        val top = heads.lastOrNull()?.view ?: return
        top.animate().scaleX(if (on) 1.2f else 1f).scaleY(if (on) 1.2f else 1f).translationZ(if (on) app.dp(16f) else 0f)
            .setDuration(200).setInterpolator(OvershootInterpolator()).withLayer().start()
    }

    private inner class Drag : View.OnTouchListener {
        private var downX = 0f
        private var downY = 0f
        private var startX = 0
        private var startY = 0
        private var magnet = false
        private var held = false
        private val slop = app.dp(16f)
        private var root: View? = null
        private val hold = Runnable {
            if (dragging) return@Runnable
            held = true
            press(false)
            tick(root)
            heads.lastOrNull()?.let { open(it) }
        }

        override fun onTouch(v: View, e: MotionEvent): Boolean {
            val lp = stackLp ?: return false
            root = v
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    stackX?.cancel()
                    stackY?.cancel()
                    downX = e.rawX
                    downY = e.rawY
                    startX = lp.x
                    startY = lp.y
                    dragging = false
                    magnet = false
                    held = false
                    press(true)
                    v.postDelayed(hold, ViewConfiguration.getLongPressTimeout().toLong())
                }
                MotionEvent.ACTION_MOVE -> {
                    if (held) return true
                    if (!dragging && abs(e.rawX - downX) > slop) {
                        dragging = true
                        stopWaiting()
                        v.removeCallbacks(hold)
                        press(false)
                        haptic(v, HapticFeedbackConstants.VIRTUAL_KEY)
                        showTrash()
                    }
                    if (!dragging) return true
                    val inside = inTrash(e.rawX, e.rawY)
                    if (inside && !magnet) {
                        magnet = true
                        haptic(v, HapticFeedbackConstants.CONTEXT_CLICK)
                        trash?.let { hover(it, true) }
                        trashSpot()?.let { (x, y) -> stackX?.to(x.toFloat()); stackY?.to(y.toFloat()) }
                    } else if (!inside && magnet) {
                        magnet = false
                        haptic(v, HapticFeedbackConstants.CONTEXT_CLICK)
                        trash?.let { hover(it, false) }
                    }
                    if (!magnet) {
                        stackX?.snap(startX + e.rawX - downX)
                        stackY?.snap(startY + e.rawY - downY)
                    }
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    v.removeCallbacks(hold)
                    if (held) return true
                    if (!dragging) {
                        press(false)
                        if (e.actionMasked == MotionEvent.ACTION_UP) tap(v)
                        return true
                    }
                    dragging = false
                    if (magnet) {
                        v.animate().alpha(0f).setDuration(200).withEndAction {
                            v.alpha = 1f
                            heads.clear()
                            byTag.clear()
                            sync()
                        }.start()
                        stackY?.to(lp.y + app.dp(40f))
                        hideTrash()
                        return true
                    }
                    hideTrash()
                    left = lp.x + size / 2 < screen().width() / 2
                    anchorY = clampY(lp.y)
                    stackX?.to(edgeX(left).toFloat(), 50f)
                    stackY?.to(anchorY.toFloat(), 50f)
                }
            }
            return true
        }
    }

    private fun tap(v: View) {
        val want = options().quick && !surfaceBroken
        if (want && !cardReady && !jsReported) {
            if (waiting != null) return
            val hv = heads.lastOrNull()?.view
            if (hv != null && surface?.warm() == true) {
                waiting = hv
                hv.loading = true
                tick(v)
                main.postDelayed(warmTimeout, 15_000)
                main.post(warmPoll)
                return
            }
        }
        val quick = want && cardReady
        if (!quick && heads.size == 1) open(heads[0]) else expand(quick, v)
    }

    private fun warmDone() {
        if (waiting == null) return
        stopWaiting()
    }

    private fun warmGaveUp() {
        val hv = waiting ?: return
        stopWaiting()
        log("card js didn't start, opening the chat instead", null)
        val h = heads.firstOrNull { it.key == selected?.key } ?: heads.lastOrNull() ?: return
        if (fan != null) collapse()
        if (heads.size == 1) open(h) else expand(false, hv)
    }

    private fun stopWaiting() {
        main.removeCallbacks(warmTimeout)
        main.removeCallbacks(warmPoll)
        waiting?.loading = false
        waiting = null
    }

    fun open(h: Head) {
        heads.remove(h)
        byTag.values.removeAll { it == h.key }
        val pi = h.intent
        val sent = pi != null && runCatching {
            val o = ActivityOptions.makeBasic()
            if (Build.VERSION.SDK_INT >= 36) {
                o.setPendingIntentBackgroundActivityStartMode(ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOW_ALWAYS)
            } else if (Build.VERSION.SDK_INT >= 34) {
                @Suppress("DEPRECATION")
                o.setPendingIntentBackgroundActivityStartMode(ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED)
            }
            pi.send(app, 0, null, null, null, null, o.toBundle())
        }.isSuccess
        if (!sent) {
            app.packageManager.getLaunchIntentForPackage(app.packageName)?.let {
                it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                runCatching { app.startActivity(it) }
            }
        }
        if (fan != null) collapse() else sync()
    }

    fun openKey(key: String) = main.post { heads.firstOrNull { it.key == key }?.let { open(it) } }

    private fun rowTop() = safe().top + d(8f)
    private fun stepX() = size - d(6f)
    private fun cardTop() = rowTop() + size + d(2f)

    private fun layoutJson(): JSONObject {
        val dens = app.resources.displayMetrics.density
        val s = screen()
        val sel = selected
        val cx = sel?.let { (cellX[it] ?: 0f) + size / 2f } ?: (s.width() - size / 2f)
        return JSONObject()
            .put("top", cardTop() / dens)
            .put("caret", cx / dens)
            .put("width", s.width() / dens)
            .put("height", s.height() / dens)
            .put("safeTop", safe().top / dens)
            .put("ime", ime / dens)
            .put("nav", nav / dens)
    }

    fun state(): String {
        val j = JSONObject()
            .put("open", fan != null && cardView != null)
            .put("selected", selected?.key)
            .put("heads", JSONArray(heads.map { it.json() }))
            .put("layout", layoutJson())
            .put("theme", savedTheme)
        return j.toString()
    }

    private fun emit(j: JSONObject) {
        if (cardView != null) surface?.emit(j.toString())
    }

    private fun expand(quick: Boolean, from: View) {
        val lp = stackLp ?: return
        val start = Pair(lp.x, lp.y)
        stackX?.cancel()
        stackY?.cancel()
        stackShown(false)

        cells.clear()
        cellX.clear()
        selected = heads.lastOrNull()
        selected?.let { it.seenAt = System.currentTimeMillis(); it.view.count = 0 }

        val card = if (quick) showCard() else null
        if (card != null) {
            fan = card
        } else {
            val root = FrameLayout(app).apply { clipChildren = false }
            root.addView(View(app).apply {
                setBackgroundColor(Color.BLACK)
                alpha = 0f
                animate().alpha(0.5f).setDuration(200).start()
                setOnClickListener { collapse(animate = true) }
            }, FrameLayout.LayoutParams(-1, -1))
            val flp = params(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, true).apply {
                y = screen().top
                height = screen().height()
            }
            wm.addView(root, flp)
            fan = root
        }
        tick(from)
        layoutCells(animate = true, from = start)
    }

    private fun layoutCells(animate: Boolean, from: Pair<Int, Int>? = null) {
        val root = fan ?: return
        val s = safe()
        val labels = root !== cardWin
        val order = heads.reversed()
        val top = rowTop().toFloat()
        val rtl = app.resources.configuration.layoutDirection == View.LAYOUT_DIRECTION_RTL
        for ((i, h) in order.withIndex().reversed()) {
            var cell = cells[h]
            val x = if (rtl) (s.left + d(4f) - h.view.pad + i * stepX()).toFloat() else (s.right - size - i * stepX() + h.view.pad - d(4f)).toFloat()
            cellX[h] = x
            if (cell == null) {
                (h.view.parent as? ViewGroup)?.removeView(h.view)
                cell = FrameLayout(app).apply { clipChildren = false; clipToPadding = false }
                val col = LinearLayout(app).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; clipChildren = false }
                col.addView(h.view, LinearLayout.LayoutParams(size, size))
                if (labels) {
                    col.addView(label(h.title, 12f, 1f), LinearLayout.LayoutParams(size, -2))
                    if (options().preview && h.text.isNotEmpty()) col.addView(label(h.text, 11f, 0.75f), LinearLayout.LayoutParams(size, -2))
                }
                cell.addView(col)
                h.view.translationY = 0f
                h.view.scaleX = 1f
                h.view.scaleY = 1f
                h.view.translationZ = 0f
                h.view.chrome = true
                h.view.badgeStart = rtl
                cell.setOnClickListener { if (labels) open(h) else select(h) }
                cell.setOnLongClickListener {
                    tick(it)
                    open(h)
                    true
                }
                cell.contentDescription = h.title
                root.addView(cell, FrameLayout.LayoutParams(size, -2))
                cells[h] = cell
                if (from != null) {
                    cell.translationX = from.first.toFloat()
                    cell.translationY = (from.second - screen().top).toFloat()
                    cell.alpha = if (i < 3) 1f else 0f
                } else {
                    cell.translationX = x + stepX()
                    cell.translationY = top
                    cell.alpha = 0f
                }
            }
            val c = cell
            if (animate) {
                c.animate().alpha(1f).setDuration(200).start()
                val sx = Spring { c.translationX = it }.also { it.snap(c.translationX) }
                val sy = Spring { c.translationY = it }.also { it.snap(c.translationY) }
                main.postDelayed({ sx.to(x); sy.to(top) }, if (from != null) i * 16L else 0L)
            } else {
                c.translationX = x
                c.translationY = top
                c.alpha = 1f
            }
        }
        if (root === cardWin) emit(JSONObject().put("t", "layout").put("layout", layoutJson()))
    }

    private fun select(h: Head, quiet: Boolean = false) {
        if (selected === h && !quiet) {
            collapse(animate = true)
            return
        }
        selected = h
        h.seenAt = System.currentTimeMillis()
        h.view.count = 0
        if (!quiet) tick(h.view)
        emit(JSONObject().put("t", "select").put("key", h.key).put("layout", layoutJson()))
    }

    fun selectKey(key: String) = main.post { heads.firstOrNull { it.key == key }?.let { select(it, quiet = true) } }

    private fun watchKeyboard(root: View) {
        val update = { insets: WindowInsets ->
            if (Build.VERSION.SDK_INT >= 30) {
                ime = insets.getInsets(WindowInsets.Type.ime()).bottom
                nav = insets.getInsets(WindowInsets.Type.systemBars()).bottom
            } else {
                @Suppress("DEPRECATION")
                nav = insets.systemWindowInsetBottom
            }
            val dens = app.resources.displayMetrics.density
            emit(JSONObject().put("t", "insets").put("ime", ime / dens).put("nav", nav / dens))
        }
        root.setOnApplyWindowInsetsListener { _, insets -> update(insets); insets }
        if (Build.VERSION.SDK_INT >= 30) {
            root.setWindowInsetsAnimationCallback(object : WindowInsetsAnimation.Callback(DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
                override fun onProgress(insets: WindowInsets, running: MutableList<WindowInsetsAnimation>): WindowInsets {
                    update(insets)
                    return insets
                }
            })
        }
    }

    fun keyboard(show: Boolean) = main.post {
        val f = fan ?: return@post
        if (!show) runCatching { imm.hideSoftInputFromWindow(f.windowToken, 0) }
    }

    private fun catchBack(root: View) {
        if (Build.VERSION.SDK_INT < 33) return
        root.post {
            val d = root.findOnBackInvokedDispatcher() ?: return@post
            val cb = android.window.OnBackInvokedCallback { if (fan != null) emit(JSONObject().put("t", "back")) }
            d.registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_OVERLAY, cb)
            backCb = cb
        }
    }

    private fun releaseBack(root: View) {
        if (Build.VERSION.SDK_INT < 33) return
        val cb = backCb as? android.window.OnBackInvokedCallback ?: return
        backCb = null
        runCatching { root.findOnBackInvokedDispatcher()?.unregisterOnBackInvokedCallback(cb) }
    }

    private fun label(text: String, sp: Float, alpha: Float) = TextView(app).apply {
        this.text = text
        textSize = sp
        typeface = fonts.semibold
        setTextColor(Color.WHITE)
        this.alpha = alpha
        gravity = Gravity.CENTER_HORIZONTAL
        maxLines = 1
        ellipsize = TextUtils.TruncateAt.END
        setShadowLayer(app.dp(3f), 0f, app.dp(1f), 0xAA000000.toInt())
        setPadding(d(2f), 0, d(2f), 0)
    }

    private fun cardFlags(lp: WindowManager.LayoutParams, on: Boolean) {
        val off = WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
        lp.flags = if (on) lp.flags and off.inv() or WindowManager.LayoutParams.FLAG_DIM_BEHIND
        else (lp.flags or off) and WindowManager.LayoutParams.FLAG_DIM_BEHIND.inv()
        lp.dimAmount = 0.5f
        lp.alpha = if (on) 1f else 0f
    }

    private fun showCard(): FrameLayout? {
        val existing = cardWin
        val lp = cardLp
        if (existing != null && lp != null && cardView != null) {
            cardFlags(lp, true)
            runCatching { wm.updateViewLayout(existing, lp) }
            surface?.frames(true)
            emit(JSONObject().put("t", "open"))
            catchBack(existing)
            return existing
        }
        val v = surface?.start("MlemHeadsCard", Bundle())
        if (v == null) {
            surfaceBroken = true
            return null
        }
        val root = FrameLayout(app).apply { clipChildren = false }
        root.addView(v, FrameLayout.LayoutParams(-1, -1))
        val flp = params(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, true, focus = true).apply {
            y = screen().top
            height = screen().height()
        }
        cardView = v
        cardFlags(flp, true)
        wm.addView(root, flp)
        cardWin = root
        cardLp = flp
        root.post { if (surface?.run() != true) { surfaceBroken = true; collapse() } }
        watchKeyboard(root)
        catchBack(root)
        return root
    }

    private fun hideCard() {
        val w = cardWin ?: return
        val lp = cardLp ?: return
        cardFlags(lp, false)
        runCatching { wm.updateViewLayout(w, lp) }
        if (!foreground) surface?.frames(false)
    }

    private fun endSurface() {
        if (cardView == null) return
        cardView = null
        surface?.stop()
        if (!foreground) surface?.frames(false)
    }

    fun collapseFromJs() = main.post { collapse(animate = true) }

    private fun collapse(animate: Boolean = false) {
        val root = fan ?: return
        fan = null
        runCatching { imm.hideSoftInputFromWindow(root.windowToken, 0) }
        releaseBack(root)
        emit(JSONObject().put("t", "leave"))
        selected = null
        ime = 0
        val folding = cells.toMap()
        cells.clear()
        cellX.clear()
        val done = {
            for ((h, cell) in folding) {
                (h.view.parent as? ViewGroup)?.removeView(h.view)
                (cell.parent as? ViewGroup)?.removeView(cell)
            }
            if (root === cardWin) hideCard() else runCatching { wm.removeView(root) }
            for (h in heads) h.view.count = h.unread()
            sync()
        }
        if (!animate || !root.isAttachedToWindow || folding.isEmpty()) {
            done()
            return
        }
        if (anchorY < 0) anchorY = (screen().height() * 0.28f).toInt()
        val toX = edgeX(left).toFloat()
        val toY = (clampY(anchorY) - screen().top).toFloat()
        for ((i, cell) in folding.values.withIndex()) {
            cell.isEnabled = false
            cell.setOnClickListener(null)
            cell.setOnLongClickListener(null)
            Spring { cell.translationX = it }.also { it.snap(cell.translationX) }.to(toX)
            Spring { cell.translationY = it }.also { it.snap(cell.translationY) }.to(toY + min(i, 2) * step)
        }
        main.postDelayed(done, 260)
    }

    fun reply(key: String, text: String): Boolean {
        val h = heads.firstOrNull { it.key == key } ?: return false
        h.repliedAt = System.currentTimeMillis()
        if (h.test) return true
        val a = h.reply ?: return false
        return runCatching {
            val i = Intent()
            val b = Bundle()
            a.remoteInputs.forEach { b.putCharSequence(it.resultKey, text) }
            RemoteInput.addResultsToIntent(a.remoteInputs, i, b)
            if (Build.VERSION.SDK_INT >= 28) RemoteInput.setResultsSource(i, RemoteInput.SOURCE_FREE_FORM_INPUT)
            a.actionIntent.send(app, 0, i)
        }.isSuccess
    }

    fun replied(key: String) = main.post { heads.firstOrNull { it.key == key }?.let { it.repliedAt = System.currentTimeMillis() } }

    fun test(n: Int) = main.post {
        val names = listOf("mia", "leo", "study group", "nova", "sam")
        val name = names[n % names.size]
        val me = Person.Builder().setName("you").setKey("me").build()
        val them = Person.Builder().setName(name).setKey("test-$name").build()
        val style = Notification.MessagingStyle(me)
            .addMessage("hey", System.currentTimeMillis() - 2000, them)
            .addMessage("are you there", System.currentTimeMillis(), them)
        if (name == "study group") style.setConversationTitle(name).setGroupConversation(true)
        val launch = app.packageManager.getLaunchIntentForPackage(app.packageName)
        val pi = launch?.let { PendingIntent.getActivity(app, 7100 + n, it, PendingIntent.FLAG_IMMUTABLE) }
        @Suppress("DEPRECATION")
        val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(app, "mlemheads") else Notification.Builder(app)
        val note = b.setSmallIcon(android.R.drawable.sym_action_chat)
            .setStyle(style)
            .setCategory(Notification.CATEGORY_MESSAGE)
            .setContentIntent(pi)
            .setShortcutId("mlemheads-test-$n")
            .build()
        posted("mlemheads-test-$n", 0, note, test = true)
    }

    override fun onActivityStarted(a: Activity) {
        started.add(a)
        if (!foreground) {
            foreground = true
            if (fan != null) collapse()
            heads.filter { it.test }.forEach { heads.remove(it) }
            sync()
        }
    }

    override fun onActivityStopped(a: Activity) {
        started.remove(a)
        if (started.isEmpty() && foreground) {
            foreground = false
            sync()
        }
    }

    override fun onActivityCreated(a: Activity, b: Bundle?) {}
    override fun onActivityResumed(a: Activity) {
        main.postDelayed({ surface?.learn() }, 2_000)
    }
    override fun onActivityPaused(a: Activity) {}
    override fun onActivitySaveInstanceState(a: Activity, b: Bundle) {}
    override fun onActivityDestroyed(a: Activity) {}
}
