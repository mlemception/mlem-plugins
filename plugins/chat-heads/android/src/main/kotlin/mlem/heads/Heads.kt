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
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.TextUtils
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsAnimation
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.view.inputmethod.InputMethodManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.abs
import kotlin.math.hypot
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
    var selfName = ""
    val pending = ArrayList<Pending>()
    var draft = ""
    var repliedAt = 0L
    var seenAt = 0L
    private val faces = HashMap<String, Bitmap>()

    fun avatarFor(key: String) = faces[key]

    fun merge(fresh: List<Line>) {
        fresh.forEach { l -> l.avatar?.let { faces[l.senderKey] = it } }
        val seen = HashSet<String>()
        lines = (lines + fresh).filter { seen.add("${it.senderKey}|${it.time}|${it.text}") }.sortedBy { it.time }.takeLast(40)
        val cutoff = System.currentTimeMillis() - 30 * 60_000
        pending.removeAll { it.state == Pending.SENT && it.time < cutoff }
    }

    fun unread(): Int {
        if (lines.isEmpty()) return if (test) 2 else 1
        val mine = max(lines.lastOrNull { it.mine }?.time ?: 0, pending.filter { it.state != Pending.FAILED }.maxOfOrNull { it.time } ?: 0)
        val from = max(mine, seenAt)
        return lines.count { !it.mine && it.time > from }
    }

    fun timeline(): List<Row> {
        val rows = lines.map { Row(it, null) }.toMutableList()
        for (p in pending) {
            if (p.state == Pending.SENT && lines.any { it.mine && it.text.trim() == p.text && it.time >= p.time - 60_000 }) continue
            rows.add(Row(Line("me", selfName, p.text, p.time, true, null), p))
        }
        return rows.sortedBy { it.line.time }
    }
}

class Opts(
    var dms: Boolean = true,
    var groups: Boolean = true,
    var quick: Boolean = true,
    var preview: Boolean = false,
    var haptics: Boolean = true,
)

private class FanRoot(context: Context, val back: () -> Unit) : FrameLayout(context) {
    override fun dispatchKeyEvent(e: KeyEvent): Boolean {
        if (e.keyCode == KeyEvent.KEYCODE_BACK) {
            if (e.action == KeyEvent.ACTION_UP) back()
            return true
        }
        return super.dispatchKeyEvent(e)
    }
}

@SuppressLint("ClickableViewAccessibility")
class Heads(private val app: Context, private val storage: File) : Application.ActivityLifecycleCallbacks, CardHost {
    private val main = Handler(Looper.getMainLooper())
    private val wm = app.getSystemService(WindowManager::class.java)
    private val imm = app.getSystemService(InputMethodManager::class.java)
    private val mark by lazy {
        runCatching {
            val id = app.resources.getIdentifier("ic_notification_24dp", "drawable", app.packageName)
            app.resources.getDrawable(id, null).mutate().apply { setTint(Color.WHITE) }
        }.getOrNull()
    }
    private val fonts by lazy { Fonts(app) }
    private val heads = ArrayList<Head>()
    private val byTag = HashMap<String, String>()

    private val started = HashSet<Activity>()
    private var foreground = run {
        val info = ActivityManager.RunningAppProcessInfo()
        ActivityManager.getMyMemoryState(info)
        info.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
    }

    private var opts = Opts()
    private var optsStamp = -1L
    private var palette = Palette.load(storage)
    private var me = loadMe()

    private val sample = HeadView(app, null)
    private val size = sample.size
    private val step = app.dp(4f).toInt()

    private var stack: FrameLayout? = null
    private var stackLp: WindowManager.LayoutParams? = null
    private var fan: FrameLayout? = null
    private var fanLp: WindowManager.LayoutParams? = null
    private val cells = LinkedHashMap<Head, LinearLayout>()
    private val cellX = HashMap<Head, Float>()
    private var card: Card? = null
    private var selected: Head? = null
    private var backCb: Any? = null
    private var ime = 0
    private var nav = 0
    private var target: TargetView? = null
    private var targetLp: WindowManager.LayoutParams? = null
    private var mover: ValueAnimator? = null

    private var left = false
    private var anchorY = -1

    private val application = (app as? Application) ?: runCatching {
        Class.forName("android.app.ActivityThread").getMethod("currentApplication").invoke(null) as Application
    }.getOrNull()

    private val dismiss = object : android.content.BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            if (fan != null) main.post { collapse(animate = true) }
        }
    }

    init {
        application?.registerActivityLifecycleCallbacks(this)
        runCatching {
            @Suppress("DEPRECATION")
            val f = android.content.IntentFilter(Intent.ACTION_CLOSE_SYSTEM_DIALOGS)
            if (Build.VERSION.SDK_INT >= 33) app.registerReceiver(dismiss, f, Context.RECEIVER_EXPORTED) else app.registerReceiver(dismiss, f)
        }
    }

    fun allowed() = Settings.canDrawOverlays(app)

    fun close() = main.post {
        application?.unregisterActivityLifecycleCallbacks(this)
        runCatching { app.unregisterReceiver(dismiss) }
        started.clear()
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

    fun theme(json: String) {
        val p = runCatching { Palette.from(JSONObject(json)) }.getOrNull() ?: return
        runCatching { File(storage, "theme.json").writeText(json) }
        main.post {
            palette = p
            card?.let { it.pal = p; it.apply() }
        }
    }

    private fun loadMe(): Me {
        val name = runCatching { JSONObject(File(storage, "me.json").readText()).optString("name") }.getOrDefault("")
        val bmp = runCatching { BitmapFactory.decodeFile(File(storage, "me.png").path) }.getOrNull()
        return Me(name, bmp)
    }

    fun me(name: String, avatar: String?) {
        Thread {
            val bmp = avatar?.takeIf { it.startsWith("https://") }?.let { url ->
                runCatching {
                    val c = URL(url).openConnection() as HttpURLConnection
                    c.connectTimeout = 8000
                    c.readTimeout = 8000
                    c.inputStream.use { BitmapFactory.decodeStream(it) }
                }.getOrNull()
            }
            runCatching {
                File(storage, "me.json").writeText(JSONObject().put("name", name).toString())
                bmp?.let { b -> File(storage, "me.png").outputStream().use { b.compress(Bitmap.CompressFormat.PNG, 100, it) } }
            }
            main.post {
                me = Me(name, bmp ?: me.avatar)
                card?.let { it.me = me; it.refresh() }
            }
        }.start()
    }

    fun posted(tag: String?, id: Int, n: Notification, test: Boolean = false) {
        val msg = runCatching { read(app, tag, id, n, sample.size) }.getOrNull() ?: return
        main.post { add(msg, "${tag.orEmpty()}|$id", test) }
    }

    fun cancelled(tag: String?, id: Int) = main.post {
        val key = byTag.remove("${tag.orEmpty()}|$id") ?: return@post
        val h = heads.firstOrNull { it.key == key } ?: return@post
        val busy = h === selected || System.currentTimeMillis() - h.repliedAt < 3 * 60_000
        if (busy) {
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
            head = Head(msg.key, HeadView(app, mark))
            heads.add(head)
            while (heads.size > MAX) heads.firstOrNull { it !== selected }?.let { remove(it, sync = false) } ?: break
        }
        head.title = msg.title
        head.text = msg.text
        head.group = msg.group
        head.intent = msg.intent
        head.test = test
        head.selfName = msg.selfName
        if (msg.reply != null) head.reply = msg.reply
        head.merge(msg.lines)
        head.view.title = msg.title
        head.view.avatar = msg.avatar ?: head.view.avatar
        if (head === selected && fan != null) head.seenAt = System.currentTimeMillis()
        head.view.count = head.unread()
        head.view.contentDescription = msg.title
        if (fan != null) {
            if (fresh) layoutCells(animate = true)
            if (head === selected) card?.refresh()
            if (!fresh) pop(head.view)
            return
        }
        sync()
        if (!fresh) pop(head.view) else if (stack != null) enter(head.view)
    }

    private fun remove(h: Head, sync: Boolean = true) {
        heads.remove(h)
        byTag.values.removeAll { it == h.key }
        cells.remove(h)?.let { c ->
            c.animate().alpha(0f).scaleX(0.6f).scaleY(0.6f).setDuration(160).withEndAction { (c.parent as? ViewGroup)?.removeView(c) }.start()
        }
        cellX.remove(h)
        if (h === selected) selected = null
        if (!sync) return
        if (fan != null) {
            if (heads.isEmpty()) collapse(animate = true) else { layoutCells(animate = true); if (selected == null) heads.lastOrNull()?.let { select(it) } }
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
        root.removeAllViews()
        val shown = heads.takeLast(3)
        for ((i, h) in shown.withIndex()) {
            (h.view.parent as? ViewGroup)?.removeView(h.view)
            h.view.translationX = 0f
            h.view.translationY = ((shown.size - 1 - i) * step).toFloat()
            h.view.scaleX = 1f
            h.view.scaleY = 1f
            h.view.alpha = 1f
            h.view.chrome = i == shown.size - 1
            root.addView(h.view, FrameLayout.LayoutParams(size, size))
        }
    }

    private fun drop() {
        mover?.cancel()
        stack?.let { runCatching { wm.removeView(it) } }
        stack = null
        stackLp = null
        fan?.let { f ->
            runCatching { imm.hideSoftInputFromWindow(f.windowToken, 0) }
            runCatching { wm.removeView(f) }
        }
        fan = null
        fanLp = null
        cells.clear()
        cellX.clear()
        card = null
        selected = null
        hideTarget(now = true)
    }

    private fun screen(): Rect {
        if (Build.VERSION.SDK_INT >= 30) return wm.currentWindowMetrics.bounds
        val m = app.resources.displayMetrics
        return Rect(0, 0, m.widthPixels, m.heightPixels)
    }

    private fun safe(): Rect {
        val s = screen()
        if (Build.VERSION.SDK_INT >= 30) {
            val i = wm.currentWindowMetrics.windowInsets.getInsetsIgnoringVisibility(
                WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout()
            )
            return Rect(s.left + i.left, s.top + i.top, s.right - i.right, s.bottom - i.bottom)
        }
        return s
    }

    private fun params(w: Int, h: Int, touch: Boolean, focus: Boolean = false) = WindowManager.LayoutParams(
        w, h,
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
        (if (focus) 0 else WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE) or
            WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
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
        val inset = sample.pad.toInt() - app.dp(4f).toInt()
        return if (left) s.left - inset else s.right - size + inset
    }

    private fun clampY(y: Int): Int {
        val s = safe()
        return y.coerceIn(s.top - sample.pad.toInt(), s.bottom - size - step * 2)
    }

    private fun makeStack(): FrameLayout {
        val root = FrameLayout(app).apply { clipChildren = false; clipToPadding = false }
        if (anchorY < 0) anchorY = (screen().height() * 0.28f).toInt()
        val lp = params(size, size + step * 2, true).apply {
            x = edgeX(left)
            y = clampY(anchorY)
        }
        root.setOnTouchListener(Drag())
        wm.addView(root, lp)
        stack = root
        stackLp = lp
        return root
    }

    private fun enter(v: View) {
        v.scaleX = 0.5f
        v.scaleY = 0.5f
        v.alpha = 0f
        v.animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(320).setInterpolator(OvershootInterpolator(1.6f)).start()
    }

    private fun pop(v: View) {
        v.animate().scaleX(1.12f).scaleY(1.12f).setDuration(110).setInterpolator(DecelerateInterpolator()).withEndAction {
            v.animate().scaleX(1f).scaleY(1f).setDuration(220).setInterpolator(OvershootInterpolator(2f)).start()
        }.start()
    }

    private fun buzz(v: View, kind: Int) {
        if (!options().haptics) return
        v.performHapticFeedback(kind)
    }

    private fun confirmKind() = if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY

    private fun moveStack(toX: Int, toY: Int, ms: Long, overshoot: Boolean, done: (() -> Unit)? = null) {
        val root = stack ?: return
        val lp = stackLp ?: return
        mover?.cancel()
        val fx = lp.x
        val fy = lp.y
        mover = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = ms
            interpolator = if (overshoot) OvershootInterpolator(0.9f) else DecelerateInterpolator(1.6f)
            addUpdateListener {
                val t = it.animatedValue as Float
                lp.x = (fx + (toX - fx) * t).toInt()
                lp.y = (fy + (toY - fy) * t).toInt()
                if (root.isAttachedToWindow) wm.updateViewLayout(root, lp)
            }
            if (done != null) addListener(object : android.animation.AnimatorListenerAdapter() {
                override fun onAnimationEnd(a: android.animation.Animator) = done()
            })
            start()
        }
    }

    private fun showTarget() {
        if (target != null) return
        val s = screen()
        val h = app.dp(220f).toInt()
        val v = TargetView(app)
        val lp = params(ViewGroup.LayoutParams.MATCH_PARENT, h, false).apply { y = s.bottom - h }
        v.alpha = 0f
        v.translationY = app.dp(24f)
        wm.addView(v, lp)
        v.animate().alpha(1f).translationY(0f).setDuration(180).start()
        target = v
        targetLp = lp
    }

    private fun hideTarget(now: Boolean = false) {
        val v = target ?: return
        target = null
        if (now) {
            runCatching { wm.removeView(v) }
            return
        }
        v.animate().alpha(0f).translationY(app.dp(24f)).setDuration(160).withEndAction {
            runCatching { wm.removeView(v) }
        }.start()
    }

    private fun targetSpot(): Pair<Int, Int>? {
        val v = target ?: return null
        val lp = targetLp ?: return null
        val cx = screen().width() / 2
        val cy = lp.y + v.centerY().toInt()
        val half = size / 2
        return Pair(cx - half, cy - half - step * 2)
    }

    private inner class Drag : View.OnTouchListener {
        private var downX = 0f
        private var downY = 0f
        private var startX = 0
        private var startY = 0
        private var dragging = false
        private var snapped = false
        private var held = false
        private var tracker: VelocityTracker? = null
        private val slop = ViewConfiguration.get(app).scaledTouchSlop
        private var root: View? = null
        private val hold = Runnable {
            if (dragging) return@Runnable
            held = true
            root?.let {
                buzz(it, HapticFeedbackConstants.LONG_PRESS)
                it.animate().scaleX(1f).scaleY(1f).setDuration(120).start()
            }
            heads.lastOrNull()?.let { open(it) }
        }

        override fun onTouch(v: View, e: MotionEvent): Boolean {
            val lp = stackLp ?: return false
            root = v
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    mover?.cancel()
                    downX = e.rawX
                    downY = e.rawY
                    startX = lp.x
                    startY = lp.y
                    dragging = false
                    snapped = false
                    held = false
                    tracker?.recycle()
                    tracker = VelocityTracker.obtain()
                    tracker?.addMovement(e)
                    v.animate().scaleX(0.94f).scaleY(0.94f).setDuration(90).start()
                    v.postDelayed(hold, ViewConfiguration.getLongPressTimeout().toLong())
                }
                MotionEvent.ACTION_MOVE -> {
                    if (held) return true
                    tracker?.addMovement(e)
                    val dx = e.rawX - downX
                    val dy = e.rawY - downY
                    if (!dragging && hypot(dx, dy) > slop) {
                        dragging = true
                        v.removeCallbacks(hold)
                        v.animate().scaleX(1f).scaleY(1f).setDuration(120).start()
                        showTarget()
                    }
                    if (!dragging) return true
                    val x = (startX + dx).toInt()
                    val y = (startY + dy).toInt()
                    val spot = targetSpot()
                    val near = spot != null && hypot((x - spot.first).toFloat(), (y - spot.second).toFloat()) < app.dp(96f)
                    if (near && !snapped) {
                        snapped = true
                        buzz(v, HapticFeedbackConstants.CLOCK_TICK)
                        target?.let { t -> ValueAnimator.ofFloat(t.hot, 1f).apply { duration = 140; addUpdateListener { t.hot = it.animatedValue as Float }; start() } }
                        moveStack(spot!!.first, spot.second, 140, false)
                    } else if (!near && snapped) {
                        snapped = false
                        target?.let { t -> ValueAnimator.ofFloat(t.hot, 0f).apply { duration = 140; addUpdateListener { t.hot = it.animatedValue as Float }; start() } }
                    }
                    if (!snapped) {
                        mover?.cancel()
                        lp.x = x
                        lp.y = y
                        wm.updateViewLayout(v, lp)
                    }
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    v.removeCallbacks(hold)
                    if (held) return true
                    tracker?.addMovement(e)
                    tracker?.computeCurrentVelocity(1000)
                    val vx = tracker?.xVelocity ?: 0f
                    val vy = tracker?.yVelocity ?: 0f
                    tracker?.recycle()
                    tracker = null
                    v.animate().scaleX(1f).scaleY(1f).setDuration(120).start()
                    if (!dragging) {
                        if (e.actionMasked == MotionEvent.ACTION_UP) tap()
                        return true
                    }
                    if (snapped) {
                        buzz(v, confirmKind())
                        v.animate().scaleX(0.2f).scaleY(0.2f).alpha(0f).setDuration(180).withEndAction {
                            heads.clear()
                            byTag.clear()
                            sync()
                        }.start()
                        hideTarget()
                        return true
                    }
                    hideTarget()
                    val center = lp.x + size / 2 + vx * 0.12f
                    left = center < screen().width() / 2
                    anchorY = clampY((lp.y + vy * 0.12f).toInt())
                    val fast = abs(vx) > 1500 || abs(vy) > 1500
                    moveStack(edgeX(left), anchorY, if (fast) 420 else 340, true)
                }
            }
            return true
        }
    }

    private fun tap() {
        if (options().quick) expand() else if (heads.size == 1) open(heads[0]) else expand()
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

    private fun rowTop() = safe().top + app.dp(8f).toInt()
    private fun stepX() = size - app.dp(6f).toInt()
    private fun cardWidth() = min(screen().width() - app.dp(24f).toInt(), app.dp(440f).toInt())
    private fun cardLeft() = screen().width() - app.dp(12f).toInt() - cardWidth()
    private fun cardTop() = rowTop() + sample.pad.toInt() + sample.face.toInt() + app.dp(10f).toInt()

    private fun expand() {
        val lp = stackLp ?: return
        val from = Pair(lp.x, lp.y)
        stack?.let { runCatching { wm.removeView(it) } }
        stack = null
        stackLp = null
        val quick = options().quick

        val root = FanRoot(app) { if (fan != null) collapse(animate = true) }.apply { clipChildren = false }
        val scrim = View(app).apply {
            setBackgroundColor(0x99000000.toInt())
            alpha = 0f
            setOnClickListener { collapse(animate = true) }
        }
        root.addView(scrim, FrameLayout.LayoutParams(-1, -1))
        val flp = params(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, true, focus = quick).apply {
            y = screen().top
            height = screen().height()
        }
        wm.addView(root, flp)
        fan = root
        fanLp = flp
        scrim.animate().alpha(1f).setDuration(200).start()

        cells.clear()
        cellX.clear()

        val c = if (quick) Card(app, fonts, this).also { it.pal = palette; it.me = me; it.apply() } else null
        if (c != null) {
            card = c
            root.addView(c.root, FrameLayout.LayoutParams(cardWidth(), ViewGroup.LayoutParams.WRAP_CONTENT))
            c.root.translationX = cardLeft().toFloat()
            c.root.translationY = cardTop().toFloat()
            c.prepare()
        }
        layoutCells(animate = true, from = from)
        if (c != null) {
            watchKeyboard(root)
            catchBack(root)
            heads.lastOrNull()?.let { select(it, first = true) }
            c.enter(delay = 150)
        }
    }

    private fun layoutCells(animate: Boolean, from: Pair<Int, Int>? = null) {
        val root = fan ?: return
        val s = safe()
        val quick = options().quick
        val o = options()
        val order = heads.reversed()
        val top = rowTop()
        for ((i, h) in order.withIndex().reversed()) {
            var cell = cells[h]
            val x = (s.right - size - i * stepX() + sample.pad.toInt() - app.dp(4f).toInt()).toFloat()
            cellX[h] = x
            if (cell == null) {
                (h.view.parent as? ViewGroup)?.removeView(h.view)
                cell = LinearLayout(app).apply {
                    orientation = LinearLayout.VERTICAL
                    gravity = Gravity.CENTER_HORIZONTAL
                    clipChildren = false
                }
                cell.addView(h.view, LinearLayout.LayoutParams(size, size))
                if (!quick) {
                    cell.addView(label(h.title, 12f, 1f), LinearLayout.LayoutParams(size, -2))
                    if (o.preview && h.text.isNotEmpty()) cell.addView(label(h.text, 11f, 0.75f), LinearLayout.LayoutParams(size, -2))
                }
                h.view.translationY = 0f
                h.view.chrome = true
                cell.setOnClickListener { if (quick) select(h) else open(h) }
                cell.setOnLongClickListener {
                    buzz(it, HapticFeedbackConstants.LONG_PRESS)
                    open(h)
                    true
                }
                root.addView(cell, FrameLayout.LayoutParams(size, -2))
                cells[h] = cell
                if (from != null) {
                    cell.translationX = from.first.toFloat()
                    cell.translationY = (from.second - screen().top).toFloat()
                    cell.alpha = if (i < 3) 1f else 0f
                } else {
                    cell.translationX = x + stepX()
                    cell.translationY = top.toFloat()
                    cell.alpha = 0f
                }
            }
            cell.tag = i
            val dim = quick && selected != null && h !== selected
            if (animate) {
                cell.animate().translationX(x).translationY(top.toFloat()).alpha(if (dim) 0.6f else 1f)
                    .setStartDelay(if (from != null) i * 25L else 0).setDuration(340).setInterpolator(OvershootInterpolator(1.1f)).start()
            } else {
                cell.translationX = x
                cell.translationY = top.toFloat()
                cell.alpha = if (dim) 0.6f else 1f
            }
        }
        selected?.let { sel -> cellX[sel]?.let { card?.moveCaret(it + size / 2f - cardLeft(), animate) } }
    }

    private fun select(h: Head, first: Boolean = false) {
        val c = card ?: return
        if (selected === h && !first) {
            collapse(animate = true)
            return
        }
        selected = h
        h.seenAt = System.currentTimeMillis()
        h.view.count = h.unread()
        for ((hh, cell) in cells) {
            cell.animate().alpha(if (hh === h) 1f else 0.6f).setDuration(180).start()
        }
        val x = (cellX[h] ?: 0f) + size / 2f - cardLeft()
        c.bind(h, x, animate = !first)
        if (!first) buzz(h.view, HapticFeedbackConstants.CLOCK_TICK)
    }

    private fun watchKeyboard(root: View) {
        val update = { insets: WindowInsets ->
            if (Build.VERSION.SDK_INT >= 30) {
                ime = insets.getInsets(WindowInsets.Type.ime()).bottom
                nav = insets.getInsets(WindowInsets.Type.systemBars()).bottom
            } else {
                @Suppress("DEPRECATION")
                nav = insets.systemWindowInsetBottom
            }
            room()
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
        room()
    }

    private fun room() {
        val c = card ?: return
        val bottom = screen().height() - max(ime, nav) - app.dp(12f).toInt()
        c.maxHeight = min(bottom - cardTop(), (screen().height() * 0.62f).toInt())
    }

    private fun catchBack(root: View) {
        if (Build.VERSION.SDK_INT < 33) return
        root.post {
            val d = root.findOnBackInvokedDispatcher() ?: return@post
            val cb = android.window.OnBackInvokedCallback { if (fan != null) collapse(animate = true) }
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
        setTextColor(Color.WHITE)
        this.alpha = alpha
        gravity = Gravity.CENTER_HORIZONTAL
        maxLines = 1
        ellipsize = TextUtils.TruncateAt.END
        setShadowLayer(app.dp(3f), 0f, app.dp(1f), 0xAA000000.toInt())
        setPadding(app.dp(2f).toInt(), 0, app.dp(2f).toInt(), 0)
    }

    private fun collapse(animate: Boolean = false) {
        val root = fan ?: return
        fan = null
        fanLp = null
        runCatching { imm.hideSoftInputFromWindow(root.windowToken, 0) }
        releaseBack(root)
        val c = card
        card = null
        selected = null
        ime = 0
        val folding = cells.toMap()
        cells.clear()
        cellX.clear()
        val done = {
            runCatching { wm.removeView(root) }
            for ((h, cell) in folding) if (h.view.parent === cell) cell.removeView(h.view)
            for (h in heads) h.view.count = h.unread()
            sync()
        }
        if (!animate || !root.isAttachedToWindow || folding.isEmpty()) {
            done()
            return
        }
        c?.leave {}
        if (anchorY < 0) anchorY = (screen().height() * 0.28f).toInt()
        val toX = edgeX(left).toFloat()
        val toY = (clampY(anchorY) - screen().top).toFloat()
        root.getChildAt(0).animate().alpha(0f).setDuration(200).start()
        for ((_, cell) in folding) {
            cell.isEnabled = false
            cell.setOnClickListener(null)
            cell.setOnLongClickListener(null)
            for (j in 1 until cell.childCount) cell.getChildAt(j).animate().alpha(0f).setDuration(120).start()
            cell.animate().translationX(toX).translationY(toY + minOf((cell.tag as? Int) ?: 0, 2) * step).alpha(1f)
                .setStartDelay(if (c != null) 60 else 0).setDuration(240).setInterpolator(DecelerateInterpolator(1.6f)).start()
        }
        main.postDelayed(done, if (c != null) 310 else 250)
    }

    override fun wantKeyboard() {
        val c = card ?: return
        c.focusInput()
        main.postDelayed({ runCatching { imm.showSoftInput(c.editor, InputMethodManager.SHOW_IMPLICIT) } }, 30)
    }

    override fun openInDiscord(head: Head) {
        card?.root?.let { buzz(it, HapticFeedbackConstants.VIRTUAL_KEY) }
        open(head)
    }

    override fun send(head: Head, text: String) {
        val p = Pending(text, System.currentTimeMillis())
        head.pending.add(p)
        head.repliedAt = p.time
        head.seenAt = p.time
        head.view.count = head.unread()
        card?.refresh()
        fire(head, p)
    }

    override fun retry(head: Head, p: Pending) {
        if (p.state != Pending.FAILED) return
        p.state = Pending.SENDING
        card?.refresh()
        fire(head, p)
    }

    private fun fire(head: Head, p: Pending) {
        if (head.test) {
            main.postDelayed({ settle(head, p, true) }, 650)
            return
        }
        val a = head.reply
        val ok = a != null && runCatching {
            val i = Intent()
            val b = Bundle()
            a.remoteInputs.forEach { b.putCharSequence(it.resultKey, p.text) }
            RemoteInput.addResultsToIntent(a.remoteInputs, i, b)
            if (Build.VERSION.SDK_INT >= 28) RemoteInput.setResultsSource(i, RemoteInput.SOURCE_FREE_FORM_INPUT)
            a.actionIntent.send(app, 0, i)
        }.isSuccess
        if (!ok) {
            settle(head, p, false)
            return
        }
        main.postDelayed({ if (p.state == Pending.SENDING) settle(head, p, true) }, 15_000)
    }

    private fun settle(head: Head, p: Pending, ok: Boolean) {
        if (p.state != Pending.SENDING) return
        p.state = if (ok) Pending.SENT else Pending.FAILED
        if (head === selected) {
            card?.refresh()
            card?.root?.let { buzz(it, if (ok) HapticFeedbackConstants.CLOCK_TICK else HapticFeedbackConstants.LONG_PRESS) }
        }
        head.view.count = head.unread()
    }

    fun sent(channel: String, content: String, ok: Boolean, nonce: String?) = main.post {
        val text = content.trim()
        val candidates = heads.filter { it.key == channel } + heads.filter { it.key != channel }
        for (h in candidates) {
            val p = h.pending.firstOrNull { it.state == Pending.SENDING && it.text == text && (nonce == null || it.nonce == null || it.nonce == nonce) } ?: continue
            p.nonce = nonce
            settle(h, p, ok)
            return@post
        }
    }

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
    override fun onActivityResumed(a: Activity) {}
    override fun onActivityPaused(a: Activity) {}
    override fun onActivitySaveInstanceState(a: Activity, b: Bundle) {}
    override fun onActivityDestroyed(a: Activity) {}
}
