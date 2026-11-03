package mlem.nocomp.engine

import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.ContextWrapper
import android.content.res.AssetManager
import android.content.res.Resources
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import androidx.media3.transformer.VideoEncoderSettings
import java.io.Closeable
import java.io.File
import java.lang.ref.WeakReference
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.function.Function
import kotlin.math.ceil

private fun withShaders(base: Context, apk: String): Context {
    val pm = base.packageManager
    val info = pm.getPackageArchiveInfo(apk, 0)?.applicationInfo ?: return base
    info.sourceDir = apk
    info.publicSourceDir = apk
    val res = pm.getResourcesForApplication(info)
    return object : ContextWrapper(base) {
        override fun getResources(): Resources = res
        override fun getAssets(): AssetManager = res.assets
        override fun getApplicationContext(): Context = this
    }
}

class Engine(base: Context, apk: String) : Function<List<Any?>, Any?>, Closeable {
    private val context = withShaders(base, apk)
    private val app = base.applicationContext as? Application

    private class Job(val out: File) {
        @Volatile var state = "running"
        @Volatile var progress = 0
        @Volatile var error = ""
        @Volatile var done = 0L
        @Volatile var ends = 0L
        var first = 0L
        var from = 0
        val started = SystemClock.elapsedRealtime()
        var transformer: Transformer? = null
    }

    private val thread = HandlerThread("mlemnc").apply { start() }
    private val handler = Handler(thread.looper)
    private val main = Handler(Looper.getMainLooper())
    private val jobs = ConcurrentHashMap<String, Job>()
    private val holder = ProgressHolder()

    @Volatile private var label = "Sending..."
    @Volatile private var screen: WeakReference<Activity>? = null
    private var ticking = false

    private val watcher = object : Application.ActivityLifecycleCallbacks {
        override fun onActivityResumed(activity: Activity) {
            screen = WeakReference(activity)
        }

        override fun onActivityCreated(activity: Activity, state: Bundle?) {}
        override fun onActivityStarted(activity: Activity) {}
        override fun onActivityPaused(activity: Activity) {}
        override fun onActivityStopped(activity: Activity) {}
        override fun onActivitySaveInstanceState(activity: Activity, state: Bundle) {}
        override fun onActivityDestroyed(activity: Activity) {}
    }

    private val tick = object : Runnable {
        override fun run() {
            val job = jobs.values.firstOrNull { it.state == "running" }
            paint(job)
            if (job != null) main.postDelayed(this, 250) else ticking = false
        }
    }

    init {
        app?.registerActivityLifecycleCallbacks(watcher)
    }

    override fun apply(args: List<Any?>): Any? = when (args.getOrNull(0)) {
        "start" -> start(args[1] as String, (args[2] as Number).toInt(), (args[3] as Number).toInt())
        "status" -> status(args[1] as String)
        "cancel" -> {
            val id = args[1] as String
            handler.post { jobs.remove(id)?.let { it.transformer?.cancel(); it.out.delete() } }
            null
        }
        "label" -> {
            (args[1] as? String)?.let { label = it }
            null
        }
        "activity" -> {
            (args[1] as? Activity)?.let { screen = WeakReference(it) }
            null
        }
        else -> null
    }

    private fun start(uri: String, side: Int, bitrate: Int): String {
        val id = UUID.randomUUID().toString()
        val job = Job(File(context.cacheDir, "nc-$id.mp4"))
        jobs[id] = job

        handler.post {
            runCatching {
                val encoder = DefaultEncoderFactory.Builder(context)
                    .setRequestedVideoEncoderSettings(VideoEncoderSettings.Builder().setBitrate(bitrate).build())
                    .setEnableFallback(true)
                    .build()
                val transformer = Transformer.Builder(context)
                    .setLooper(thread.looper)
                    .setVideoMimeType(MimeTypes.VIDEO_H264)
                    .setEncoderFactory(encoder)
                    .setUsePlatformDiagnostics(false)
                    .addListener(object : Transformer.Listener {
                        override fun onCompleted(composition: Composition, result: ExportResult) {
                            job.progress = 100
                            job.done = SystemClock.elapsedRealtime()
                            job.state = "done"
                        }

                        override fun onError(composition: Composition, result: ExportResult, exception: ExportException) {
                            job.error = generateSequence(exception as Throwable) { it.cause }
                                .joinToString(" <- ") { "${it.javaClass.simpleName}: ${it.message}" }
                            job.state = "error"
                        }
                    })
                    .build()
                val item = EditedMediaItem.Builder(MediaItem.fromUri(Uri.parse(uri)))
                    .setEffects(Effects(listOf(), listOf(Presentation.createForShortSide(side))))
                    .build()
                val composition = Composition.Builder(EditedMediaItemSequence.Builder(item).build())
                    .setHdrMode(Composition.HDR_MODE_TONE_MAP_HDR_TO_SDR_USING_OPEN_GL)
                    .build()
                job.transformer = transformer
                transformer.start(composition, job.out.path)
                poll(job)
            }.onFailure {
                job.error = it.message ?: it.javaClass.simpleName
                job.state = "error"
            }
        }

        main.post {
            if (!ticking) {
                ticking = true
                main.post(tick)
            }
        }
        return id
    }

    private fun poll(job: Job) {
        if (job.state != "running") return
        val transformer = job.transformer ?: return
        if (transformer.getProgress(holder) == Transformer.PROGRESS_STATE_AVAILABLE && holder.progress != job.progress) {
            job.progress = holder.progress
            val now = SystemClock.elapsedRealtime()
            if (job.first == 0L) {
                job.first = now
                job.from = job.progress
            } else if (job.progress > job.from) {
                val guess = now + (now - job.first) * (100 - job.progress) / (job.progress - job.from)
                job.ends = if (job.ends == 0L || guess < job.ends) guess else (job.ends * 3 + guess) / 4
            }
        }
        handler.postDelayed({ poll(job) }, 250)
    }

    private fun paint(job: Job?) {
        val root = screen?.get()?.window?.decorView ?: return
        val text = if (job == null || job.ends == 0L) {
            label
        } else {
            val left = ceil((job.ends - SystemClock.elapsedRealtime()) / 1000.0).toInt().coerceAtLeast(0)
            "$label (eta: ${left}s)"
        }
        walk(root) { view ->
            val now = view.text?.toString() ?: return@walk
            if ((now == label || now.startsWith("$label (eta:")) && now != text) {
                view.text = text
                fit(view)
            }
        }
    }

    private fun fit(view: TextView) {
        val room = (view.parent as? View)?.width?.minus(view.left) ?: return
        view.measure(
            View.MeasureSpec.makeMeasureSpec(room, View.MeasureSpec.AT_MOST),
            View.MeasureSpec.makeMeasureSpec(view.height, View.MeasureSpec.EXACTLY),
        )
        view.layout(view.left, view.top, view.left + view.measuredWidth, view.bottom)
    }

    private fun walk(view: View, fn: (TextView) -> Unit) {
        if (view is TextView) fn(view)
        if (view is ViewGroup) for (i in 0 until view.childCount) walk(view.getChildAt(i), fn)
    }

    private fun status(id: String): Map<String, Any>? {
        val job = jobs[id] ?: return null
        val now = if (job.done > 0) job.done else SystemClock.elapsedRealtime()
        if (job.state != "running") jobs.remove(id)
        return mapOf(
            "state" to job.state,
            "progress" to job.progress.toDouble(),
            "elapsed" to (now - job.started).toDouble(),
            "eta" to (if (job.ends == 0L) -1.0 else ceil((job.ends - SystemClock.elapsedRealtime()) / 1000.0)),
            "error" to job.error,
            "path" to job.out.path,
            "size" to job.out.length().toDouble(),
        )
    }

    override fun close() {
        app?.unregisterActivityLifecycleCallbacks(watcher)
        main.removeCallbacks(tick)
        handler.post {
            jobs.values.forEach { it.transformer?.cancel() }
            jobs.clear()
        }
        thread.quitSafely()
    }
}
