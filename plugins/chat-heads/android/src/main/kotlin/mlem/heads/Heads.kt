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
import android.content.Context
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
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
import java.io.File
import kotlin.math.abs
import kotlin.math.hypot

private const val MAX = 5

class Head(val key: String, val view: HeadView) {
    var title = ""
    var text = ""
    var group = false
    var intent: PendingIntent? = null
    var test = false
}

class Opts(var dms: Boolean = true, var groups: Boolean = true, var preview: Boolean = false, var haptics: Boolean = true)

@SuppressLint("ClickableViewAccessibility")
class Heads(private val app: Context, private val storage: File) : Application.ActivityLifecycleCallbacks {
    private val main = Handler(Looper.getMainLooper())
    private val wm = app.getSystemService(WindowManager::class.java)
    private val mark by lazy {
        runCatching {
            val id = app.resources.getIdentifier("ic_notification_24dp", "drawable", app.packageName)
            app.resources.getDrawable(id, null).mutate().apply { setTint(Color.WHITE) }
        }.getOrNull()
    }
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

    private val sample = HeadView(app, null)
    private val size = sample.size
    private val step = app.dp(4f).toInt()

    private var stack: FrameLayout? = null
    private var stackLp: WindowManager.LayoutParams? = null
    private var fan: FrameLayout? = null
    private var target: TargetView? = null
    private var targetLp: WindowManager.LayoutParams? = null
    private var mover: ValueAnimator? = null

    private var left = false
    private var anchorY = -1

    private val application = (app as? Application) ?: runCatching {
        Class.forName("android.app.ActivityThread").getMethod("currentApplication").invoke(null) as Application
    }.getOrNull()

    init {
        application?.registerActivityLifecycleCallbacks(this)
    }

    fun allowed() = Settings.canDrawOverlays(app)

    fun close() = main.post {
        application?.unregisterActivityLifecycleCallbacks(this)
        started.clear()
        heads.clear()
        byTag.clear()
        sync()
    }

    private fun options(): Opts {
        val f = File(storage, "storage.json")
        val stamp = if (f.exists()) f.lastModified() else 0L
        if (stamp != optsStamp) {
            optsStamp = stamp
            opts = runCatching {
                val j = JSONObject(f.readText())
                val o = j.optJSONObject("data") ?: j
                Opts(o.optBoolean("dms", true), o.optBoolean("groups", true), o.optBoolean("preview", false), o.optBoolean("haptics", true))
            }.getOrDefault(Opts())
        }
        return opts
    }

    fun posted(tag: String?, id: Int, n: Notification, test: Boolean = false) {
        val msg = runCatching { read(app, tag, id, n, sample.size) }.getOrNull() ?: return
        main.post { add(msg, "${tag.orEmpty()}|$id", test) }
    }

    fun cancelled(tag: String?, id: Int) = main.post {
        val key = byTag.remove("${tag.orEmpty()}|$id") ?: return@post
        remove(key)
    }

    fun cancelledAll() = main.post {
        heads.removeAll { !it.test }
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
            while (heads.size > MAX) heads.removeAt(0)
        }
        head.title = msg.title
        head.text = msg.text
        head.group = msg.group
        head.intent = msg.intent
        head.test = test
        head.view.title = msg.title
        head.view.avatar = msg.avatar ?: head.view.avatar
        head.view.count = msg.count
        head.view.contentDescription = msg.title
        if (fan != null) {
            collapse()
        }
        sync()
        if (!fresh) pop(head.view) else if (stack != null) enter(head.view)
    }

    private fun remove(key: String) {
        heads.removeAll { it.key == key }
        sync()
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
        fan?.let { runCatching { wm.removeView(it) } }
        fan = null
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

    private fun params(w: Int, h: Int, touch: Boolean) = WindowManager.LayoutParams(
        w, h,
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
            (if (touch) 0 else WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE),
        PixelFormat.TRANSLUCENT,
    ).apply {
        gravity = Gravity.TOP or Gravity.START
        layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
        if (Build.VERSION.SDK_INT >= 30) fitInsetsTypes = 0
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

    private fun buzz(v: View, confirm: Boolean) {
        if (!options().haptics) return
        val kind = if (confirm && Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.CLOCK_TICK
        v.performHapticFeedback(kind)
    }

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
        private var tracker: VelocityTracker? = null
        private val slop = ViewConfiguration.get(app).scaledTouchSlop

        override fun onTouch(v: View, e: MotionEvent): Boolean {
            val lp = stackLp ?: return false
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    mover?.cancel()
                    downX = e.rawX
                    downY = e.rawY
                    startX = lp.x
                    startY = lp.y
                    dragging = false
                    snapped = false
                    tracker?.recycle()
                    tracker = VelocityTracker.obtain()
                    tracker?.addMovement(e)
                    v.animate().scaleX(0.94f).scaleY(0.94f).setDuration(90).start()
                }
                MotionEvent.ACTION_MOVE -> {
                    tracker?.addMovement(e)
                    val dx = e.rawX - downX
                    val dy = e.rawY - downY
                    if (!dragging && hypot(dx, dy) > slop) {
                        dragging = true
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
                        buzz(v, false)
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
                        buzz(v, true)
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
        if (heads.size == 1) open(heads[0]) else expand()
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
                it.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                runCatching { app.startActivity(it) }
            }
        }
        if (fan != null) collapse() else sync()
    }

    private fun expand() {
        val lp = stackLp ?: return
        val from = Pair(lp.x, lp.y)
        stack?.let { runCatching { wm.removeView(it) } }
        stack = null
        stackLp = null

        val root = FrameLayout(app).apply { clipChildren = false }
        val scrim = View(app).apply {
            setBackgroundColor(0x99000000.toInt())
            alpha = 0f
            setOnClickListener { collapse() }
        }
        root.addView(scrim, FrameLayout.LayoutParams(-1, -1))
        wm.addView(root, params(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, true).apply {
            y = screen().top
            height = screen().height()
        })
        fan = root
        scrim.animate().alpha(1f).setDuration(200).start()

        val s = safe()
        val o = options()
        val order = heads.reversed()
        val stepX = size - app.dp(6f).toInt()
        val top = s.top + app.dp(8f).toInt()
        for ((i, h) in order.withIndex()) {
            (h.view.parent as? ViewGroup)?.removeView(h.view)
            val cell = LinearLayout(app).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                clipChildren = false
            }
            cell.addView(h.view, LinearLayout.LayoutParams(size, size))
            cell.addView(label(h.title, 12f, 1f), LinearLayout.LayoutParams(size, -2))
            if (o.preview && h.text.isNotEmpty()) cell.addView(label(h.text, 11f, 0.75f), LinearLayout.LayoutParams(size, -2))
            h.view.translationY = 0f
            h.view.chrome = true
            cell.setOnClickListener { open(h) }
            val x = s.right - size - i * stepX + sample.pad.toInt() - app.dp(4f).toInt()
            root.addView(cell, FrameLayout.LayoutParams(size, -2))
            cell.translationX = from.first.toFloat()
            cell.translationY = (from.second - screen().top).toFloat()
            cell.alpha = if (i < 3) 1f else 0f
            cell.animate().translationX(x.toFloat()).translationY(top.toFloat()).alpha(1f)
                .setStartDelay(i * 25L).setDuration(340).setInterpolator(OvershootInterpolator(1.1f)).start()
        }
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

    private fun collapse() {
        val root = fan ?: return
        fan = null
        for (h in heads) (h.view.parent as? ViewGroup)?.removeView(h.view)
        runCatching { wm.removeView(root) }
        sync()
    }

    fun test(n: Int) = main.post {
        val names = listOf("mia", "leo", "study group", "nova", "sam")
        val name = names[n % names.size]
        val me = Person.Builder().setName("you").build()
        val them = Person.Builder().setName(name).build()
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
            heads.removeAll { it.test }
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
