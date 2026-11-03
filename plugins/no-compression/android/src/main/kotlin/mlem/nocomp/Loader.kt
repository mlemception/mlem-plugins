@file:JvmName("Loader")

package mlem.nocomp

import android.content.Context
import app.valenced.plugins.plugin
import dalvik.system.DexClassLoader
import java.io.Closeable
import java.io.File
import java.util.function.Function

private object Anchor

private val shared = listOf("java.", "javax.", "android.", "dalvik.", "org.json.", "org.w3c.", "org.xml.")

private class Own(path: String, cache: String, parent: ClassLoader) : DexClassLoader(path, cache, null, parent) {
    override fun loadClass(name: String, resolve: Boolean): Class<*> {
        if (shared.any { name.startsWith(it) }) return super.loadClass(name, resolve)
        synchronized(this) {
            findLoadedClass(name)?.let { return it }
            return runCatching { findClass(name) }.getOrElse { super.loadClass(name, resolve) }
        }
    }
}

val noCompression = plugin {
    var engine: Function<List<Any?>, Any?>? = null

    start {
        withAppContext { context ->
            val jar = File(pluginDir, "engine.jar").apply { setReadOnly() }
            val cache = File(storageDir, "dex").apply { mkdirs() }
            val loader = Own(jar.path, cache.path, Anchor::class.java.classLoader!!)
            @Suppress("UNCHECKED_CAST")
            engine = loader.loadClass("mlem.nocomp.engine.Engine")
                .getConstructor(Context::class.java, String::class.java)
                .newInstance(context.applicationContext ?: context, File(pluginDir, "res.apk").path) as Function<List<Any?>, Any?>
            withAppActivity { engine?.apply(listOf("activity", it)) }
        }

        bridge.registerMethod("mlemnc.run") { args -> engine?.apply(args) }
    }

    stop {
        (engine as? Closeable)?.close()
        engine = null
    }
}
