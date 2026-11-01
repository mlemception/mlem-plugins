@file:JvmName("Loader")

package mlem.vlc

import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.widget.Toast
import app.valenced.plugins.PluginScope
import app.valenced.plugins.plugin
import dalvik.system.DexClassLoader
import java.io.Closeable
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.DigestInputStream
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean
import java.util.function.Supplier
import java.util.zip.ZipInputStream

private object Anchor

private object State {
    @Volatile var phase = "idle"
    @Volatile var progress = 0.0
    @Volatile var error = ""
    @Volatile var restart = false
    val busy = AtomicBoolean(false)
}

private val retries = listOf(0L, 4000L, 15000L)

private fun abis() = if (Process.is64Bit()) Build.SUPPORTED_64_BIT_ABIS else Build.SUPPORTED_32_BIT_ABIS

private fun PluginScope.toast(text: String) {
    withAppContext { context ->
        Handler(Looper.getMainLooper()).post {
            Toast.makeText(context.applicationContext ?: context, text, Toast.LENGTH_LONG).show()
        }
    }
}

val vlcPlugin = plugin {
    var engine: Closeable? = null
    var running = false

    fun PluginScope.launch(libs: File) {
        val jar = File(pluginDir, "engine.jar").apply { setReadOnly() }
        val cache = File(storageDir, "dex").apply { mkdirs() }
        val loader = DexClassLoader(
            jar.path,
            cache.path,
            libs.path,
            Anchor::class.java.classLoader,
        )

        engine = loader.loadClass("mlem.vlc.engine.Engine")
            .getConstructor(PluginScope::class.java)
            .newInstance(this) as Closeable
    }

    fun PluginScope.download(force: Boolean) {
        if (!State.busy.compareAndSet(false, true)) return

        Thread {
            try {
                State.phase = "checking"
                State.error = ""
                for (wait in retries) {
                    Thread.sleep(wait)
                    if (!running) return@Thread
                    val libs = runCatching { fetch(this, force) }
                        .onFailure {
                            State.error = it.message ?: it.javaClass.simpleName
                            log.e("vlc engine download failed", it)
                        }
                        .getOrNull() ?: continue

                    State.phase = "ready"
                    if (engine != null) {
                        State.restart = force
                    } else if (running) {
                        runCatching { launch(libs) }.onFailure {
                            State.phase = "failed"
                            State.error = it.message ?: it.javaClass.simpleName
                            log.e("vlc failed to load", it)
                        }
                    }
                    return@Thread
                }
                State.phase = "failed"
                toast("VLC Player: couldnt download the engine, retry in its settings")
            } finally {
                State.busy.set(false)
            }
        }.start()
    }

    start {
        running = true

        bridge.registerMethod("mlemvlc.status") {
            @Suppress("UNCHECKED_CAST")
            val version = (engine as? Supplier<String?>)?.get().orEmpty()
            status(this, version)
        }
        bridge.registerMethod("mlemvlc.setAllVideos") { args ->
            val marker = File(storageDir, "discord-player")
            if (args[0] == true) marker.delete() else marker.createNewFile()
            null
        }
        bridge.registerMethod("mlemvlc.redownload") {
            if (State.phase != "bundled") download(true)
            null
        }

        val bundled = abis().firstOrNull { File(pluginDir, "jni/$it").isDirectory }
        if (bundled != null) {
            State.phase = "bundled"
            launch(File(pluginDir, "jni/$bundled"))
            return@start
        }

        download(false)
    }

    stop {
        running = false
        engine?.close()
        engine = null
        State.phase = "idle"
    }
}

private fun engineAbi(scope: PluginScope): String {
    val file = File(scope.pluginDir, "engine.json")
    if (!file.isFile) return abis().firstOrNull { File(scope.pluginDir, "jni/$it").isDirectory }.orEmpty()
    val info = JSONObject(file.readText())
    return abis().firstOrNull { info.has(it) }.orEmpty()
}

private fun status(scope: PluginScope, version: String): Map<String, Any> {
    val abi = runCatching { engineAbi(scope) }.getOrDefault("")
    val dirs = listOf(File(scope.storageDir, "engine"), File(scope.pluginDir, "jni/$abi"))
    val size = dirs.sumOf { dir -> dir.walkTopDown().filter { it.isFile }.sumOf { it.length() } }
    return mapOf(
        "phase" to State.phase,
        "progress" to State.progress,
        "error" to State.error,
        "restart" to State.restart,
        "abi" to abi,
        "size" to size.toDouble(),
        "version" to version,
        "allVideos" to !File(scope.storageDir, "discord-player").exists(),
    )
}

private fun fetch(scope: PluginScope, force: Boolean): File = synchronized(Anchor) {
    val info = JSONObject(File(scope.pluginDir, "engine.json").readText())
    val abi = abis().first { info.has(it) }
    val entry = info.getJSONObject(abi)
    val sha = entry.getString("sha256")
    val root = File(scope.storageDir, "engine")
    val libs = File(root, "$abi-${sha.take(12)}")
    if (libs.isDirectory && !force) return libs

    State.phase = "downloading"
    State.progress = 0.0
    if (!force) scope.toast("VLC Player: downloading engine")
    val zip = File(root.parentFile, "engine.zip")
    val digest = MessageDigest.getInstance("SHA-256")
    (URL(entry.getString("url")).openConnection() as HttpURLConnection).run {
        connectTimeout = 15000
        readTimeout = 30000
        check(responseCode == 200) { "engine download returned $responseCode" }
        val total = contentLengthLong
        inputStream.use { input ->
            zip.outputStream().use { output ->
                val stream = DigestInputStream(input, digest)
                val buffer = ByteArray(65536)
                var done = 0L
                while (true) {
                    val read = stream.read(buffer)
                    if (read < 0) break
                    output.write(buffer, 0, read)
                    done += read
                    if (total > 0) State.progress = done.toDouble() / total
                }
            }
        }
    }

    val got = digest.digest().joinToString("") { "%02x".format(it) }
    if (got != sha) {
        zip.delete()
        error("bad engine hash $got")
    }

    val tmp = File(root.parentFile, "engine-tmp")
    tmp.deleteRecursively()
    tmp.mkdirs()
    ZipInputStream(zip.inputStream()).use { input ->
        generateSequence { input.nextEntry }.forEach { item ->
            File(tmp, File(item.name).name).outputStream().use { input.copyTo(it) }
        }
    }
    zip.delete()
    root.deleteRecursively()
    root.mkdirs()
    require(tmp.renameTo(libs)) { "couldnt move engine" }
    scope.log.i("vlc engine ready")
    scope.toast("VLC Player: ready")
    return libs
}
