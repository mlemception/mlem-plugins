package mlem.vlc.engine

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.HapticFeedbackConstants
import android.view.TextureView
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import org.videolan.libvlc.Media
import org.videolan.libvlc.MediaPlayer

private const val skipBy = 10_000L

@SuppressLint("ViewConstructor")
class Stage(
    context: Context,
    val id: String,
    val url: String,
    private val engine: Engine,
    private val from: Long,
    private var paused: Boolean,
    private var muted: Boolean,
    private val still: Bitmap?,
) : FrameLayout(context) {
    private val main = Handler(Looper.getMainLooper())
    private val video = TextureView(context)
    private val cover = ImageView(context).apply {
        scaleType = ImageView.ScaleType.FIT_CENTER
        setImageBitmap(still)
    }
    private val ripple = SeekRipple(context)
    private var seeking = from > 0
    private var player: MediaPlayer? = null
    private var closed = false
    private var ready = false
    private var failed = false
    private var playing = false
    private var held = false
    private var looped = false
    private var speech: Int? = null
    private var text: Int? = null
    private var speed = 1f
    private var width0 = 0
    private var height0 = 0
    @Volatile private var time = from
    @Volatile private var length = 0L

    init {
        keepScreenOn = true
        addView(video, LayoutParams(-1, -1))
        addView(cover, LayoutParams(-1, -1))
        addView(ripple, LayoutParams(-1, -1))
    }

    fun mount(host: ViewGroup) {
        host.addView(this, 0, LayoutParams(-1, -1))
        fit(host)
        host.addOnLayoutChangeListener { view, _, _, _, _, _, _, _, _ -> fit(view as ViewGroup) }
        start()
    }

    private fun fit(host: ViewGroup) {
        measure(
            MeasureSpec.makeMeasureSpec(host.width, MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(host.height, MeasureSpec.EXACTLY),
        )
        layout(0, 0, host.width, host.height)
        sync()
    }

    private fun sync() {
        if (width > 0 && height > 0) player?.vlcVout?.setWindowSize(width, height)
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
            if (!paused) player?.play()
        }
    }

    private fun start() {
        engine.worker.execute {
            val core = runCatching { engine.warm() }.getOrElse {
                failed = true
                return@execute
            }
            val made = Media(core.vlc, Uri.parse(url)).apply {
                setHWDecoderEnabled(true, false)
                addOption(":network-caching=350")
                addOption(":file-caching=150")
            }
            main.post {
                if (closed) {
                    made.release()
                    return@post
                }
                runCatching {
                    val mp = core.player
                    player = mp
                    mp.setEventListener { event -> main.post { if (!closed) onEvent(event) } }
                    mp.vlcVout.apply {
                        setVideoView(video)
                        attachViews()
                    }
                    sync()
                    mp.rate = 1f
                    mp.play(made)
                }.onFailure { failed = true }
            }
        }
    }

    private fun onEvent(event: MediaPlayer.Event) {
        val mp = player ?: return
        when (event.type) {
            MediaPlayer.Event.Playing -> {
                playing = true
                mp.setVolume(if (muted || !ready) 0 else 100)
                if (seeking) mp.setTime(from)
                if (paused) mp.pause()
            }
            MediaPlayer.Event.Paused -> playing = false
            MediaPlayer.Event.LengthChanged -> length = event.lengthChanged
            MediaPlayer.Event.TimeChanged -> {
                if (seeking && event.timeChanged < from - 400) return
                seeking = false
                time = event.timeChanged
                if (looped && event.timeChanged > 0) {
                    looped = false
                    speech?.let(mp::setAudioTrack)
                    text?.let(mp::setSpuTrack)
                    mp.rate = speed
                }
                if (!ready && event.timeChanged > 0) {
                    mp.currentVideoTrack?.let {
                        width0 = it.width
                        height0 = it.height
                    }
                    ready = true
                    mp.setVolume(if (muted) 0 else 100)
                    whenPainted(video) {
                        cover.animate().alpha(0f).setDuration(120).withEndAction { cover.visibility = GONE }.start()
                    }
                }
            }
            MediaPlayer.Event.EndReached -> {
                playing = false
                looped = true
                time = 0
                engine.worker.execute {
                    mp.stop()
                    main.post { if (!closed) mp.play() }
                }
            }
            MediaPlayer.Event.EncounteredError -> failed = true
        }
    }

    fun poll(): Map<String, Any> = mapOf(
        "time" to time / 1000.0,
        "length" to length / 1000.0,
        "ready" to ready,
        "failed" to failed,
        "width" to width0,
        "height" to height0,
    )

    fun pause(value: Boolean) {
        paused = value
        val mp = player ?: return
        if (value) mp.pause() else mp.play()
    }

    fun mute(value: Boolean) {
        muted = value
        if (ready) player?.setVolume(if (value) 0 else 100)
    }

    fun seek(seconds: Double) {
        val to = (seconds * 1000).toLong()
        time = to
        player?.setTime(to)
    }

    fun skip(forward: Boolean) {
        val delta = if (forward) skipBy else -skipBy
        val mp = player ?: return
        val to = (time + delta).coerceIn(0, if (length > 0) length else Long.MAX_VALUE)
        time = to
        mp.setTime(to)
        ripple.play(delta > 0, (kotlin.math.abs(delta) / 1000).toInt())
        performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
    }

    fun tracks(): Map<String, Any> {
        val mp = player ?: return emptyMap()
        fun list(items: Array<out MediaPlayer.TrackDescription>?, now: Int) = items.orEmpty().map {
            mapOf("id" to it.id, "name" to it.name.orEmpty(), "on" to (it.id == now))
        }
        return mapOf(
            "audio" to list(mp.audioTracks, mp.audioTrack),
            "subs" to list(mp.spuTracks, mp.spuTrack),
            "rate" to speed.toDouble(),
        )
    }

    fun pick(kind: String, track: Int) {
        val mp = player ?: return
        if (kind == "audio") {
            speech = track
            mp.setAudioTrack(track)
        } else {
            text = track
            mp.setSpuTrack(track)
        }
    }

    fun rate(value: Double) {
        speed = value.toFloat()
        player?.rate = speed
    }

    fun position() = time

    fun frame() = if (ready) runCatching { video.bitmap }.getOrNull() else still

    fun close() {
        if (closed) return
        closed = true
        val mp = player
        player = null
        (parent as? ViewGroup)?.removeView(this)
        if (mp == null) return
        engine.worker.execute {
            mp.setEventListener(null)
            mp.stop()
            mp.setVolume(100)
            mp.setMedia(null)
            main.post { mp.vlcVout.detachViews() }
        }
    }
}
