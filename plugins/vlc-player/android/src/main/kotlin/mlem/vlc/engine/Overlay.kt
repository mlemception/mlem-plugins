package mlem.vlc.engine

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Outline
import android.graphics.Picture
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.TextUtils
import android.util.TypedValue
import android.view.Choreographer
import android.view.GestureDetector
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.TextureView
import android.view.VelocityTracker
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import org.videolan.libvlc.Media
import org.videolan.libvlc.MediaPlayer
import org.videolan.libvlc.interfaces.IVLCVout
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

private const val scrim = 0xA6000000.toInt()
private val speeds = listOf(0.5f, 0.75f, 1f, 1.25f, 1.5f, 2f)

@SuppressLint("ViewConstructor", "ClickableViewAccessibility")
class Overlay(
    private val activity: Activity,
    private val url: String,
    title: String,
    private val engine: Engine,
    private val origin: View?,
    from: Long,
    private val onGone: () -> Unit,
) : FrameLayout(activity), IVLCVout.OnNewVideoLayoutListener {
    private val main = Handler(Looper.getMainLooper())
    private val density = resources.displayMetrics.density
    private fun dp(value: Float) = (value * density).toInt()

    private val backdrop = View(activity).apply { setBackgroundColor(Color.BLACK) }
    private val stage = FrameLayout(activity)
    private val video = TextureView(activity)
    private val shield = View(activity).apply { setBackgroundColor(Color.BLACK) }
    private val flyer = Flyer(activity)
    private val spinner = ProgressBar(activity).apply {
        indeterminateTintList = ColorStateList.valueOf(Color.WHITE)
        alpha = 0f
    }
    private val message = text("", 14f).apply {
        gravity = Gravity.CENTER
        visibility = GONE
    }
    private val hint = text("", 14f).apply {
        background = pill(scrim, 18f)
        setPadding(dp(14f), dp(7f), dp(14f), dp(7f))
        alpha = 0f
    }
    private val ripple = SeekRipple(activity)

    private val controls = FrameLayout(activity)
    private val topBar = LinearLayout(activity).apply { gravity = Gravity.CENTER_VERTICAL }
    private val bottomBar = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
    private val center = Glyph(activity, Glyph.PAUSE, 0x73000000)
    private val fitButton = Glyph(activity, Glyph.FIT, 0)
    private val rotateButton = Glyph(activity, Glyph.ROTATE, 0)
    private val bar = Bar(activity)
    private val elapsed = text("0:00", 12f).apply { fontFeatureSettings = "tnum" }
    private val total = text("0:00", 12f).apply {
        fontFeatureSettings = "tnum"
        alpha = 0.7f
    }
    private val speedLabel = text("1x", 13f)
    private val speaker = ImageView(activity).apply {
        setColorFilter(Color.WHITE)
        setPadding(dp(11f), dp(11f), dp(11f), dp(11f))
    }
    private var sheet: View? = null

    private var target: RectF? = null
    private var covered = true
    private var sized = false
    private var timed = false
    private var quickReveal = false
    private var slowReveal = false

    private var player: MediaPlayer? = null
    private var attached = false
    private var closing = false
    private var playing = false
    private var ended = false
    private var scrubbing = false
    private var length = 0L
    private var baseTime = 0L
    private var baseStamp = 0L
    private var rate = 1f
    private var videoW = 0
    private var videoH = 0
    private var sarNum = 1
    private var sarDen = 1
    private var zoom = 1f
    private var panX = 0f
    private var panY = 0f
    private var fill = false
    private var wasPlaying = false
    private var startAt = from
    private var turned = false
    private var turning = false
    private var screenW = 0
    private var screenH = 0
    private var safeL = 0
    private var safeT = 0
    private var safeR = 0
    private var safeB = 0

    private val hideControls = Runnable { setControls(false) }
    private val hideHint = Runnable { hint.animate().alpha(0f).setDuration(200).start() }
    private val showSpinner = Runnable { spinner.animate().alpha(1f).setDuration(200).start() }
    private val forceReveal = Runnable { reveal() }

    private val ticker = object : Choreographer.FrameCallback {
        override fun doFrame(frame: Long) {
            if (closing) return
            if (!scrubbing) showTime(now())
            Choreographer.getInstance().postFrameCallback(this)
        }
    }

    private val audio = activity.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val focus = if (Build.VERSION.SDK_INT >= 26) {
        AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE)
                    .build(),
            )
            .setOnAudioFocusChangeListener { change ->
                if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
                    if (playing) player?.pause()
                }
            }
            .build()
    } else null

    private val lifecycle = object : Application.ActivityLifecycleCallbacks {
        override fun onActivityPaused(a: Activity) {
            if (a !== activity) return
            wasPlaying = playing
            if (playing) player?.pause()
        }

        override fun onActivityResumed(a: Activity) {
            if (a === activity && wasPlaying) player?.play()
        }

        override fun onActivityDestroyed(a: Activity) {
            if (a === activity) dismiss()
        }

        override fun onActivityCreated(a: Activity, b: Bundle?) {}
        override fun onActivityStarted(a: Activity) {}
        override fun onActivityStopped(a: Activity) {}
        override fun onActivitySaveInstanceState(a: Activity, b: Bundle) {}
    }

    private val backCallback = if (Build.VERSION.SDK_INT >= 33) OnBackInvokedCallback { back() } else null

    private val scaler = ScaleGestureDetector(activity, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
        override fun onScale(d: ScaleGestureDetector): Boolean {
            zoom = (zoom * d.scaleFactor).coerceIn(1f, 5f)
            if (zoom == 1f) {
                panX = 0f
                panY = 0f
            }
            applyTransform()
            return true
        }
    })

    private val gestures = GestureDetector(activity, object : GestureDetector.SimpleOnGestureListener() {
        override fun onDown(e: MotionEvent) = true

        override fun onSingleTapConfirmed(e: MotionEvent): Boolean {
            if (sheet != null) closeSheet() else setControls(controls.visibility != VISIBLE || controls.alpha < 1f)
            return true
        }

        override fun onDoubleTap(e: MotionEvent): Boolean {
            val third = width / 3f
            when {
                e.x < third -> skip(-10_000)
                e.x > third * 2 -> skip(10_000)
                else -> toggle()
            }
            return true
        }
    })

    private var downX = 0f
    private var downY = 0f
    private var dragging = false
    private var velocity: VelocityTracker? = null

    init {
        isClickable = true
        isFocusable = true
        isFocusableInTouchMode = true
        keepScreenOn = true

        addView(backdrop, LayoutParams(-1, -1))
        addView(stage, LayoutParams(-1, -1))
        addView(flyer, LayoutParams(0, 0))
        addView(ripple, LayoutParams(-1, -1))
        addView(spinner, LayoutParams(dp(38f), dp(38f), Gravity.CENTER))
        addView(message, LayoutParams(-1, -2, Gravity.CENTER).apply { marginStart = dp(24f); marginEnd = dp(24f) })
        addView(hint, LayoutParams(-2, -2, Gravity.CENTER_HORIZONTAL or Gravity.TOP).apply { topMargin = dp(96f) })
        addView(controls, LayoutParams(-1, -1))
        buildControls(title)
        controls.alpha = 0f
        controls.visibility = INVISIBLE
        center.alpha = 0f

        setOnApplyWindowInsetsListener { _, insets ->
            val safe = if (Build.VERSION.SDK_INT >= 30) {
                insets.getInsetsIgnoringVisibility(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
            } else null
            safeL = safe?.left ?: 0
            safeT = safe?.top ?: dp(24f)
            safeR = safe?.right ?: 0
            safeB = safe?.bottom ?: 0
            padControls()
            insets
        }

        setOnKeyListener { _, code, event ->
            if (code == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_UP) {
                back()
                true
            } else {
                code == KeyEvent.KEYCODE_BACK
            }
        }

        val root = activity.window.decorView as ViewGroup
        val image = origin?.let { runCatching { poster(it) }.getOrNull() }
        val from = origin?.let(::rectOf)?.takeIf { it.width() > 0 && it.height() > 0 }
        origin?.visibility = INVISIBLE
        root.addView(this, LayoutParams(-1, -1))
        requestFocus()
        enter(root, from, image)
    }

    private fun padControls() {
        if (turned) {
            controls.setPadding(safeT, safeR, safeB, safeL)
        } else {
            controls.setPadding(safeL, safeT, safeR, safeB)
        }
    }

    private inner class Flyer(context: Context) : ImageView(context) {
        var radius = 0f
            set(value) {
                field = value
                invalidateOutline()
            }

        init {
            scaleType = ScaleType.FIT_XY
            setBackgroundColor(Color.BLACK)
            pivotX = 0f
            pivotY = 0f
            clipToOutline = true
            outlineProvider = object : ViewOutlineProvider() {
                override fun getOutline(view: View, outline: Outline) {
                    outline.setRoundRect(0, 0, view.width, view.height, radius)
                }
            }
        }

        fun size(w: Int, h: Int) {
            layoutParams = (layoutParams as LayoutParams).apply {
                width = w
                height = h
            }
        }

        fun place(rect: RectF, baseW: Int, corner: Float) {
            val scale = rect.width() / baseW
            translationX = rect.left
            translationY = rect.top
            scaleX = scale
            scaleY = rect.height() / (layoutParams as LayoutParams).height
            radius = corner / scale
        }
    }

    private fun rectOf(view: View): RectF {
        val at = IntArray(2)
        view.getLocationOnScreen(at)
        return RectF(
            at[0].toFloat(),
            at[1].toFloat(),
            at[0] + view.width * view.scaleX,
            at[1] + view.height * view.scaleY,
        )
    }

    private fun largestImage(view: View): ImageView? {
        var best: ImageView? = null
        fun walk(v: View) {
            if (v is ImageView && v.drawable != null && v.width * v.height > 0 && v.width * v.height >= (best?.let { it.width * it.height } ?: 0)) {
                best = v
            }
            if (v is ViewGroup) for (i in 0 until v.childCount) walk(v.getChildAt(i))
        }
        walk(view)
        return best
    }

    private fun poster(view: View): Bitmap? {
        val image = largestImage(view) ?: return null
        if (image.width == 0 || image.height == 0) return null
        if (Build.VERSION.SDK_INT >= 28) {
            val picture = Picture()
            image.draw(picture.beginRecording(image.width, image.height))
            picture.endRecording()
            return Bitmap.createBitmap(picture)
        }
        val bitmap = Bitmap.createBitmap(image.width, image.height, Bitmap.Config.ARGB_8888)
        image.draw(Canvas(bitmap))
        return bitmap
    }

    private fun fitted(aspect: Float, w: Int, h: Int): RectF {
        val fw = if (w.toFloat() / h < aspect) w.toFloat() else h * aspect
        val fh = fw / aspect
        return RectF((w - fw) / 2, (h - fh) / 2, (w + fw) / 2, (h + fh) / 2)
    }

    private fun mix(a: RectF, b: RectF, t: Float) = RectF(
        a.left + (b.left - a.left) * t,
        a.top + (b.top - a.top) * t,
        a.right + (b.right - a.right) * t,
        a.bottom + (b.bottom - a.bottom) * t,
    )

    private fun enter(root: View, from: RectF?, image: Bitmap?) {
        activity.application.registerActivityLifecycleCallbacks(lifecycle)
        if (Build.VERSION.SDK_INT >= 33) {
            activity.onBackInvokedDispatcher.registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_OVERLAY,
                backCallback!!,
            )
        }

        if (Build.VERSION.SDK_INT >= 30) {
            activity.window.insetsController?.let {
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                it.hide(WindowInsets.Type.systemBars())
            }
        }
        if (Build.VERSION.SDK_INT >= 28) {
            activity.window.attributes = activity.window.attributes.apply {
                layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }

        if (Build.VERSION.SDK_INT >= 26) audio.requestAudioFocus(focus!!)

        Choreographer.getInstance().postFrameCallback(ticker)
        backdrop.alpha = 0f
        screenW = root.width
        screenH = root.height
        main.postDelayed(showSpinner, 700)

        if (from == null) {
            flyer.size(root.width, root.height)
            flyer.alpha = 0f
            backdrop.animate().alpha(1f).setDuration(170).start()
            flyer.animate().alpha(1f).setDuration(170).withEndAction {
                setControls(true)
                attach()
            }.start()
            return
        }

        val to = fitted(from.width() / from.height(), root.width, root.height)
        target = to
        image?.let(flyer::setImageBitmap)
        flyer.size(to.width().toInt(), to.height().toInt())
        val baseW = to.width().toInt()
        val corner = dp(14f).toFloat()
        flyer.place(from, baseW, corner)

        ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 340
            interpolator = emphasized
            addUpdateListener {
                val t = it.animatedValue as Float
                flyer.place(mix(from, to, t), baseW, corner * (1 - t))
                backdrop.alpha = min(t * 1.6f, 1f)
            }
            start()
        }
        main.postDelayed({ if (!closing) setControls(true) }, 170)
        main.postDelayed({ if (!closing) attach() }, 340)
    }

    private fun attach() {
        engine.worker.execute {
            val core = runCatching { engine.warm() }.getOrElse {
                main.post { fail("couldnt start vlc") }
                return@execute
            }
            val item = Media(core.vlc, Uri.parse(url)).apply {
                setHWDecoderEnabled(true, false)
                addOption(":network-caching=350")
                addOption(":file-caching=150")
                addOption(":live-caching=350")
            }
            main.post {
                if (closing) {
                    item.release()
                    return@post
                }
                runCatching {
                    val mp = core.player
                    player = mp
                    mp.setEventListener { event -> onEvent(event) }
                    mp.vlcVout.apply {
                        setVideoView(video)
                        attachViews(this@Overlay)
                    }
                    attached = true
                    val to = target
                    stage.addView(
                        video,
                        if (to != null) {
                            LayoutParams(to.width().toInt(), to.height().toInt(), Gravity.CENTER)
                        } else {
                            LayoutParams(-1, -1, Gravity.CENTER)
                        },
                    )
                    mp.rate = 1f
                    syncWindow()
                    mp.play(item)
                }.onFailure { fail("couldnt play this video") }
            }
        }
    }

    private fun reveal() {
        if (!covered || closing) return
        covered = false
        main.removeCallbacks(forceReveal)
        main.removeCallbacks(showSpinner)
        spinner.animate().cancel()
        spinner.animate().alpha(0f).setDuration(120).start()
        center.animate().alpha(1f).setDuration(190).start()
        flyer.animate().alpha(0f).setDuration(170).withEndAction {
            flyer.visibility = GONE
            flyer.alpha = 1f
        }.start()
    }

    private fun adoptTrack() {
        if (videoW != 0) return
        val track = player?.currentVideoTrack ?: return
        if (track.width * track.height == 0) return
        videoW = track.width
        videoH = track.height
        sarNum = max(track.sarNum, 1)
        sarDen = max(track.sarDen, 1)
        layoutVideo()
        post {
            sized = true
            tryReveal()
        }
    }

    private fun tryReveal() {
        if (!covered || !timed) return
        if (target != null || sized) {
            if (!quickReveal) {
                quickReveal = true
                main.removeCallbacks(forceReveal)
                main.postDelayed(forceReveal, 110)
            }
        } else if (!slowReveal) {
            slowReveal = true
            main.postDelayed(forceReveal, 500)
        }
    }

    private fun onEvent(event: MediaPlayer.Event) {
        if (Looper.myLooper() != main.looper) {
            main.post { onEvent(event) }
            return
        }
        if (closing) return

        when (event.type) {
            MediaPlayer.Event.Playing -> {
                playing = true
                ended = false
                baseStamp = System.nanoTime()
                center.kind = Glyph.PAUSE
                sound()
                if (startAt > 0) {
                    player?.setTime(startAt)
                    startAt = 0
                }
                if (covered) main.postDelayed(forceReveal, 2500)
                schedule()
            }
            MediaPlayer.Event.Paused -> {
                baseTime = now()
                playing = false
                center.kind = Glyph.PLAY
                setControls(true)
            }
            MediaPlayer.Event.Buffering -> if (!covered) {
                main.removeCallbacks(showSpinner)
                if (event.buffering < 100f && playing) {
                    main.postDelayed(showSpinner, 300)
                } else {
                    spinner.animate().cancel()
                    spinner.animate().alpha(0f).setDuration(120).start()
                }
            }
            MediaPlayer.Event.LengthChanged -> {
                length = event.lengthChanged
                total.text = clock(length)
            }
            MediaPlayer.Event.TimeChanged -> {
                baseTime = event.timeChanged
                baseStamp = System.nanoTime()
                if (event.timeChanged > 0) {
                    timed = true
                    adoptTrack()
                    tryReveal()
                }
            }
            MediaPlayer.Event.EndReached -> {
                playing = false
                ended = true
                baseTime = length
                center.kind = Glyph.REPLAY
                setControls(true)
            }
            MediaPlayer.Event.EncounteredError -> fail("couldnt play this video")
        }
    }

    private fun fail(text: String) {
        reveal()
        center.visibility = GONE
        message.text = text
        message.visibility = VISIBLE
        setControls(true)
    }

    private fun now(): Long {
        if (!playing || covered) return baseTime
        val passed = (System.nanoTime() - baseStamp) / 1_000_000f * rate
        return (baseTime + passed.toLong()).coerceIn(0, if (length > 0) length else Long.MAX_VALUE)
    }

    private fun showTime(time: Long) {
        val label = clock(time)
        if (elapsed.text.toString() != label) elapsed.text = label
        bar.progress = if (length > 0) time.toFloat() / length else 0f
    }

    private fun clock(ms: Long): String {
        val seconds = ms / 1000
        val h = seconds / 3600
        val m = seconds / 60 % 60
        val s = seconds % 60
        return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
    }

    private fun toggle() {
        val mp = player ?: return
        when {
            ended -> restart(0)
            playing -> mp.pause()
            else -> mp.play()
        }
        schedule()
    }

    private fun restart(at: Long) {
        val mp = player ?: return
        ended = false
        startAt = at
        center.kind = Glyph.PAUSE
        engine.worker.execute {
            mp.stop()
            main.post { if (!closing) mp.play() }
        }
    }

    private fun sound() {
        val muted = engine.muted
        speaker.setImageDrawable(
            asset(
                activity,
                if (muted) "voicexicon" else "voicenormalicon",
                if (muted) android.R.drawable.ic_lock_silent_mode else android.R.drawable.ic_lock_silent_mode_off,
            ),
        )
        player?.setVolume(if (muted) 0 else 100)
    }

    private fun skip(delta: Long) {
        if (player == null) return
        val to = (now() + delta).coerceIn(0, max(length, 0))
        seek(to, false)
        ripple.play(delta > 0, (abs(delta) / 1000).toInt())
        performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
    }

    private fun seek(to: Long, fast: Boolean) {
        val mp = player ?: return
        baseTime = to
        baseStamp = System.nanoTime()
        showTime(to)
        if (ended) {
            if (!fast) restart(to)
        } else {
            mp.setTime(to, fast)
        }
    }

    private fun flash(text: String) {
        hint.text = text
        hint.animate().cancel()
        hint.alpha = 0f
        hint.scaleX = 0.92f
        hint.scaleY = 0.92f
        hint.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(170).setInterpolator(emphasized).start()
        main.removeCallbacks(hideHint)
        main.postDelayed(hideHint, 700)
    }

    private fun setControls(show: Boolean) {
        main.removeCallbacks(hideControls)
        val shift = dp(10f).toFloat()
        val all = listOf(controls, topBar, bottomBar, center)
        all.forEach { it.animate().cancel() }

        if (show) {
            if (controls.visibility != VISIBLE) {
                controls.visibility = VISIBLE
                topBar.translationY = -shift
                bottomBar.translationY = shift
                center.scaleX = 0.88f
                center.scaleY = 0.88f
            }
            controls.animate().alpha(1f).setDuration(190).setInterpolator(emphasized).start()
            topBar.animate().translationY(0f).setDuration(280).setInterpolator(emphasized).start()
            bottomBar.animate().translationY(0f).setDuration(280).setInterpolator(emphasized).start()
            center.animate().scaleX(1f).scaleY(1f).setDuration(280).setInterpolator(emphasized).start()
            schedule()
        } else {
            controls.animate().alpha(0f).setDuration(190).setInterpolator(emphasized)
                .withEndAction { controls.visibility = INVISIBLE }.start()
            topBar.animate().translationY(-shift).setDuration(190).setInterpolator(emphasized).start()
            bottomBar.animate().translationY(shift).setDuration(190).setInterpolator(emphasized).start()
        }
    }

    private fun schedule() {
        main.removeCallbacks(hideControls)
        if (playing && !scrubbing && sheet == null) main.postDelayed(hideControls, 2800)
    }

    override fun onNewVideoLayout(
        vlcVout: IVLCVout?,
        width: Int,
        height: Int,
        visibleWidth: Int,
        visibleHeight: Int,
        sarNum: Int,
        sarDen: Int,
    ) {
        if (width * height == 0) return
        videoW = visibleWidth
        videoH = visibleHeight
        this.sarNum = max(sarNum, 1)
        this.sarDen = max(sarDen, 1)
        layoutVideo()
        post {
            sized = true
            tryReveal()
        }
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (!turning) post { layoutVideo() }
    }

    private fun syncWindow() {
        val lp = video.layoutParams as? LayoutParams ?: return
        val w = if (lp.width > 0) lp.width else width
        val h = if (lp.height > 0) lp.height else height
        if (attached && w > 0 && h > 0) player?.vlcVout?.setWindowSize(w, h)
    }

    private fun layoutVideo() {
        if (videoW == 0 || width == 0 || video.parent == null) return
        val aspect = videoW * sarNum.toFloat() / sarDen / videoH
        val rect = fitted(aspect, width, height)
        val w = rect.width().toInt()
        val h = rect.height().toInt()
        val lp = video.layoutParams as LayoutParams
        if (lp.width != w || lp.height != h) {
            lp.width = w
            lp.height = h
            video.layoutParams = lp
        }
        syncWindow()
        if (fill) zoomTo(coverZoom())
    }

    private fun coverZoom(): Float {
        if (video.width == 0 || video.height == 0) return 1f
        return max(width.toFloat() / video.width, height.toFloat() / video.height)
    }

    private fun zoomTo(value: Float) {
        val from = zoom
        val fromX = panX
        val fromY = panY
        ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 300
            interpolator = emphasized
            addUpdateListener {
                val t = it.animatedValue as Float
                zoom = from + (value - from) * t
                panX = fromX * (1 - t)
                panY = fromY * (1 - t)
                applyTransform()
            }
            start()
        }
    }

    private fun applyTransform() {
        stage.scaleX = zoom
        stage.scaleY = zoom
        stage.translationX = panX
        stage.translationY = panY
    }

    override fun dispatchTouchEvent(e: MotionEvent): Boolean {
        if (sheet == null && e.actionMasked == MotionEvent.ACTION_DOWN) schedule()
        return super.dispatchTouchEvent(e)
    }

    override fun onTouchEvent(e: MotionEvent): Boolean {
        scaler.onTouchEvent(e)
        gestures.onTouchEvent(e)

        if (e.pointerCount > 1 || scaler.isInProgress) {
            dragging = false
            return true
        }

        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downX = e.x
                downY = e.y
                dragging = false
                velocity = VelocityTracker.obtain()
                velocity?.addMovement(e)
            }
            MotionEvent.ACTION_MOVE -> {
                velocity?.addMovement(e)
                val dx = e.x - downX
                val dy = e.y - downY
                if (zoom > 1f) {
                    panX += dx
                    panY += dy
                    downX = e.x
                    downY = e.y
                    applyTransform()
                } else {
                    if (!dragging && dy > dp(14f) && dy > abs(dx) * 1.3f) {
                        dragging = true
                        setControls(false)
                    }
                    if (dragging) {
                        val pull = min(max(dy, 0f) / height, 1f)
                        val scale = 1f - pull * 0.45f
                        stage.translationY = max(dy, 0f)
                        stage.translationX = dx * 0.5f
                        stage.scaleX = scale
                        stage.scaleY = scale
                        backdrop.alpha = 1f - pull * 1.6f
                    }
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                velocity?.computeCurrentVelocity(1000)
                val speed = velocity?.yVelocity ?: 0f
                velocity?.recycle()
                velocity = null
                if (dragging) {
                    dragging = false
                    if (stage.translationY > height * 0.16f || speed > dp(900f)) {
                        dismiss()
                    } else {
                        stage.animate().translationX(0f).translationY(0f).scaleX(1f).scaleY(1f)
                            .setDuration(320).setInterpolator(emphasized).start()
                        backdrop.animate().alpha(1f).setDuration(240).start()
                        setControls(true)
                    }
                }
            }
        }
        return true
    }

    private fun back() {
        if (sheet != null) closeSheet() else dismiss()
    }

    fun dismiss() {
        if (closing) return
        closing = true
        main.removeCallbacks(hideControls)
        main.removeCallbacks(hideHint)
        main.removeCallbacks(showSpinner)
        main.removeCallbacks(forceReveal)

        val mp = player
        player = null
        mp?.setVolume(0)

        activity.application.unregisterActivityLifecycleCallbacks(lifecycle)
        if (Build.VERSION.SDK_INT >= 33) {
            activity.onBackInvokedDispatcher.unregisterOnBackInvokedCallback(backCallback!!)
        }
        if (Build.VERSION.SDK_INT >= 26) audio.abandonAudioFocusRequest(focus!!)

        controls.animate().cancel()
        controls.animate().alpha(0f).setDuration(110).start()
        spinner.animate().cancel()
        spinner.alpha = 0f

        val leave = {
            val frame = if (covered || !video.isAvailable) null else runCatching { video.bitmap }.getOrNull()
            engine.worker.execute {
                mp?.setEventListener(null)
                mp?.stop()
                mp?.setVolume(100)
                mp?.setMedia(null)
                main.post { if (attached) mp?.vlcVout?.detachViews() }
            }
            flyOut(frame)
        }

        if (turned) turn(false, 260, leave) else leave()
    }

    private fun flyOut(frame: Bitmap?) {
        val hadCover = flyer.visibility == VISIBLE && flyer.drawable != null
        val start = when {
            hadCover -> rectOf(flyer)
            video.width > 0 -> rectOf(video)
            else -> RectF(0f, 0f, width.toFloat(), height.toFloat())
        }

        if (frame != null) flyer.setImageBitmap(frame)
        val baseW = start.width().toInt().coerceAtLeast(1)
        val baseH = start.height().toInt().coerceAtLeast(1)
        flyer.animate().cancel()
        flyer.alpha = 1f
        flyer.visibility = VISIBLE
        flyer.size(baseW, baseH)
        flyer.place(start, baseW, 0f)
        stage.visibility = INVISIBLE

        if (Build.VERSION.SDK_INT >= 30) activity.window.insetsController?.show(WindowInsets.Type.systemBars())

        val end = origin?.takeIf { it.isAttachedToWindow }?.let(::rectOf)?.takeIf { it.width() > 0 }
        val to = end ?: RectF(
            start.left + start.width() * 0.04f,
            start.top + start.height() * 0.04f,
            start.right - start.width() * 0.04f,
            start.bottom - start.height() * 0.04f,
        )
        val corner = dp(14f).toFloat()
        val fromBack = backdrop.alpha

        ValueAnimator.ofFloat(0f, 1f).apply {
            duration = if (end != null) 300 else 190
            interpolator = emphasized
            addUpdateListener {
                val t = it.animatedValue as Float
                flyer.place(mix(start, to, t), baseW, if (end != null) corner * t else 0f)
                backdrop.alpha = fromBack * max(1f - t * 1.5f, 0f)
                if (end == null) flyer.alpha = 1f - t
            }
            addListener(object : android.animation.AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: android.animation.Animator) {
                    onGone()
                    post {
                        (shield.parent as? ViewGroup)?.removeView(shield)
                        (parent as? ViewGroup)?.removeView(this@Overlay)
                    }
                }
            })
            start()
        }
    }

    private fun text(value: String, size: Float) = TextView(activity).apply {
        text = value
        setTextColor(Color.WHITE)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
        typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
    }

    private fun pill(color: Int, radius: Float) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = radius * density
    }

    private fun button(kind: Int, click: () -> Unit) = Glyph(activity, kind, 0).apply {
        setOnClickListener {
            performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
            click()
            schedule()
        }
    }

    private fun tune(view: Glyph, click: () -> Unit) = view.apply {
        setOnClickListener {
            performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
            click()
            schedule()
        }
    }

    private fun buildControls(title: String) {
        topBar.background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(scrim, 0))
        topBar.setPadding(dp(6f), dp(6f), dp(6f), dp(30f))
        topBar.addView(button(Glyph.CLOSE) { dismiss() }, LinearLayout.LayoutParams(dp(44f), dp(44f)))
        topBar.addView(
            text(title, 15f).apply {
                maxLines = 1
                ellipsize = TextUtils.TruncateAt.MIDDLE
                setPadding(dp(6f), 0, dp(6f), 0)
            },
            LinearLayout.LayoutParams(0, -2, 1f),
        )
        topBar.addView(button(Glyph.DOWNLOAD) { engine.download(url, title) }, LinearLayout.LayoutParams(dp(44f), dp(44f)))
        controls.addView(topBar, LayoutParams(-1, -2, Gravity.TOP))

        tune(center) { toggle() }
        controls.addView(center, LayoutParams(dp(64f), dp(64f), Gravity.CENTER))

        bar.onScrub = { fraction, done ->
            scrubbing = !done
            val to = (fraction * length).toLong()
            elapsed.text = clock(to)
            if (length > 0) seek(to, !done)
            schedule()
        }

        val row = LinearLayout(activity).apply { gravity = Gravity.CENTER_VERTICAL }
        row.addView(elapsed)
        row.addView(text(" / ", 12f).apply { alpha = 0.7f })
        row.addView(total)
        row.addView(View(activity), LinearLayout.LayoutParams(0, 1, 1f))
        speedLabel.apply {
            gravity = Gravity.CENTER
            setPadding(dp(10f), 0, dp(10f), 0)
            setOnClickListener { speedSheet() }
        }
        row.addView(speedLabel, LinearLayout.LayoutParams(-2, dp(40f)))
        sound()
        speaker.setOnClickListener {
            performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
            engine.muted = !engine.muted
            sound()
            schedule()
        }
        row.addView(speaker, LinearLayout.LayoutParams(dp(40f), dp(40f)))
        row.addView(button(Glyph.AUDIO) { trackSheet() }, LinearLayout.LayoutParams(dp(40f), dp(40f)))
        row.addView(
            tune(fitButton) {
                fill = !fill
                fitButton.inward = fill
                zoomTo(if (fill) coverZoom() else 1f)
                flash(if (fill) "fill" else "fit")
            },
            LinearLayout.LayoutParams(dp(40f), dp(40f)),
        )
        row.addView(tune(rotateButton) { rotate() }, LinearLayout.LayoutParams(dp(40f), dp(40f)))

        bottomBar.background = GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP, intArrayOf(scrim, 0))
        bottomBar.setPadding(dp(14f), dp(30f), dp(6f), dp(4f))
        bottomBar.addView(bar, LinearLayout.LayoutParams(-1, dp(32f)).apply { marginEnd = dp(8f) })
        bottomBar.addView(row, LinearLayout.LayoutParams(-1, -2))
        controls.addView(bottomBar, LayoutParams(-1, -2, Gravity.BOTTOM))
    }

    private fun aspect(): Float {
        if (videoW != 0) return videoW * sarNum.toFloat() / sarDen / videoH
        return target?.let { it.width() / it.height() } ?: (16f / 9f)
    }

    private fun rotate() {
        if (turning || covered) return
        rotateButton.animate().rotationBy(90f).setDuration(420).setInterpolator(emphasized).start()
        setControls(false)
        turn(!turned, 420) { setControls(true) }
    }

    private fun turn(wide: Boolean, duration: Long, done: () -> Unit) {
        turning = true
        fill = false
        fitButton.inward = false
        zoom = 1f
        panX = 0f
        panY = 0f
        stage.translationX = 0f
        stage.translationY = 0f

        if (shield.parent == null) {
            val root = parent as ViewGroup
            root.addView(shield, root.indexOfChild(this), FrameLayout.LayoutParams(-1, -1))
        }

        val w = if (wide) screenH else screenW
        val h = if (wide) screenW else screenH
        val old = max(video.width, 1)
        val rect = fitted(aspect(), w, h)
        val from = old / rect.width()

        turned = wide
        layoutParams = (layoutParams as FrameLayout.LayoutParams).apply {
            width = w
            height = h
            gravity = Gravity.CENTER
        }
        (video.layoutParams as LayoutParams).let {
            it.width = rect.width().toInt()
            it.height = rect.height().toInt()
            video.layoutParams = it
        }
        padControls()
        syncWindow()
        stage.scaleX = from
        stage.scaleY = from

        val start = rotation
        val end = if (wide) 90f else 0f
        ValueAnimator.ofFloat(0f, 1f).apply {
            this.duration = duration
            interpolator = emphasized
            addUpdateListener {
                val t = it.animatedValue as Float
                rotation = start + (end - start) * t
                val scale = from + (1 - from) * t
                stage.scaleX = scale
                stage.scaleY = scale
            }
            addListener(object : android.animation.AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: android.animation.Animator) {
                    turning = false
                    if (!wide) (shield.parent as? ViewGroup)?.removeView(shield)
                    done()
                }
            })
            start()
        }
    }

    private fun speedSheet() {
        openSheet(
            "Speed",
            speeds.map { "${it}x".replace(".0x", "x") to (it == rate) },
        ) { index ->
            rate = speeds[index]
            baseTime = now()
            baseStamp = System.nanoTime()
            player?.rate = rate
            speedLabel.text = "${rate}x".replace(".0x", "x")
        }
    }

    private fun trackSheet() {
        val mp = player ?: return
        val tracks = mp.audioTracks?.toList().orEmpty()
        if (tracks.isEmpty()) {
            flash("no tracks")
            return
        }
        openSheet("Audio", tracks.map { track -> track.name.replace("Disable", "Off") to (track.id == mp.audioTrack) }) { index ->
            mp.setAudioTrack(tracks[index].id)
        }
    }

    private fun openSheet(title: String, rows: List<Pair<String, Boolean>>, pick: (Int) -> Unit) {
        closeSheet()
        main.removeCallbacks(hideControls)

        val list = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
        list.setPadding(0, 0, 0, dp(6f))
        list.addView(
            text(title, 13f).apply {
                alpha = 0.65f
                setPadding(dp(18f), dp(14f), dp(18f), dp(6f))
            },
        )
        rows.forEachIndexed { index, (label, active) ->
            list.addView(
                text(label, 15f).apply {
                    gravity = Gravity.CENTER_VERTICAL
                    maxLines = 1
                    ellipsize = TextUtils.TruncateAt.END
                    setPadding(dp(18f), 0, dp(18f), 0)
                    background = RippleDrawable(ColorStateList.valueOf(0x24FFFFFF), null, pill(Color.WHITE, 0f))
                    if (active) setTextColor(0xFFA3ABFA.toInt())
                    setOnClickListener {
                        performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
                        pick(index)
                        postDelayed({ closeSheet() }, 90)
                    }
                },
                LinearLayout.LayoutParams(-1, dp(46f)),
            )
        }

        val scroll = ScrollView(activity).apply {
            background = pill(0xF2232428.toInt(), 18f)
            clipToOutline = true
            addView(list)
            translationY = dp(26f).toFloat()
            alpha = 0f
            scaleX = 0.96f
            scaleY = 0.96f
        }
        controls.addView(
            scroll,
            LayoutParams(min(dp(320f), width - dp(32f)), -2, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).apply {
                bottomMargin = dp(96f)
                topMargin = dp(64f)
            },
        )
        scroll.animate().translationY(0f).alpha(1f).scaleX(1f).scaleY(1f).setDuration(260)
            .setInterpolator(emphasized).start()
        sheet = scroll
    }

    private fun closeSheet() {
        val view = sheet ?: return
        sheet = null
        view.animate().alpha(0f).translationY(dp(14f).toFloat()).setDuration(140)
            .setInterpolator(emphasized).withEndAction { controls.removeView(view) }.start()
        schedule()
    }
}
