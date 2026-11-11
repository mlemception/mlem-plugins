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

    start {
        withAppContext { context ->
            val app = context.applicationContext ?: context
            if (heads == null) heads = Heads(app, storageDir)
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
        bridge.registerMethod("mlemheads.me") { args ->
            heads?.me(args.getOrNull(0) as? String ?: "", args.getOrNull(1) as? String)
            null
        }
        bridge.registerMethod("mlemheads.sent") { args ->
            val channel = args.getOrNull(0)?.toString() ?: return@registerMethod null
            heads?.sent(channel, args.getOrNull(1)?.toString().orEmpty(), args.getOrNull(2) == true, args.getOrNull(3)?.toString())
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
