package mlem.vlc.engine

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Outline
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.GestureDetector
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.ProgressBar
import org.videolan.libvlc.Media
import org.videolan.libvlc.MediaPlayer
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max

private const val posterWidth = 540
private const val circle = 0xFF020202.toInt()
private const val corner = 10f

@SuppressLint("ViewConstructor", "ClickableViewAccessibility")
class Tile(
    context: Context,
    val url: String,
    private val engine: Engine,
    private val floating: Boolean,
) : FrameLayout(context) {
    private val main = Handler(Looper.getMainLooper())
    private val density = resources.displayMetrics.density
    private fun dp(value: Float) = (value * density).toInt()

    var undo: (() -> Unit)? = null

    private var pending = false
    private val relayout: Runnable = Runnable {
        pending = false
        inner.measure(
            MeasureSpec.makeMeasureSpec(inner.width, MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(inner.height, MeasureSpec.EXACTLY),
        )
        inner.layout(inner.left, inner.top, inner.right, inner.bottom)
    }

    private val inner: FrameLayout = object : FrameLayout(context) {
        override fun requestLayout() {
            super.requestLayout()
            if (width > 0 && !pending) {
                pending = true
                post(relayout)
            }
        }
    }
    private val body: FrameLayout get() = inner
    val box: View get() = inner
    private val veil = View(context).apply { setBackgroundColor(0xFF1E1F22.toInt()) }
    private val poster = ImageView(context).apply {
        scaleType = ImageView.ScaleType.CENTER_CROP
        alpha = 0f
    }
    private val center = disc(ImageView(context), Color.BLACK, 18f, 0.64f).apply {
        setImageDrawable(asset(context, "playicon", android.R.drawable.ic_media_play))
        setColorFilter(Color.WHITE)
        visibility = if (floating) GONE else VISIBLE
    }
    private val spinner = disc(ProgressBar(context), circle, 8f, 0.6f).apply {
        indeterminateTintList = ColorStateList.valueOf(Color.WHITE)
        visibility = GONE
    }
    private val speaker = disc(ImageView(context), circle, 8f, 0.6f).apply {
        setColorFilter(Color.WHITE)
        visibility = GONE
    }

    private var aspect = engine.posters.aspect(url) ?: (16f / 9f)
    private var sizing: ValueAnimator? = null
    private var video: TextureView? = null
    private var player: MediaPlayer? = null
    private var peeking = false
    private var session = 0
    private var started = false
    private var shown = false
    private var playing = false
    private var held = false
    private var resume = 0L
    private var seekTo = 0L
    var away = false
        private set
    private var left = false

    private var aimed = false
    private val taps = GestureDetector(context, object : GestureDetector.SimpleOnGestureListener() {
        override fun onSingleTapUp(e: MotionEvent): Boolean {
            if (started) engine.full(this@Tile) else start()
            return true
        }

        override fun onLongPress(e: MotionEvent) {
            if (engine.hold(this@Tile)) performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
        }
    })

    private val showSpinner = Runnable { spinner.visibility = VISIBLE }
    private val giveUp = Runnable { finishPeek() }

    init {
        body.outlineProvider = object : ViewOutlineProvider() {
            override fun getOutline(view: View, outline: Outline) {
                outline.setRoundRect(0, 0, view.width, view.height, dp(corner).toFloat())
            }
        }
        body.clipToOutline = true
        body.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> syncWindow() }

        if (!floating) {
            body.addView(veil, LayoutParams(-1, -1))
            body.foreground = GradientDrawable().apply {
                setStroke(ceil(0.25f * density).toInt(), 0x1A000000)
                cornerRadius = dp(corner).toFloat()
            }
        }
        body.addView(poster, LayoutParams(-1, -1))
        body.addView(center, LayoutParams(dp(64f), dp(64f), Gravity.CENTER))
        body.addView(spinner, LayoutParams(dp(64f), dp(64f), Gravity.CENTER))
        body.addView(
            speaker,
            LayoutParams(dp(32f), dp(32f), Gravity.BOTTOM or Gravity.END).apply {
                bottomMargin = dp(8f)
                marginEnd = dp(8f)
            },
        )
        addView(body, LayoutParams(-1, -1))

        speaker.setOnClickListener {
            engine.muted = !engine.muted
            sound()
        }
    }

    private fun <T : View> disc(view: T, color: Int, pad: Float, fade: Float) = view.apply {
        background = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(color)
        }
        setPadding(dp(pad), dp(pad), dp(pad), dp(pad))
        alpha = fade
    }

    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        if (floating) {
            super.onMeasure(widthSpec, heightSpec)
            return
        }
        val w = MeasureSpec.getSize(widthSpec)
        val cap = (resources.displayMetrics.heightPixels * 0.42f).toInt()
        var innerW = w
        var innerH = (w / aspect).toInt()
        if (innerH > cap) {
            innerH = cap
            innerW = (cap * aspect).toInt().coerceAtMost(w)
        }
        body.measure(
            MeasureSpec.makeMeasureSpec(innerW, MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(innerH, MeasureSpec.EXACTLY),
        )
        setMeasuredDimension(w, innerH)
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        if (floating) return
        if (poster.drawable == null) {
            engine.posters.load(url) { image ->
                if (image != null) showPoster(image) else engine.queuePeek(this)
            }
        }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        engine.dropPeek(this)
        finishPeek()
        halt()
    }

    override fun onWindowVisibilityChanged(visibility: Int) {
        super.onWindowVisibilityChanged(visibility)
        if (visibility != VISIBLE) {
            if (playing) {
                held = true
                player?.pause()
            }
        } else if (held) {
            held = false
            player?.play()
        }
    }

    override fun dispatchTouchEvent(e: MotionEvent): Boolean {
        if (e.actionMasked == MotionEvent.ACTION_DOWN) aimed = e.x <= body.right && !overSpeaker(e)
        if (aimed) taps.onTouchEvent(e)
        super.dispatchTouchEvent(e)
        return true
    }

    private fun overSpeaker(e: MotionEvent): Boolean {
        if (speaker.visibility != VISIBLE) return false
        val x = e.x - body.left
        val y = e.y - body.top
        return x >= speaker.left && x <= speaker.right && y >= speaker.top && y <= speaker.bottom
    }

    private fun sound() {
        val muted = engine.muted
        speaker.setImageDrawable(
            asset(
                context,
                if (muted) "voicexicon" else "voicenormalicon",
                if (muted) android.R.drawable.ic_lock_silent_mode else android.R.drawable.ic_lock_silent_mode_off,
            ),
        )
        player?.setVolume(if (muted) 0 else 100)
    }

    private fun surface() = TextureView(context).also {
        video = it
        body.addView(it, 0, LayoutParams(-1, -1))
    }

    private fun item(core: Core, quiet: Boolean) = Media(core.vlc, Uri.parse(url)).apply {
        setHWDecoderEnabled(true, false)
        addOption(":network-caching=350")
        addOption(":file-caching=150")
        addOption(":no-spu")
        if (quiet) {
            addOption(":no-audio")
            addOption(":start-time=1")
        }
    }

    private fun bind(mp: MediaPlayer, view: TextureView) {
        mp.vlcVout.apply {
            setVideoView(view)
            attachViews()
        }
        syncWindow(mp)
    }

    private fun syncWindow(mp: MediaPlayer? = player ?: peekPlayer) {
        if (body.width > 0 && body.height > 0) mp?.vlcVout?.setWindowSize(body.width, body.height)
    }

    fun start() {
        if (player != null) return
        engine.dropPeek(this)
        finishPeek()
        engine.claim(this)

        val run = ++session
        seekTo = resume
        resume = 0
        started = true
        shown = false
        center.visibility = GONE
        if (seekTo > 0) main.postDelayed(showSpinner, 250) else spinner.visibility = VISIBLE
        speaker.visibility = VISIBLE
        sound()
        val view = surface()
        if (floating) view.alpha = 0f

        engine.worker.execute {
            val core = runCatching { engine.warm() }.getOrElse {
                main.post { if (run == session) halt() }
                return@execute
            }
            val made = item(core, false)
            main.post {
                if (run != session) {
                    made.release()
                    return@post
                }
                runCatching {
                    val mp = core.inline
                    player = mp
                    mp.setEventListener { event -> main.post { if (run == session) onEvent(event) } }
                    bind(mp, view)
                    mp.play(made)
                }.onFailure { halt() }
            }
        }
    }

    private fun onEvent(event: MediaPlayer.Event) {
        when (event.type) {
            MediaPlayer.Event.Playing -> {
                playing = true
                if (seekTo > 0) {
                    player?.setVolume(0)
                    player?.setTime(seekTo)
                } else {
                    sound()
                }
            }
            MediaPlayer.Event.Paused -> playing = false
            MediaPlayer.Event.Buffering -> if (shown) {
                main.removeCallbacks(showSpinner)
                if (event.buffering < 100f && playing) {
                    main.postDelayed(showSpinner, 300)
                } else {
                    spinner.visibility = GONE
                }
            }
            MediaPlayer.Event.TimeChanged -> if (event.timeChanged > 0 && !shown && event.timeChanged >= seekTo - 400) {
                if (seekTo > 0) {
                    seekTo = 0
                    sound()
                }
                player?.let(::adopt)
                val run = session
                video?.let { view -> whenPainted(view) { if (run == session) reveal() } }
                shown = true
            }
            MediaPlayer.Event.EndReached, MediaPlayer.Event.EncounteredError -> {
                playing = false
                halt()
                if (!floating) engine.posters.load(url) { image -> image?.let(::showPoster) }
            }
        }
    }

    private fun adopt(mp: MediaPlayer): Boolean {
        val track = mp.currentVideoTrack ?: return false
        if (track.width * track.height == 0) return false
        val real = track.width * max(track.sarNum, 1).toFloat() / max(track.sarDen, 1) / track.height
        if (!floating && abs(real - aspect) > 0.01f) resize(real)
        return true
    }

    private fun resize(to: Float) {
        sizing?.cancel()
        sizing = ValueAnimator.ofFloat(aspect, to).apply {
            duration = 240
            interpolator = emphasized
            addUpdateListener {
                aspect = it.animatedValue as Float
                settle()
            }
            start()
        }
    }

    private fun settle() {
        requestLayout()
        var top: View = this
        var at: View? = this
        while (at != null) {
            if (at.javaClass.name.contains("RecyclerView") || at.javaClass.superclass?.name?.contains("RecyclerView") == true) top = at
            at = at.parent as? View
        }
        if (top === this) return
        top.measure(
            MeasureSpec.makeMeasureSpec(top.width, MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(top.height, MeasureSpec.EXACTLY),
        )
        top.layout(top.left, top.top, top.right, top.bottom)
    }

    private fun reveal() {
        main.removeCallbacks(showSpinner)
        spinner.visibility = GONE
        if (floating) {
            video?.animate()?.alpha(1f)?.setDuration(170)?.start()
            poster.animate().cancel()
            poster.animate().alpha(0f).setDuration(170).start()
        } else {
            veil.animate().cancel()
            veil.alpha = 0f
            poster.animate().cancel()
            poster.animate().alpha(0f).setDuration(170).start()
        }
    }

    private fun frame(view: TextureView?): Bitmap? {
        if (view == null || !view.isAvailable) return null
        return runCatching { view.getBitmap(posterWidth, (posterWidth / aspect).toInt().coerceAtLeast(1)) }.getOrNull()
    }

    private fun showPoster(image: Bitmap) {
        poster.setImageBitmap(image)
        poster.animate().cancel()
        poster.animate().alpha(1f).setDuration(180).start()
    }

    private fun stop(mp: MediaPlayer) {
        val image = if (shown && playing) frame(video) else null
        val view = video
        player = null
        video = null
        playing = false
        held = false
        session++
        main.removeCallbacks(showSpinner)
        spinner.visibility = GONE
        release(mp, view)
        engine.released(this)

        image?.let(poster::setImageBitmap)
        veil.animate().cancel()
        veil.alpha = 1f
        poster.animate().cancel()
        poster.alpha = if (poster.drawable != null) 1f else 0f
    }

    fun hand(): Long {
        away = true
        speaker.visibility = GONE
        spinner.visibility = GONE
        return player?.time?.coerceAtLeast(0) ?: resume
    }

    fun still(): Bitmap? {
        val view = video?.takeIf { shown && it.isAvailable }
        return runCatching { view?.getBitmap(body.width, body.height) }.getOrNull()
            ?: (poster.drawable as? BitmapDrawable)?.bitmap
    }

    fun park() {
        player?.let(::stop)
    }

    fun back(at: Long?, image: Bitmap?) {
        park()
        away = false
        started = false
        resume = at ?: resume
        image?.let {
            poster.animate().cancel()
            poster.setImageBitmap(it)
            poster.alpha = 1f
        }
        center.visibility = VISIBLE
        speaker.visibility = GONE
    }

    fun halt() {
        started = false
        away = false
        resume = 0
        player?.let(::stop)
        if (floating) {
            leave()
            return
        }
        center.visibility = VISIBLE
        speaker.visibility = GONE
    }

    private fun leave() {
        if (!floating || left) return
        left = true
        undo?.invoke()
        undo = null
        (parent as? ViewGroup)?.removeView(this)
    }

    private fun release(mp: MediaPlayer, view: TextureView?) {
        runCatching {
            engine.worker.execute {
                mp.setEventListener(null)
                mp.stop()
                mp.setMedia(null)
                main.post {
                    mp.vlcVout.detachViews()
                    view?.let(body::removeView)
                }
            }
        }
    }

    fun peek() {
        if (player != null || peeking || !isAttachedToWindow) {
            engine.peeked()
            return
        }
        peeking = true
        val run = ++session
        val view = surface()
        val to = this
        engine.worker.execute {
            val core = runCatching { engine.warm() }.getOrElse {
                main.post { if (run == session) finishPeek() }
                return@execute
            }
            val made = item(core, true)
            main.post {
                if (run != session) {
                    made.release()
                    return@post
                }
                runCatching {
                    val mp = core.peek
                    peekPlayer = mp
                    mp.setEventListener { event -> main.post { if (run == session) to.onPeek(event) } }
                    bind(mp, view)
                    mp.play(made)
                    main.postDelayed(giveUp, 9000)
                }.onFailure { finishPeek() }
            }
        }
    }

    private var peekPlayer: MediaPlayer? = null
    private var peekDone = false

    private fun onPeek(event: MediaPlayer.Event) {
        when (event.type) {
            MediaPlayer.Event.TimeChanged -> if (!peekDone && event.timeChanged > 0) {
                val mp = peekPlayer ?: return
                val before = aspect
                if (!adopt(mp)) return
                peekDone = true
                main.postDelayed({ capture() }, if (sizing?.isRunning == true || aspect != before) 720 else 320)
            }
            MediaPlayer.Event.EncounteredError, MediaPlayer.Event.EndReached -> {
                engine.posters.miss(url)
                finishPeek()
            }
        }
    }

    private fun capture() {
        val image = frame(video)
        if (image != null) {
            engine.posters.save(url, image)
            showPoster(image)
        }
        finishPeek()
    }

    private fun finishPeek() {
        if (!peeking) return
        peeking = false
        peekDone = false
        session++
        main.removeCallbacks(giveUp)
        val mp = peekPlayer
        val view = video
        peekPlayer = null
        video = null
        if (mp != null) {
            release(mp, view)
        } else {
            view?.let(body::removeView)
        }
        engine.peeked()
    }
}
