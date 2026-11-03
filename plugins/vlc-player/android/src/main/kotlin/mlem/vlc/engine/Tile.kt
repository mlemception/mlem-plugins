package mlem.vlc.engine

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Outline
import android.graphics.SurfaceTexture
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.view.GestureDetector
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.TextureView
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.ProgressBar
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
    private val relayout = Runnable {
        pending = false
        body.measure(
            MeasureSpec.makeMeasureSpec(body.width, MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(body.height, MeasureSpec.EXACTLY),
        )
        body.layout(body.left, body.top, body.right, body.bottom)
    }
    private val body: FrameLayout = object : FrameLayout(context) {
        override fun requestLayout() {
            super.requestLayout()
            if (width > 0 && !pending) {
                pending = true
                post(relayout)
            }
        }
    }
    val box: View get() = body
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
    private var reel: Reel? = null
    private val player get() = reel?.mp
    private var peekReel: Reel? = null
    private var peeking = false
    private var peekDone = false
    private var session = 0
    private var started = false
    private var shown = false
    private var playing = false
    private var held = false
    private var wanted = false
    private var resume = 0L
    private var seekTo = 0L
    var away = false
        private set
    private var left = false

    private var aimed = false
    private var still = false
    private var downY = 0f
    private val slop = ViewConfiguration.get(context).scaledTouchSlop
    private val taps = GestureDetector(context, object : GestureDetector.SimpleOnGestureListener() {
        override fun onSingleTapUp(e: MotionEvent): Boolean {
            if (started) engine.full(this@Tile) else start()
            return true
        }

        override fun onLongPress(e: MotionEvent) {
            main.postDelayed({
                if (still && engine.hold(this@Tile)) performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
            }, 90)
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
        body.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> (reel ?: peekReel)?.fit(body) }

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
        if (floating) return super.onMeasure(widthSpec, heightSpec)
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
        if (floating || poster.drawable != null) return
        engine.posters.load(url) { image -> if (image != null) showPoster(image) else engine.queuePeek(this) }
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
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                aimed = e.x <= body.right && !overSpeaker(e)
                still = true
                downY = e.y
            }
            MotionEvent.ACTION_MOVE -> if (abs(e.y - downY) > slop) still = false
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> still = false
        }
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

    private fun load(pick: (Core) -> MediaPlayer, quiet: Boolean, run: Int, handle: (MediaPlayer.Event) -> Unit, made: (Reel) -> Unit, fail: () -> Unit) {
        val view = surface()
        if (floating && !quiet) view.alpha = 0f
        val texture = SurfaceTexture(false)
        Reel.show(view, texture)
        engine.worker.execute {
            val core = runCatching { engine.warm() }.getOrElse {
                main.post { if (run == session) fail() }
                return@execute
            }
            val media = engine.media(core, url, quiet)
            main.post {
                if (run != session) return@post media.release()
                runCatching {
                    Reel(pick(core), texture).also {
                        it.fill = true
                        made(it)
                        it.mp.setEventListener { event -> main.post { if (run == session) handle(event) } }
                        it.play(media, body)
                    }
                }.onFailure { fail() }
            }
        }
    }

    fun start() {
        if (engine.returning(this)) {
            wanted = true
            center.visibility = GONE
            return
        }
        if (started) return
        started = true
        shown = false
        engine.claim(this)
        center.visibility = GONE
        speaker.visibility = VISIBLE
        sound()
        reel?.let {
            it.fill = true
            it.show(surface())
            it.fit(body)
            it.mp.play()
            return
        }
        engine.dropPeek(this)
        finishPeek()
        seekTo = resume
        resume = 0
        if (seekTo > 0) main.postDelayed(showSpinner, 250) else spinner.visibility = VISIBLE
        load({ it.inline }, false, ++session, ::onEvent, { reel = it }, ::halt)
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
                if (event.buffering < 100f && playing) main.postDelayed(showSpinner, 300) else spinner.visibility = GONE
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
        if (!floating && abs(real - aspect) > 0.002f) resize(real)
        (if (mp === player) reel else peekReel)?.fit(body)
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
        if (floating) video?.animate()?.alpha(1f)?.setDuration(170)?.start()
        veil.animate().cancel()
        veil.alpha = 0f
        poster.animate().cancel()
        poster.animate().alpha(0f).setDuration(170).start()
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

    private fun cover(image: Bitmap?) {
        image?.let(poster::setImageBitmap)
        veil.animate().cancel()
        veil.alpha = 1f
        poster.animate().cancel()
        poster.alpha = if (poster.drawable != null) 1f else 0f
    }

    private fun stop() {
        val running = reel ?: return
        val image = if (shown && playing) frame(video) else null
        val view = video
        reel = null
        video = null
        playing = false
        held = false
        session++
        main.removeCallbacks(showSpinner)
        spinner.visibility = GONE
        running.stop(engine) { view?.let(body::removeView) }
        engine.released(this)
        cover(image)
    }

    fun spot() = player?.time?.coerceAtLeast(0) ?: resume

    fun hand(image: Bitmap?): Reel? {
        val given = reel
        away = true
        main.removeCallbacks(showSpinner)
        speaker.visibility = GONE
        spinner.visibility = GONE
        cover(image)
        given?.mp?.setEventListener(null)
        video?.let(body::removeView)
        video = null
        reel = null
        playing = false
        session++
        return given
    }

    fun still(done: (Bitmap?) -> Unit) {
        val fallback = (poster.drawable as? BitmapDrawable)?.bitmap
        val running = reel?.takeIf { shown } ?: return done(fallback)
        running.grab(body.width, body.height) { done(it ?: fallback) }
    }

    fun back(at: Long?, image: Bitmap?) {
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

    fun mirror(image: Bitmap) = poster.setImageBitmap(image)

    fun take(given: Reel?) {
        if (given != null) {
            val run = ++session
            reel = given
            resume = 0
            given.mp.setEventListener { event -> main.post { if (run == session) onEvent(event) } }
        }
        if (wanted) {
            wanted = false
            start()
        }
    }

    fun park() {
        val at = if (started) 0 else spot()
        halt()
        resume = at
    }

    fun halt() {
        started = false
        away = false
        wanted = false
        resume = 0
        stop()
        if (floating) return leave()
        center.visibility = VISIBLE
        speaker.visibility = GONE
    }

    private fun leave() {
        if (left) return
        left = true
        undo?.invoke()
        undo = null
        (parent as? ViewGroup)?.removeView(this)
    }

    fun peek() {
        if (reel != null || peeking || !isAttachedToWindow) return engine.peeked()
        peeking = true
        load({ it.peek }, true, ++session, ::onPeek, { peekReel = it }, ::finishPeek)
        main.postDelayed(giveUp, 9000)
    }

    private fun onPeek(event: MediaPlayer.Event) {
        when (event.type) {
            MediaPlayer.Event.TimeChanged -> if (!peekDone && event.timeChanged > 0) {
                val mp = peekReel?.mp ?: return
                val before = aspect
                if (!adopt(mp)) return
                peekDone = true
                main.postDelayed(::capture, if (sizing?.isRunning == true || aspect != before) 720 else 320)
            }
            MediaPlayer.Event.EncounteredError, MediaPlayer.Event.EndReached -> {
                engine.posters.miss(url)
                finishPeek()
            }
        }
    }

    private fun capture() {
        val grabbing = peekReel ?: return finishPeek()
        grabbing.grab(posterWidth, (posterWidth / aspect).toInt().coerceAtLeast(1)) { image ->
            image?.let {
                engine.posters.save(url, it, aspect)
                showPoster(it)
            }
            finishPeek()
        }
    }

    private fun finishPeek() {
        if (!peeking) return
        peeking = false
        peekDone = false
        session++
        main.removeCallbacks(giveUp)
        val view = video
        video = null
        val gone = { view?.let(body::removeView); Unit }
        peekReel?.stop(engine, gone) ?: gone()
        peekReel = null
        engine.peeked()
    }
}
