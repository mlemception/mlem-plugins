@file:JvmName("Loader")

package mlem.vlc

import android.os.Build
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
import java.util.zip.ZipInputStream

private object Anchor

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

    start {
        running = true
        val bundled = Build.SUPPORTED_ABIS.firstOrNull { File(pluginDir, "jni/$it").isDirectory }
        if (bundled != null) {
            launch(File(pluginDir, "jni/$bundled"))
            return@start
        }

        Thread {
            runCatching {
                val libs = fetch(this)
                if (running) launch(libs)
            }.onFailure { log.e("vlc engine download failed", it) }
        }.start()
    }

    stop {
        running = false
        engine?.close()
        engine = null
    }
}

private fun fetch(scope: PluginScope): File {
    val info = JSONObject(File(scope.pluginDir, "engine.json").readText())
    val abi = Build.SUPPORTED_ABIS.first { info.has(it) }
    val entry = info.getJSONObject(abi)
    val sha = entry.getString("sha256")
    val root = File(scope.storageDir, "engine")
    val libs = File(root, "$abi-${sha.take(12)}")
    if (libs.isDirectory) return libs

    root.deleteRecursively()
    root.mkdirs()
    val zip = File(root, "engine.zip")
    val digest = MessageDigest.getInstance("SHA-256")
    (URL(entry.getString("url")).openConnection() as HttpURLConnection).run {
        connectTimeout = 15000
        readTimeout = 30000
        inputStream.use { input ->
            zip.outputStream().use { DigestInputStream(input, digest).copyTo(it) }
        }
    }

    val got = digest.digest().joinToString("") { "%02x".format(it) }
    if (got != sha) {
        zip.delete()
        error("bad engine hash $got")
    }

    val tmp = File(root, "tmp").apply { mkdirs() }
    ZipInputStream(zip.inputStream()).use { input ->
        generateSequence { input.nextEntry }.forEach { item ->
            File(tmp, File(item.name).name).outputStream().use { input.copyTo(it) }
        }
    }
    zip.delete()
    require(tmp.renameTo(libs)) { "couldnt move engine" }
    scope.log.i("vlc engine ready")
    return libs
}
