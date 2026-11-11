package mlem.heads

import android.content.Context
import android.graphics.Typeface
import org.json.JSONObject
import java.io.File

class Palette(
    val surface: Int,
    val raised: Int,
    val border: Int,
    val strong: Int,
    val text: Int,
    val muted: Int,
    val inputBg: Int,
    val inputBorder: Int,
    val inputBorderActive: Int,
    val placeholder: Int,
    val inputText: Int,
    val send: Int,
    val sendIcon: Int,
    val sendIdle: Int,
    val iconMuted: Int,
    val icon: Int,
    val danger: Int,
    val ripple: Int,
    val hover: Int,
    val light: Boolean,
) {
    companion object {
        private fun of(hex: String, light: Boolean): Palette {
            val c = hex.trim().split(" ").map(::color)
            return Palette(c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8], c[9], c[10], c[11], c[12], c[13], c[14], c[15], c[16], c[17], c[18], light)
        }

        val KEYS = listOf(
            "BACKGROUND_SURFACE_HIGH", "BACKGROUND_SURFACE_HIGHEST", "BORDER_SUBTLE", "TEXT_STRONG", "TEXT_DEFAULT", "TEXT_MUTED",
            "MOBILE_CHATINPUT_BACKGROUND_DEFAULT", "MOBILE_CHATINPUT_BORDER_DEFAULT", "MOBILE_CHATINPUT_BORDER_ACTIVE",
            "INPUT_PLACEHOLDER_TEXT_DEFAULT", "INPUT_TEXT_DEFAULT", "CHAT_INPUT_SEND_BUTTON_ACTIVE_BACKGROUND",
            "CHAT_INPUT_SEND_BUTTON_ICON_ACTIVE_TINT", "BACKGROUND_MOD_SUBTLE", "ICON_MUTED", "ICON_DEFAULT", "TEXT_FEEDBACK_CRITICAL",
            "MOBILE_ANDROID_BUTTON_BACKGROUND_RIPPLE", "BACKGROUND_MOD_NORMAL",
        )

        val midnight = of("#0a0a0c #17181b #97979f33 #dcdcdf #d4d5d8 #81828a #19191c #97979f29 #97979f33 #7d7e87 #d4d5d8 #5865f2 #ffffff #97979f1f #81828a #d4d5d8 #eb5f5e #ffffff12 #97979f33", false)
        val dark = of("#393a41 #3f4048 #97979f1f #ffffff #f3f3f4 #abacb2 #3b3c43 #97979f0a #97979f1f #a4a5ab #f3f3f4 #5865f2 #ffffff #97979f1f #abacb2 #f3f3f4 #ffa09b #ffffff12 #97979f29", false)
        val light = of("#ffffff #ffffff #97979f47 #28282d #2e2e34 #6c6d76 #efeff1 #97979f33 #97979f47 #696a73 #2e2e34 #5865f2 #ffffff #97979f1f #6c6d76 #2e2e34 #b92733 #0000001f #97979f29", true)

        fun color(hex: String): Int {
            val h = hex.removePrefix("#")
            val rgb = h.substring(0, 6).toLong(16)
            val a = if (h.length >= 8) h.substring(6, 8).toLong(16) else 0xFF
            return ((a shl 24) or rgb).toInt()
        }

        fun from(j: JSONObject): Palette? = runCatching {
            val colors = j.getJSONObject("colors")
            val hex = KEYS.joinToString(" ") { colors.getString(it) }
            of(hex, j.optBoolean("light"))
        }.getOrNull()

        fun load(dir: File): Palette = runCatching {
            from(JSONObject(File(dir, "theme.json").readText()))
        }.getOrNull() ?: midnight
    }
}

class Fonts(context: Context) {
    private fun load(context: Context, name: String, fallback: Typeface): Typeface =
        runCatching { Typeface.createFromAsset(context.assets, "fonts/$name.ttf") }.getOrNull() ?: fallback

    val normal = load(context, "ggsans-Normal", Typeface.DEFAULT)
    val medium = load(context, "ggsans-Medium", normal)
    val semibold = load(context, "ggsans-Semibold", load(context, "ggsans-Bold", Typeface.DEFAULT_BOLD))
}
