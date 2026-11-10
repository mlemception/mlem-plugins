@file:JvmName("Loader")

package mlem.speed

import android.os.Handler
import android.os.Looper
import android.view.View
import app.valenced.plugins.plugin
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import java.lang.reflect.Constructor
import java.lang.reflect.Field
import java.lang.reflect.Method
import java.lang.reflect.Modifier
import java.util.Collections
import java.util.WeakHashMap

private class Knob(val field: Field, val setter: Method, val make: Constructor<*>)

private val knobs = HashMap<Class<*>, Knob?>()
private val players = Collections.newSetFromMap(WeakHashMap<Any, Boolean>())
private val main = Handler(Looper.getMainLooper())
private val float = Float::class.javaPrimitiveType
private val skipped = listOf("java.", "javax.", "android.", "androidx.", "kotlin.", "com.facebook.")

@Volatile
private var rate = 1f

private fun isStatic(field: Field) = Modifier.isStatic(field.modifiers)

private fun params(type: Class<*>): Constructor<*>? {
    if (type.isPrimitive || type.isArray || skipped.any { type.name.startsWith(it) }) return null
    val make = runCatching { type.getDeclaredConstructor(float, float) }.getOrNull() ?: return null
    val fields = type.declaredFields.filterNot(::isStatic)
    if (fields.count { it.type == float } != 2 || fields.count { it.type == Int::class.javaPrimitiveType } != 1) return null
    if (type.declaredFields.none { isStatic(it) && it.type == type }) return null
    return make.apply { isAccessible = true }
}

private fun find(type: Class<*>): Knob? {
    for (field in type.declaredFields) {
        val holder = field.type
        if (isStatic(field) || holder.isPrimitive || skipped.any { holder.name.startsWith(it) }) continue
        val setters = runCatching { holder.methods + holder.declaredMethods }.getOrNull() ?: continue
        for (setter in setters) {
            if (setter.returnType != Void.TYPE || setter.parameterTypes.size != 1) continue
            val kind = setter.parameterTypes[0]
            val make = params(kind) ?: continue
            if (setters.none { it.parameterTypes.isEmpty() && it.returnType == kind }) continue
            field.isAccessible = true
            setter.isAccessible = true
            return Knob(field, setter, make)
        }
    }
    return null
}

private fun knob(type: Class<*>): Knob? = synchronized(knobs) {
    if (knobs.containsKey(type)) knobs[type] else find(type).also { knobs[type] = it }
}

private fun apply(player: Any) {
    val knob = knob(player.javaClass) ?: return
    runCatching {
        val exo = knob.field.get(player) ?: return
        knob.setter.invoke(exo, knob.make.newInstance(rate, 1f))
    }
}

private fun applyAll() = main.post {
    synchronized(players) { players.toList() }.forEach(::apply)
}

val playbackSpeed = plugin {
    var hook: XC_MethodHook.Unhook? = null

    start {
        val setTag = View::class.java.getMethod("setTag", Int::class.javaPrimitiveType, Any::class.java)
        hook = XposedBridge.hookMethod(setTag, object : XC_MethodHook() {
            override fun afterHookedMethod(param: MethodHookParam) {
                val value = param.args[1] ?: return
                val type = value.javaClass
                if (type.isArray || skipped.any { type.name.startsWith(it) }) return
                if (knob(type) == null) return
                synchronized(players) { players.add(value) }
                if (Looper.myLooper() == Looper.getMainLooper()) apply(value) else main.post { apply(value) }
            }
        })

        bridge.registerMethod("mlemspeed.rate") { args ->
            rate = (args.firstOrNull() as? Number)?.toFloat()?.takeIf { it > 0f } ?: 1f
            applyAll()
            null
        }
    }

    stop {
        hook?.unhook()
        hook = null
        rate = 1f
        applyAll()
        synchronized(players) { players.clear() }
    }
}
