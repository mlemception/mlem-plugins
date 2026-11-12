@file:JvmName("Loader")

package mlem.heads

import android.app.Notification
import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import app.valenced.plugins.plugin
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge

val chatHeads = plugin {
    val hooks = ArrayList<XC_MethodHook.Unhook>()
    var heads: Heads? = null
    var tests = 0
    var ready: Boolean? = null

    start {
        val report: (String, Throwable?) -> Unit = { m, t -> if (t != null) log.e("chat heads: $m", t) else log.w("chat heads: $m") }
        val running = runCatching { Class.forName("android.app.ActivityThread").getMethod("currentApplication").invoke(null) as? android.content.Context }.getOrNull()
        if (running != null) heads = Heads(running, storageDir, report).also { h -> ready?.let { h.cardReady = it } }
        else withAppContext { context ->
            if (heads == null) heads = Heads(context.applicationContext ?: context, storageDir, report).also { h -> ready?.let { h.cardReady = it } }
        }

        val nm = NotificationManager::class.java
        val int = Int::class.javaPrimitiveType
        hooks += XposedBridge.hookMethod(
            nm.getMethod("notify", String::class.java, int, Notification::class.java),
            object : XC_MethodHook() {
                override fun afterHookedMethod(param: MethodHookParam) {
                    val n = param.args[2] as? Notification ?: return
                    runCatching { heads?.posted(param.args[0] as String?, param.args[1] as Int, n) }
                        .onFailure { log.e("chat heads: bad notification", it) }
                }
            },
        )
        hooks += XposedBridge.hookMethod(
            nm.getMethod("cancel", String::class.java, int),
            object : XC_MethodHook() {
                override fun afterHookedMethod(param: MethodHookParam) {
                    heads?.cancelled(param.args[0] as String?, param.args[1] as Int)
                }
            },
        )
        hooks += XposedBridge.hookMethod(
            nm.getMethod("cancelAll"),
            object : XC_MethodHook() {
                override fun afterHookedMethod(param: MethodHookParam) {
                    heads?.cancelledAll()
                }
            },
        )

        bridge.registerMethod("mlemheads.allowed") { heads?.allowed() == true }
        bridge.registerMethod("mlemheads.permission") {
            withAppContext { context ->
                val i = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(i)
            }
            null
        }
        bridge.registerMethod("mlemheads.test") {
            heads?.test(tests++)
            heads?.allowed() == true
        }
        bridge.registerMethod("mlemheads.theme") { args ->
            (args.getOrNull(0) as? String)?.let { heads?.theme(it) }
            null
        }
        bridge.registerMethod("mlemheads.ready") { args ->
            val r = args.getOrNull(0) == true
            ready = r
            heads?.cardReady = r
            null
        }
        bridge.registerMethod("mlemheads.state") { heads?.state() }
        bridge.registerMethod("mlemheads.collapse") { heads?.collapseFromJs(); null }
        bridge.registerMethod("mlemheads.open") { args ->
            (args.getOrNull(0) as? String)?.let { heads?.openKey(it) }
            null
        }
        bridge.registerMethod("mlemheads.select") { args ->
            (args.getOrNull(0) as? String)?.let { heads?.selectKey(it) }
            null
        }
        bridge.registerMethod("mlemheads.keyboard") { args ->
            heads?.keyboard(args.getOrNull(0) == true)
            null
        }
        bridge.registerMethod("mlemheads.reply") { args ->
            val key = args.getOrNull(0) as? String ?: return@registerMethod false
            heads?.reply(key, args.getOrNull(1)?.toString().orEmpty()) == true
        }
        bridge.registerMethod("mlemheads.replied") { args ->
            (args.getOrNull(0) as? String)?.let { heads?.replied(it) }
            null
        }
    }

    stop {
        hooks.forEach { it.unhook() }
        hooks.clear()
        heads?.close()
        heads = null
    }
}
