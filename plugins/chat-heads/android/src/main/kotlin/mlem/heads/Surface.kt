package mlem.heads

import android.app.Application
import android.content.Context
import android.os.Bundle
import android.view.View
import java.io.File
import java.lang.reflect.Field
import java.lang.reflect.Modifier
import java.util.concurrent.atomic.AtomicReference

class Surface(private val app: Application, private val cache: File, private val log: (String, Throwable?) -> Unit) {
    private var surface: Any? = null
    private var binding: Any? = null
    var view: View? = null
        private set

    private fun fields(c: Class<*>): List<Field> {
        val out = ArrayList<Field>()
        var k: Class<*>? = c
        while (k != null && k != Any::class.java) {
            for (f in k.declaredFields) if (!Modifier.isStatic(f.modifiers)) { f.isAccessible = true; out += f }
            k = k.superclass
        }
        return out
    }

    private var hostRef: Any? = null
    private var ctxGetter: java.lang.reflect.Method? = null
    private var emitter: java.lang.reflect.Method? = null
    private var listenersField: Field? = null
    private val visual by lazy { visualContext() }

    private fun host(): Any? {
        hostRef?.let { return it }
        return findHost()?.also { hostRef = it }
    }

    private fun findHost(): Any? {
        val hostClass = runCatching { Class.forName("com.facebook.react.runtime.ReactHostImpl", false, app.classLoader) }.getOrNull() ?: return null
        val seen = HashSet<Int>()
        fun scan(o: Any?, depth: Int): Any? {
            if (o == null || depth > 3 || !seen.add(System.identityHashCode(o))) return null
            if (hostClass.isInstance(o)) return o
            val n = o.javaClass.name
            if (n.startsWith("java.") || n.startsWith("android.")) return null
            for (f in fields(o.javaClass)) {
                if (f.type.isPrimitive) continue
                scan(runCatching { f.get(o) }.getOrNull(), depth + 1)?.let { return it }
            }
            return null
        }
        return scan(app, 0)
    }

    private fun reactContext(host: Any): Any? {
        val m = ctxGetter ?: run {
            val rc = Class.forName("com.facebook.react.bridge.ReactContext", false, app.classLoader)
            host.javaClass.declaredMethods.firstOrNull { it.parameterCount == 0 && rc.isAssignableFrom(it.returnType) }
                ?.also { it.isAccessible = true; ctxGetter = it }
        } ?: return null
        return m.invoke(host)
    }

    private fun context(): Any? = host()?.let { reactContext(it) }

    fun hasContext(): Boolean = runCatching {
        val c = context() ?: return false
        c.javaClass.getMethod("getFabricUIManager").invoke(c) != null
    }.getOrDefault(false)

    fun emit(payload: String): Boolean = runCatching {
        val c = context() ?: return false
        val m = emitter ?: c.javaClass.getMethod("emitDeviceEvent", String::class.java, Any::class.java).also { emitter = it }
        m.invoke(c, "mlemheads", payload)
        true
    }.onFailure { log("emit failed", it) }.getOrDefault(false)

    fun warm(): Boolean = runCatching {
        val host = host() ?: return false
        val m = host.javaClass.declaredMethods.firstOrNull {
            !Modifier.isStatic(it.modifiers) && it.parameterCount == 1 &&
                it.parameterTypes[0] == Int::class.javaPrimitiveType && it.returnType != Void.TYPE
        } ?: return false
        m.isAccessible = true
        m.invoke(host, 0)
        true
    }.onFailure { log("warm failed", it) }.getOrDefault(false)

    fun frames(on: Boolean) = runCatching {
        val c = context() ?: return@runCatching
        val f = listenersField ?: fields(c.javaClass).first { it.name == "mLifecycleEventListeners" }.also { listenersField = it }
        val set = f.get(c) as Iterable<*>
        for (l in set) {
            val n = l?.javaClass?.name ?: continue
            if (n.startsWith("com.facebook.react.fabric") || n.startsWith("com.swmansion.reanimated")) {
                l.javaClass.getMethod(if (on) "onHostResume" else "onHostPause").invoke(l)
            }
        }
    }.onFailure { log("frames failed", it) }

    private fun visualContext(): Context {
        if (android.os.Build.VERSION.SDK_INT < 30) return app
        return runCatching {
            val dm = app.getSystemService(android.hardware.display.DisplayManager::class.java)
            val display = dm.getDisplay(android.view.Display.DEFAULT_DISPLAY)
            val w = app.createDisplayContext(display).createWindowContext(android.view.WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, null)
            android.view.ContextThemeWrapper(w, app.applicationInfo.theme)
        }.getOrDefault(app)
    }

    fun start(module: String, props: Bundle): View? = runCatching {
        stop()
        val host = host() ?: error("no react host")
        val ctx = reactContext(host) ?: error("no react context")
        val hf = fields(host.javaClass)
        val sets = hf.mapNotNull { f -> f.get(host) as? java.util.HashSet<*> }
        val set = sets.firstOrNull { s -> s.any { isSurface(it?.javaClass) } } ?: sets.singleOrNull() ?: error("no surface set")
        val running = set.firstOrNull { isSurface(it?.javaClass) }?.javaClass
        if (running != null) runCatching { cache.writeText(running.name) }
        val surfClass = running ?: runCatching { Class.forName(cache.readText().trim(), false, app.classLoader) }.getOrNull()
            ?.takeIf { isSurface(it) } ?: error("no surface class")
        val s = surfClass.getConstructor(Context::class.java, String::class.java, Bundle::class.java).newInstance(visual, module, props)
        val delegate = hf.first { it.type.name.endsWith("DefaultReactHostDelegate") }.get(host)!!
        val factory = fields(delegate.javaClass).first { f -> f.type.interfaces.any { it.name == "kotlin.jvm.functions.Function2" } }.get(delegate)!!
        val v = factory.javaClass.getMethod("invoke", Any::class.java, Any::class.java).invoke(factory, visual, s) as View
        val sf = fields(surfClass)
        val refs = sf.filter { it.type == AtomicReference::class.java }
        @Suppress("UNCHECKED_CAST")
        (refs[0].get(s) as AtomicReference<Any?>).set(v)
        @Suppress("UNCHECKED_CAST")
        (refs[1].get(s) as AtomicReference<Any?>).set(host)
        sf.firstOrNull { it.type == Context::class.java }?.set(s, v.context)
        val b = sf.first { it.type.name.endsWith("SurfaceHandlerBinding") }.get(s)!!
        @Suppress("UNCHECKED_CAST")
        synchronized(set) { (set as java.util.HashSet<Any?>).add(s) }
        surface = s
        binding = b
        view = v
        v
    }.onFailure { log("surface failed", it); stop() }.getOrNull()

    private var learned = false

    fun learn() {
        if (learned) return
        runCatching {
            val host = host() ?: return
            val c = fields(host.javaClass).firstNotNullOfOrNull { f ->
                (f.get(host) as? java.util.HashSet<*>)?.firstOrNull { isSurface(it?.javaClass) }?.javaClass
            } ?: return
            if (runCatching { cache.readText().trim() }.getOrNull() != c.name) cache.writeText(c.name)
            learned = true
        }.onFailure { log("learn failed", it) }
    }

    private fun isSurface(c: Class<*>?): Boolean = c != null &&
        runCatching { c.getConstructor(Context::class.java, String::class.java, Bundle::class.java) }.isSuccess &&
        fields(c).any { it.type.name.endsWith("SurfaceHandlerBinding") }

    fun run(): Boolean = runCatching {
        val v = view ?: return false
        val ctx = context() ?: return false
        val fab = ctx.javaClass.getMethod("getFabricUIManager").invoke(ctx)!!
        fab.javaClass.methods.first { it.name == "startSurface" && it.parameterCount == 3 && it.parameterTypes[1] == Context::class.java }
            .invoke(fab, binding, v.context, v)
        frames(true)
        true
    }.onFailure { log("surface start failed", it); stop() }.getOrDefault(false)

    fun stop() {
        val s = surface ?: return
        surface = null
        val b = binding
        binding = null
        view = null
        runCatching {
            val host = host() ?: return@runCatching
            val ctx = reactContext(host) ?: return@runCatching
            val fab = ctx.javaClass.getMethod("getFabricUIManager").invoke(ctx)!!
            if (b != null) fab.javaClass.methods.first { it.name == "stopSurface" && it.parameterCount == 1 && it.parameterTypes[0].name.endsWith("SurfaceHandlerBinding") }.invoke(fab, b)
            fields(host.javaClass).firstNotNullOfOrNull { f -> (f.get(host) as? java.util.HashSet<*>)?.takeIf { it.contains(s) } }?.let { synchronized(it) { (it as java.util.HashSet<*>).remove(s) } }
        }.onFailure { log("surface stop failed", it) }
    }
}
