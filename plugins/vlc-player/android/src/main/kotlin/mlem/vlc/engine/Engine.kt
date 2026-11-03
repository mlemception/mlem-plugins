package mlem.vlc.engine

import android.app.Activity
import android.app.DownloadManager
import android.content.ContentValues
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.graphics.Bitmap
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import app.valenced.plugins.PluginScope
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import org.json.JSONObject
import org.videolan.libvlc.LibVLC
import org.videolan.libvlc.Media
import org.videolan.libvlc.MediaPlayer
import java.io.Closeable
import java.io.File
import java.lang.reflect.Method
import java.lang.reflect.Modifier
import java.util.Collections
import java.util.WeakHashMap
import java.util.concurrent.Executors
import java.util.function.Function
import java.util.function.Supplier

class Core(val vlc: LibVLC, val player: MediaPlayer, val inline: MediaPlayer, val peek: MediaPlayer, val cache: Cache)

private val videoFile = Regex("""\.(mp4|m4v|webm|mov|mkv|avi|flv|wmv|ts|mpg|mpeg|3gp|ogv)$""", RegexOption.IGNORE_CASE)
private val hosts = Regex("""(^|\.)discordapp\.(net|com)$""")
private val folders = listOf("/attachments/", "/ephemeral-attachments/", "/external/")
private val described = Regex("""^MediaSource\(sourceUrl=(.*?), previewUrl=.*?, type=(\w+), shouldAutoPlay=(\w+)""")

private class Source(val url: String, val type: String, val autoPlay: Boolean)

private class Handoff(val tile: Tile, val reel: Reel?, val still: Bitmap?, val at: Long)

class Engine(private val scope: PluginScope) : Closeable, Supplier<String?>, Function<List<Any?>, Any?> {
    private val main = Handler(Looper.getMainLooper())
    val worker = Executors.newSingleThreadExecutor()
    private val disk = Executors.newSingleThreadExecutor()
    val posters = Posters(scope.storageDir, disk)
    private val hooks = mutableListOf<XC_MethodHook.Unhook>()
    private var core: Core? = null
    private var alive = true
    private var app: Context? = null
    private var active: Tile? = null
    private var peeking: Tile? = null
    private val waiting = ArrayDeque<Tile>()
    private val tiles = Collections.newSetFromMap(WeakHashMap<Tile, Boolean>())
    private var cardHook: XC_MethodHook.Unhook? = null
    private var focus: AudioFocusRequest? = null
    private val holds = WeakHashMap<View, View.OnLongClickListener>()
    var muted = false
    private var stage: Stage? = null
    private var handoff: Handoff? = null
    private var leaver: Tile? = null
    private var viewer = false

    val cache get() = core?.cache

    init {
        scope.withAppActivity { activity ->
            app = activity.application
            worker.execute { runCatching { warm() }.onFailure { scope.log.e("vlc failed to start", it) } }
        }
        runCatching { hookChat() }.onFailure { scope.log.e("chat hook failed", it) }
        runCatching { hookFiles() }.onFailure { scope.log.e("file hook failed", it) }
        runCatching { hookLinks() }.onFailure { scope.log.e("link hook failed", it) }
    }

    private val allVideos get() = !File(scope.storageDir, "discord-player").exists()
    private val fileCards get() = !File(scope.storageDir, "plain-files").exists()

    private fun wanted(url: String?): Boolean {
        val uri = runCatching { Uri.parse(url) }.getOrNull() ?: return false
        val path = uri.path ?: return false
        return hosts.containsMatchIn(uri.host ?: return false) && folders.any(path::startsWith) && videoFile.containsMatchIn(path)
    }

    fun media(core: Core, url: String, quiet: Boolean = false) = Media(core.vlc, Uri.parse(core.cache.local(url))).apply {
        setHWDecoderEnabled(true, false)
        addOption(":network-caching=1000")
        if (quiet) {
            addOption(":no-spu")
            addOption(":no-audio")
            addOption(":start-time=1")
        }
    }

    private fun hookChat() {
        val media = scope.classLoader.loadClass("com.discord.chat.presentation.message.view.MediaView")
        val setTag = View::class.java.getMethod("setTag", Int::class.javaPrimitiveType, Any::class.java)

        hooks += XposedBridge.hookMethod(setTag, object : XC_MethodHook() {
            override fun beforeHookedMethod(param: MethodHookParam) {
                val view = param.thisObject as View
                (param.args[1] as? View.OnLongClickListener)?.let { holds[view] = it }
                val click = param.args[1] as? View.OnClickListener ?: return
                if (mediaOf(view, media) == null) return
                param.args[1] = View.OnClickListener { target ->
                    val owner = mediaOf(view, media)
                    val source = owner?.let { runCatching { sourceOf(it) }.getOrNull() }
                    if (source != null && owner is ViewGroup && takes(source)) inline(owner, source) else click.onClick(target)
                }
            }
        })

        val setPlaying = media.declaredMethods.first {
            it.returnType == Void.TYPE &&
                it.parameterTypes.contentEquals(arrayOf(Boolean::class.javaPrimitiveType)) &&
                Modifier.isPublic(it.modifiers)
        }
        val players = media.declaredFields.first { it.type.simpleName == "MediaPlayerManagerModule" }
            .apply { isAccessible = true }

        hooks += XposedBridge.hookMethod(setPlaying, object : XC_MethodHook() {
            override fun afterHookedMethod(param: MethodHookParam) {
                if (param.args[0] != true) return
                val source = runCatching { sourceOf(param.thisObject) }.getOrNull() ?: return
                if (!takes(source) || source.autoPlay) return
                players.get(param.thisObject)?.let { it.javaClass.getMethod("pauseCurrentPlayer").invoke(it) }
                inline(param.thisObject as ViewGroup, source)
            }
        })
    }

    private fun takes(source: Source) = allVideos && source.type == "VIDEO"

    private fun inline(owner: ViewGroup, source: Source) {
        for (i in 0 until owner.childCount) if (owner.getChildAt(i) is Tile) return
        val tile = Tile(owner.context, source.url, this, true)
        tiles += tile
        owner.addView(tile, -1, -1)
        tile.measure(
            View.MeasureSpec.makeMeasureSpec(owner.width, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(owner.height, View.MeasureSpec.EXACTLY),
        )
        tile.layout(0, 0, owner.width, owner.height)
        val icons = (0 until owner.childCount).map(owner::getChildAt)
            .filter { it !== tile && it.visibility == View.VISIBLE && it.width in 1 until owner.width / 2 }
            .map { it to it.alpha }
        icons.forEach { (view, _) -> view.alpha = 0f }
        tile.undo = {
            icons.forEach { (view, alpha) -> view.alpha = alpha }
            tiles -= tile
        }
        tile.start()
    }

    private fun hookFiles() {
        val inflate = LayoutInflater::class.java.getMethod("inflate", Int::class.javaPrimitiveType, ViewGroup::class.java)
        hooks += XposedBridge.hookMethod(inflate, object : XC_MethodHook() {
            override fun afterHookedMethod(param: MethodHookParam) {
                if (cardHook != null) return
                val root = param.args[1] as? ViewGroup ?: return
                val res = root.resources
                val named = (0 until root.childCount).any {
                    val id = root.getChildAt(it).id
                    id != View.NO_ID && runCatching { res.getResourceEntryName(id) }.getOrNull() == "file_attachment_name"
                }
                if (!named) return
                val bind = bindOf(root.javaClass) ?: return
                cardHook = XposedBridge.hookMethod(bind, object : XC_MethodHook() {
                    override fun afterHookedMethod(param: MethodHookParam) {
                        runCatching { dress(param.thisObject as ViewGroup, param.args) }
                            .onFailure { scope.log.e("file card failed", it) }
                    }
                }).also { hooks += it }
            }
        })
    }

    private fun bindOf(type: Class<*>): Method? {
        var at: Class<*>? = type
        while (at != null && at != ViewGroup::class.java) {
            at.declaredMethods.firstOrNull {
                it.parameterCount > 8 && it.parameterTypes.take(3).all { p -> p == String::class.java }
            }?.let { return it }
            at = at.superclass
        }
        return null
    }

    private fun dress(card: ViewGroup, args: Array<Any?>) {
        val url = args.take(3).firstOrNull { (it as? String)?.startsWith("http") == true } as String?
        val children = (0 until card.childCount).map(card::getChildAt)
        val old = children.firstOrNull { it is Tile } as Tile?
        val spoiler = children.any { it.javaClass.simpleName == "SpoilerView" && it.visibility == View.VISIBLE }

        if (!fileCards || !wanted(url) || spoiler) {
            old?.undo?.invoke()
            return
        }
        if (old != null && old.url != url) old.undo?.invoke()
        val tile = if (old != null && old.url == url) old else {
            Tile(card.context, url!!, this, false).also {
                tiles += it
                card.addView(it, -1, -2)
            }
        }

        val hidden = (0 until card.childCount).map(card::getChildAt)
            .filter { it !== tile && it.visibility != View.GONE }
            .map { it to it.visibility }
        hidden.forEach { (view, _) -> view.visibility = View.GONE }
        val pads = intArrayOf(card.paddingLeft, card.paddingTop, card.paddingRight, card.paddingBottom)
        val back = card.background
        card.setPadding(0, 0, 0, 0)
        card.background = null

        val earlier = tile.undo
        tile.undo = {
            tile.undo = null
            earlier?.invoke()
            hidden.forEach { (view, state) -> view.visibility = state }
            if (back != null) card.background = back
            if (pads.any { it != 0 }) card.setPadding(pads[0], pads[1], pads[2], pads[3])
            tiles -= tile
            card.removeView(tile)
        }
    }

    private fun hookLinks() {
        val hook = object : XC_MethodHook() {
            override fun beforeHookedMethod(param: MethodHookParam) {
                val intent = param.args[0] as? Intent ?: return
                val url = intent.dataString
                if (intent.action != Intent.ACTION_VIEW || stage != null || !viewer || !wanted(url)) return
                if (show(param.thisObject as Context, url!!, 0, null, null)) param.result = null
            }
        }
        val intent = Intent::class.java
        val bundle = Bundle::class.java
        hooks += XposedBridge.hookMethod(Activity::class.java.getMethod("startActivity", intent, bundle), hook)
        hooks += XposedBridge.hookMethod(ContextWrapper::class.java.getMethod("startActivity", intent), hook)
        hooks += XposedBridge.hookMethod(ContextWrapper::class.java.getMethod("startActivity", intent, bundle), hook)
    }

    fun hold(from: View): Boolean {
        var at: View? = from
        while (at != null) {
            holds[at]?.let { return it.onLongClick(at) }
            at = at.parent as? View
        }
        return false
    }

    fun claim(tile: Tile) {
        if (active !== tile) active?.park()
        active = tile
        audio(true)
    }

    fun released(tile: Tile) {
        if (active !== tile) return
        active = null
        if (stage == null) audio(false)
    }

    fun returning(tile: Tile) = leaver === tile

    private fun audio(on: Boolean) {
        if (Build.VERSION.SDK_INT < 26) return
        val manager = app?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        if (!on) {
            focus?.let(manager::abandonAudioFocusRequest)
            return
        }
        val request = focus ?: AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE)
                    .build(),
            )
            .setOnAudioFocusChangeListener { change ->
                if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
                    active?.park()
                    stage?.pause(true)
                }
            }
            .build()
            .also { focus = it }
        manager.requestAudioFocus(request)
    }

    fun full(tile: Tile) {
        if (!viewer) return
        val at = tile.spot()
        val still = tile.still()
        val reel = tile.hand(still)
        active = null
        val going = Handoff(tile, reel, still, at)
        handoff = going
        if (!show(tile.context, tile.url, at, tile.box, still)) return restore()
        main.postDelayed({ if (handoff === going) restore() }, 5000)
    }

    private fun restore() {
        val back = handoff ?: return
        handoff = null
        back.tile.back(back.at, null)
        active = back.tile
        back.tile.take(back.reel)
        back.reel?.mp?.pause()
    }

    private fun show(from: Context, url: String, at: Long, box: View?, still: Bitmap?): Boolean = runCatching {
        val metrics = from.resources.displayMetrics
        val spot = IntArray(2)
        box?.getLocationInWindow(spot)
        val width = box?.width ?: metrics.widthPixels
        val height = box?.height ?: (metrics.widthPixels * 9 / 16)
        val text = JSONObject()
            .put("type", "open")
            .put("url", url)
            .put("at", at)
            .put("x", (if (box != null) spot[0] else 0) / metrics.density)
            .put("y", (if (box != null) spot[1] else (metrics.heightPixels - height) / 2) / metrics.density)
            .put("width", width / metrics.density)
            .put("height", height / metrics.density)
            .put("poster", posters.file(url)?.path ?: JSONObject.NULL)
            .put("frame", still?.let(posters::now)?.path ?: JSONObject.NULL)
            .toString()
        var context: Context? = from
        while (context != null) {
            val emit = runCatching { context.javaClass.getMethod("emitDeviceEvent", String::class.java, Any::class.java) }.getOrNull()
            if (emit != null) {
                emit.invoke(context, "mlemvlc", text)
                return@runCatching true
            }
            context = (context as? ContextWrapper)?.baseContext
        }
        false
    }.getOrDefault(false)

    override fun apply(args: List<Any?>): Any? {
        val action = args[0] as String
        val id = args.getOrNull(1) as? String
        val live = stage?.takeIf { it.id == id }
        return when (action) {
            "ready" -> {
                viewer = args.getOrNull(1) == true
                allVideos
            }
            "open" -> {
                main.post { mount(id!!, args[2] as String, (args[3] as Number).toLong(), args[4] == true, args[5] == true, 0) }
                null
            }
            "missed" -> main.post(::restore)
            "poll" -> live?.poll()
            "tracks" -> live?.tracks()
            "pause" -> main.post { live?.pause(args[2] == true) }
            "mute" -> main.post {
                muted = args[2] == true
                live?.mute(muted)
            }
            "seek" -> main.post { live?.seek((args[2] as Number).toDouble()) }
            "skip" -> main.post { live?.skip(args[2] == true) }
            "pick" -> main.post { live?.pick(args[2] as String, (args[3] as Number).toInt()) }
            "rate" -> main.post { live?.rate((args[2] as Number).toDouble()) }
            "save" -> main.post { save(args[1] as String, args[2] as String) }
            "leaving" -> main.post { stage?.let(::leaving) }
            "close" -> main.post {
                if (live == null) return@post
                leaving(live)
                val tile = leaver
                leaver = null
                val reel = live.give()
                stage = null
                audio(false)
                if (tile?.isAttachedToWindow == true) {
                    if (reel != null) active = tile
                    tile.take(reel)
                } else {
                    reel?.stop(this)
                }
            }
            else -> null
        }
    }

    fun mirror(url: String, image: Bitmap) {
        tiles.firstOrNull { it.away && it.url == url }?.mirror(image)
    }

    private fun leaving(live: Stage) {
        if (leaver != null) return
        val tile = tiles.firstOrNull { it.away && it.url == live.url } ?: return
        leaver = tile
        live.pause(true)
        tile.back(live.position(), live.frame())
    }

    private fun mount(id: String, url: String, at: Long, paused: Boolean, quiet: Boolean, tries: Int) {
        scope.withAppActivity { activity ->
            main.post {
                val host = holder(activity.window.decorView, id)
                if (host == null) {
                    if (tries < 40) main.postDelayed({ mount(id, url, at, paused, quiet, tries + 1) }, 50)
                    return@post
                }
                stage?.close()
                leaver?.let {
                    leaver = null
                    it.take(null)
                }
                muted = quiet
                audio(true)
                val given = handoff?.takeIf { it.tile.url == url }
                handoff = null
                stage = Stage(host.context, id, url, this, at, paused, quiet, given?.still, given?.reel).also { it.mount(host) }
            }
        }
    }

    private fun holder(root: View, id: String): ViewGroup? {
        val res = root.resources
        val key = res.getIdentifier("view_tag_native_id", "id", root.context.packageName).takeIf { it != 0 }
            ?: res.getIdentifier("view_tag_native_id", "id", "com.discord")
        fun walk(view: View): ViewGroup? {
            if (view !is ViewGroup) return null
            if (view.getTag(key) == id) return view
            for (i in 0 until view.childCount) walk(view.getChildAt(i))?.let { return it }
            return null
        }
        return walk(root)
    }

    private fun save(url: String, name: String) {
        val context = app ?: return
        val file = name.ifEmpty { Uri.parse(url).lastPathSegment ?: "video" }
        val cached = cache?.file(url)
        if (cached != null && Build.VERSION.SDK_INT >= 29) {
            disk.execute {
                runCatching {
                    val values = ContentValues().apply {
                        put(MediaStore.Downloads.DISPLAY_NAME, file)
                        put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                    }
                    val target = context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)!!
                    context.contentResolver.openOutputStream(target)!!.use { out -> cached.inputStream().use { it.copyTo(out) } }
                }
            }
            return
        }
        runCatching {
            val request = DownloadManager.Request(Uri.parse(url))
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, file)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            (context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
        }
    }

    fun queuePeek(tile: Tile) {
        if (posters.missed(tile.url) || tile in waiting || peeking === tile) return
        waiting.addLast(tile)
        main.postDelayed(::nextPeek, 260)
    }

    fun dropPeek(tile: Tile) {
        waiting.remove(tile)
    }

    fun peeked() {
        peeking = null
        main.post(::nextPeek)
    }

    private fun nextPeek() {
        if (peeking != null || !alive) return
        peeking = waiting.removeFirstOrNull()?.also { it.peek() }
    }

    private fun mediaOf(view: View, media: Class<*>): View? {
        var at: View? = view
        while (at != null && at.javaClass != media) at = at.parent as? View
        return at
    }

    private fun sourceOf(view: Any): Source? {
        for (field in view.javaClass.declaredFields) {
            if (field.type.isPrimitive || Modifier.isStatic(field.modifiers)) continue
            field.isAccessible = true
            val value = field.get(view) ?: continue
            val name = value.javaClass.name
            if (name.startsWith("android") || name.startsWith("java") || name.startsWith("kotlin")) continue
            val match = described.find(runCatching { value.toString() }.getOrNull() ?: continue) ?: continue
            return Source(match.groupValues[1], match.groupValues[2], match.groupValues[3] == "true")
        }
        return null
    }

    fun warm(): Core {
        core?.let { return it }
        val vlc = LibVLC(app!!, arrayListOf("--stats", "--no-osd", "--no-snapshot-preview", "--audio-time-stretch", "--http-reconnect"))
        vlc.setUserAgent("Discord", "Discord-Android")
        val cache = Cache(File(app!!.cacheDir, "app_media_player_vlc"))
        return Core(vlc, MediaPlayer(vlc), MediaPlayer(vlc), MediaPlayer(vlc), cache).also {
            core = it
            scope.log.i("vlc ready ${LibVLC.version()}")
        }
    }

    override fun get(): String? = if (core != null) LibVLC.version() else null

    override fun close() {
        alive = false
        hooks.forEach { it.unhook() }
        hooks.clear()
        main.post {
            stage?.close()
            waiting.clear()
            tiles.toList().forEach {
                it.halt()
                it.undo?.invoke()
            }
            active = null
            worker.execute {
                core?.run {
                    cache.close()
                    player.release()
                    inline.release()
                    peek.release()
                    vlc.release()
                }
                core = null
            }
            worker.shutdown()
            disk.shutdown()
        }
    }
}
