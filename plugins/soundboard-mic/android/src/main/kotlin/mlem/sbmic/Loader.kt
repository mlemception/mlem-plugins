@file:JvmName("Loader")

package mlem.sbmic

import android.media.AudioRecord
import app.valenced.plugins.plugin
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import java.io.File
import java.nio.ByteBuffer

val soundboardMic = plugin {
    val hooks = ArrayList<XC_MethodHook.Unhook>()
    var mixer: Mixer? = null
    var sounds: Sounds? = null
    var cache: File? = null

    start {
        val m = Mixer()
        mixer = m
        withAppContext { cache = File(it.cacheDir, "sbmic") }
        val s = Sounds { cache ?: File(storageDir, "cache") }
        sounds = s

        hooks += XposedBridge.hookMethod(
            AudioRecord::class.java.getMethod("read", ByteBuffer::class.java, Int::class.javaPrimitiveType),
            object : XC_MethodHook() {
                override fun afterHookedMethod(param: MethodHookParam) {
                    val rec = param.thisObject as AudioRecord
                    if (rec !== m.record) {
                        if (Thread.currentThread().name != "AudioRecordJavaThread") return
                        m.record = rec
                    }
                    val n = param.result as? Int ?: return
                    val b = param.args[0] as? ByteBuffer ?: return
                    try {
                        m.mix(rec, b, n)
                    } catch (t: Throwable) {
                        m.clear()
                        log.e("soundboard mic: mix failed", t)
                    }
                }
            },
        )

        bridge.registerMethod("mlemsbmic.state") {
            mapOf("live" to m.live(), "rate" to m.rate, "channels" to m.channels, "voices" to m.count())
        }
        bridge.registerAsyncMethod("mlemsbmic.prefetch") { args ->
            val id = args.getOrNull(0)?.toString() ?: return@registerAsyncMethod false
            val url = args.getOrNull(1)?.toString() ?: return@registerAsyncMethod false
            runCatching { s.get(id, url) }.onFailure { log.w("soundboard mic: prefetch $id failed: $it") }.isSuccess
        }
        bridge.registerAsyncMethod("mlemsbmic.play") { args ->
            val id = args.getOrNull(0)?.toString() ?: return@registerAsyncMethod -1
            val url = args.getOrNull(1)?.toString() ?: return@registerAsyncMethod -1
            val gain = (args.getOrNull(2) as? Number)?.toFloat() ?: 1f
            val pcm = runCatching { s.get(id, url) }.onFailure { log.w("soundboard mic: load $id failed: $it") }.getOrNull()
                ?: return@registerAsyncMethod -1
            m.play(Voice(id, pcm.data, pcm.rate, gain.coerceIn(0f, 2f)))
            pcm.ms * 1.0
        }
        bridge.registerMethod("mlemsbmic.stop") { args ->
            args.getOrNull(0)?.toString()?.let { m.stop(it) }
            null
        }
        bridge.registerMethod("mlemsbmic.stopAll") {
            m.clear()
            null
        }
    }

    stop {
        hooks.forEach { it.unhook() }
        hooks.clear()
        mixer?.clear()
        mixer = null
        sounds?.clear()
        sounds = null
    }
}
