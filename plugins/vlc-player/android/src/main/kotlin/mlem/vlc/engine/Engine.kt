package mlem.vlc.engine

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import app.valenced.plugins.PluginScope
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import org.videolan.libvlc.LibVLC
import org.videolan.libvlc.MediaPlayer
import java.io.Closeable
import java.io.File
import java.lang.reflect.Modifier
import java.util.concurrent.Executors
import java.util.function.Supplier

class Core(val vlc: LibVLC, val player: MediaPlayer)

private val videoFile = Regex("""\.(mp4|m4v|webm|mov|mkv|avi|flv|wmv|ts|mpg|mpeg|3gp|ogv)$""", RegexOption.IGNORE_CASE)
private val hosts = Regex("""(^|\.)discordapp\.(net|com)$""")
private val folders = listOf("/attachments/", "/ephemeral-attachments/", "/external/")
private val described = Regex("""^MediaSource\(sourceUrl=(.*?), previewUrl=.*?, type=(\w+), shouldAutoPlay=(\w+)""")

private class Source(val url: String, val type: String, val autoPlay: Boolean)

class Engine(private val scope: PluginScope) : Closeable, Supplier<String?> {
    private val main = Handler(Looper.getMainLooper())
    private val worker = Executors.newSingleThreadExecutor()
    private val hooks = mutableListOf<XC_MethodHook.Unhook>()
    private var core: Core? = null
    private var overlay: Overlay? = null
    private var alive = true
    private var app: Context? = null

    init {
        scope.withAppActivity { activity ->
            app = activity.application
            worker.execute {
                runCatching { warm() }.onFailure { scope.log.e("vlc failed to start", it) }
            }
        }

        runCatching { hookViewer() }.onFailure { scope.log.e("viewer hook failed", it) }
        runCatching { hookChat() }.onFailure { scope.log.e("chat hook failed", it) }
        runCatching { hookLinks() }.onFailure { scope.log.e("link hook failed", it) }
    }

    private val allVideos get() = !File(scope.storageDir, "discord-player").exists()

    private fun wanted(url: String?): Boolean {
        if (url == null) return false
        val uri = runCatching { Uri.parse(url) }.getOrNull() ?: return false
        val path = uri.path ?: return false
        val host = uri.host ?: return false
        return hosts.containsMatchIn(host) && folders.any(path::startsWith) && videoFile.containsMatchIn(path)
    }

    private fun open(url: String, popViewer: Boolean, source: View? = null) {
        if (!alive) return
        val name = Uri.parse(url).lastPathSegment.orEmpty()
        scope.withAppActivity { activity ->
            main.post {
                if (overlay != null) return@post
                overlay = Overlay(activity, url, name, worker, ::warm, source) {
                    overlay = null
                    source?.visibility = View.VISIBLE
                    if (popViewer) activity.onBackPressed()
                }
            }
        }
    }

    private fun hookViewer() {
        val manager = scope.classLoader.loadClass("com.brentvatne.exoplayer.ReactExoplayerViewManager")
        val setSrc = manager.declaredMethods.first { it.name == "setSrc" && it.parameterCount == 2 }

        hooks += XposedBridge.hookMethod(setSrc, object : XC_MethodHook() {
            override fun beforeHookedMethod(param: MethodHookParam) {
                val src = param.args[1] ?: return
                val url = src.javaClass.getMethod("getString", String::class.java).invoke(src, "uri") as? String
                if (!allVideos || !wanted(url)) return
                param.result = null
                open(url!!, true)
            }
        })
    }

    private fun hookChat() {
        val media = scope.classLoader.loadClass("com.discord.chat.presentation.message.view.MediaView")
        val setTag = View::class.java.getMethod("setTag", Int::class.javaPrimitiveType, Any::class.java)

        hooks += XposedBridge.hookMethod(setTag, object : XC_MethodHook() {
            override fun beforeHookedMethod(param: MethodHookParam) {
                val click = param.args[1] as? View.OnClickListener ?: return
                val view = param.thisObject as View
                if (mediaOf(view, media) == null) return
                param.args[1] = View.OnClickListener { target ->
                    val owner = mediaOf(view, media)
                    val source = owner?.let { runCatching { sourceOf(it) }.getOrNull() }
                    if (source != null && takes(source)) open(source.url, false, owner) else click.onClick(target)
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
                open(source.url, false, param.thisObject as View)
            }
        })
    }

    private fun takes(source: Source) = allVideos && source.type == "VIDEO"

    private fun mediaOf(view: View, media: Class<*>): View? {
        var at: View? = view
        while (at != null) {
            if (at.javaClass == media) return at
            at = at.parent as? View
        }
        return null
    }

    private fun sourceOf(view: Any): Source? {
        for (field in view.javaClass.declaredFields) {
            if (field.type.isPrimitive || Modifier.isStatic(field.modifiers)) continue
            field.isAccessible = true
            val value = field.get(view) ?: continue
            val name = value.javaClass.name
            if (name.startsWith("android") || name.startsWith("java") || name.startsWith("kotlin")) continue
            val text = runCatching { value.toString() }.getOrNull() ?: continue
            val match = described.find(text) ?: continue
            return Source(match.groupValues[1], match.groupValues[2], match.groupValues[3] == "true")
        }
        return null
    }

    private fun hookLinks() {
        val hook = object : XC_MethodHook() {
            override fun beforeHookedMethod(param: MethodHookParam) {
                val intent = param.args[0] as? Intent ?: return
                if (intent.action != Intent.ACTION_VIEW) return
                val url = intent.dataString
                if (!wanted(url)) return
                param.result = null
                open(url!!, false)
            }
        }

        val intent = Intent::class.java
        val bundle = Bundle::class.java
        hooks += XposedBridge.hookMethod(Activity::class.java.getMethod("startActivity", intent, bundle), hook)
        hooks += XposedBridge.hookMethod(ContextWrapper::class.java.getMethod("startActivity", intent), hook)
        hooks += XposedBridge.hookMethod(ContextWrapper::class.java.getMethod("startActivity", intent, bundle), hook)
    }

    private fun warm(): Core {
        core?.let { return it }

        val vlc = LibVLC(
            app!!,
            arrayListOf(
                "--no-stats",
                "--no-osd",
                "--no-snapshot-preview",
                "--audio-time-stretch",
                "--http-reconnect",
            ),
        )
        vlc.setUserAgent("Discord", "Discord-Android")
        return Core(vlc, MediaPlayer(vlc)).also {
            core = it
            scope.log.i("vlc ready ${LibVLC.version()}")
        }
    }

    override fun get(): String? = if (core != null) LibVLC.version() else null

    override fun close() {
        alive = false
        hooks.forEach { it.unhook() }
        hooks.clear()
        main.post { overlay?.dismiss() }
        worker.execute {
            core?.let {
                it.player.release()
                it.vlc.release()
            }
            core = null
        }
        worker.shutdown()
    }
}
