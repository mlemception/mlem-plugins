package mlem.heads

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.view.View

fun Context.dp(v: Float) = v * resources.displayMetrics.density

private val tints = intArrayOf(0xFF5865F2.toInt(), 0xFF3BA55C.toInt(), 0xFFFAA61A.toInt(), 0xFFED4245.toInt(), 0xFFEB459E.toInt())

@SuppressLint("ViewConstructor")
class HeadView(context: Context, private val mark: Drawable?) : View(context) {
    val face = context.dp(56f)
    val pad = context.dp(10f)
    val size = (face + pad * 2).toInt()

    var title = ""
    var chrome = true
        set(v) { if (field != v) { field = v; invalidate() } }
    var count = 0
        set(v) { field = v; invalidate() }
    var avatar: Bitmap? = null
        set(v) { field = v; shader = null; invalidate() }

    private var shader: Paint? = null
    private val shadow = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.BLACK
        setShadowLayer(context.dp(6f), 0f, context.dp(2f), 0x55000000)
    }
    private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE }
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val blurple = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF5865F2.toInt() }
    private val letter = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textAlign = Paint.Align.CENTER
        typeface = Typeface.DEFAULT_BOLD
        textSize = context.dp(24f)
    }
    private val badge = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFF23F43.toInt() }
    private val badgeText = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textAlign = Paint.Align.CENTER
        typeface = Typeface.DEFAULT_BOLD
        textSize = context.dp(11f)
    }
    private val box = RectF()

    override fun onMeasure(w: Int, h: Int) = setMeasuredDimension(size, size)

    private fun faceShader(): Paint? {
        val bmp = avatar ?: return null
        shader?.let { return it }
        val s = BitmapShader(bmp, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
        val scale = face / minOf(bmp.width, bmp.height)
        s.setLocalMatrix(Matrix().apply {
            setScale(scale, scale)
            postTranslate(pad - (bmp.width * scale - face) / 2, pad - (bmp.height * scale - face) / 2)
        })
        return Paint(Paint.ANTI_ALIAS_FLAG).apply { this.shader = s }.also { shader = it }
    }

    override fun onDraw(c: Canvas) {
        val r = face / 2
        val cx = pad + r
        val cy = pad + r
        c.drawCircle(cx, cy, r, shadow)
        val p = faceShader()
        if (p != null) {
            c.drawCircle(cx, cy, r, p)
        } else {
            val tint = tints[Math.floorMod(title.hashCode(), tints.size)]
            fill.shader = LinearGradient(0f, pad, 0f, pad + face, tint, darker(tint), Shader.TileMode.CLAMP)
            c.drawCircle(cx, cy, r, fill)
            fill.shader = null
            val ch = title.trim().firstOrNull()?.uppercase() ?: "?"
            c.drawText(ch, cx, cy - (letter.ascent() + letter.descent()) / 2, letter)
        }

        if (!chrome) return
        if (mark != null) {
            val m = context.dp(20f)
            val ring2 = context.dp(2f)
            val mx = pad + context.dp(1f)
            val my = pad + face - m + context.dp(1f)
            c.drawCircle(mx + m / 2, my + m / 2, m / 2 + ring2, ring)
            c.drawCircle(mx + m / 2, my + m / 2, m / 2, blurple)
            val inset = m * 0.2f
            mark.setBounds((mx + inset).toInt(), (my + inset).toInt(), (mx + m - inset).toInt(), (my + m - inset).toInt())
            mark.draw(c)
        }

        if (count > 0) {
            val label = if (count > 99) "99+" else count.toString()
            val h = context.dp(20f)
            val w = maxOf(h, badgeText.measureText(label) + context.dp(12f))
            val right = pad + face + context.dp(4f)
            val top = pad - context.dp(4f)
            val edge = context.dp(2f)
            box.set(right - w - edge, top - edge, right + edge, top + h + edge)
            c.drawRoundRect(box, box.height() / 2, box.height() / 2, ring)
            box.set(right - w, top, right, top + h)
            c.drawRoundRect(box, h / 2, h / 2, badge)
            c.drawText(label, box.centerX(), box.centerY() - (badgeText.ascent() + badgeText.descent()) / 2, badgeText)
        }
    }

    private fun darker(c: Int): Int {
        val f = 0.72f
        return Color.argb(255, (Color.red(c) * f).toInt(), (Color.green(c) * f).toInt(), (Color.blue(c) * f).toInt())
    }
}

class TargetView(context: Context) : View(context) {
    var hot = 0f
        set(v) { field = v; invalidate() }
    val radius = context.dp(32f)
    val lift = context.dp(112f)
    private val shade = Paint()
    private val disc = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xE6202225.toInt() }
    private val edge = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = context.dp(1.5f)
        color = 0x40FFFFFF
    }
    private val cross = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        strokeWidth = context.dp(2.5f)
        strokeCap = Paint.Cap.ROUND
    }

    override fun onSizeChanged(w: Int, h: Int, ow: Int, oh: Int) {
        shade.shader = LinearGradient(0f, 0f, 0f, h.toFloat(), 0, 0x99000000.toInt(), Shader.TileMode.CLAMP)
    }

    fun centerY() = height - lift

    override fun onDraw(c: Canvas) {
        c.drawRect(0f, 0f, width.toFloat(), height.toFloat(), shade)
        val r = radius * (1f + 0.2f * hot)
        val cx = width / 2f
        val cy = centerY()
        c.drawCircle(cx, cy, r, disc)
        c.drawCircle(cx, cy, r, edge)
        val a = context.dp(9f)
        c.drawLine(cx - a, cy - a, cx + a, cy + a, cross)
        c.drawLine(cx + a, cy - a, cx - a, cy + a, cross)
    }
}
