package mlem.heads

import android.content.Context
import android.graphics.Typeface
import org.json.JSONObject
import java.io.File

class Palette(val badge: Int, val trashIcon: Int) {
    companion object {
        val fallback = Palette(0xFFE5484D.toInt(), 0xFF81828A.toInt())

        fun color(hex: String): Int {
            val h = hex.trim().removePrefix("#")
            val rgb = h.substring(0, 6).toLong(16)
            val a = if (h.length >= 8) h.substring(6, 8).toLong(16) else 0xFF
            return ((a shl 24) or rgb).toInt()
        }

        fun from(j: JSONObject): Palette? = runCatching {
            val c = j.getJSONObject("colors")
            Palette(color(c.getString("BACKGROUND_FEEDBACK_NOTIFICATION")), color(c.getString("TEXT_MUTED")))
        }.getOrNull()

        fun load(dir: File): Palette = runCatching { from(JSONObject(File(dir, "theme.json").readText())) }.getOrNull() ?: fallback
    }
}

class Fonts(context: Context) {
    private fun load(context: Context, name: String, fallback: Typeface): Typeface =
        runCatching { Typeface.createFromAsset(context.assets, "fonts/$name.ttf") }.getOrNull() ?: fallback

    val semibold = load(context, "ggsans-Semibold", Typeface.DEFAULT_BOLD)
    val bold = load(context, "ggsans-Bold", semibold)
}
