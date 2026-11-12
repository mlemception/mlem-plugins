package mlem.heads

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo

fun Context.dp(v: Float) = v * resources.displayMetrics.density

private val tints = intArrayOf(0xFF5865F2.toInt(), 0xFF757E8A.toInt(), 0xFF3BA55C.toInt(), 0xFFFAA61A.toInt(), 0xFFED4245.toInt(), 0xFFEB459E.toInt())

fun badgeText(n: Int): String = if (n < 1000) n.toString() else {
    val k = n / 100 / 10f
    (if (k % 1f == 0f) k.toInt().toString() else k.toString()) + "K"
}

@SuppressLint("ViewConstructor")
class HeadView(context: Context, private val bold: Typeface) : View(context) {
    val face = context.dp(64f)
    val pad = context.dp(8f)
    val size = (face + pad * 2).toInt()

    var title = ""
        set(v) { field = v; invalidate() }
    var count = 0
        set(v) { if (field != v) { field = v; invalidate() } }
    var avatar: Bitmap? = null
        set(v) { field = v; shader = null; invalidate() }
    var badgeColor = 0xFFE5484D.toInt()
        set(v) { field = v; badge.color = v; invalidate() }
    var badgeStart = false
        set(v) { if (field != v) { field = v; invalidate() } }
    var chrome = true
        set(v) { if (field != v) { field = v; invalidate() } }

    var loading = false
        set(v) { if (field != v) { field = v; spinStart = System.currentTimeMillis(); invalidate() } }
    private var spinStart = 0L
    private val spin = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        color = Color.WHITE
        strokeWidth = context.dp(3f)
    }

    private var shader: Paint? = null
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val letter = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; textAlign = Paint.Align.CENTER; typeface = bold }
    private val badge = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = badgeColor }
    private val badgeText = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textAlign = Paint.Align.CENTER
        typeface = bold
        textSize = context.dp(12f)
    }
    private val box = RectF()

    init {
        elevation = context.dp(4f)
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
    }

    override fun onMeasure(w: Int, h: Int) = setMeasuredDimension(size, size)

    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        info.className = "android.widget.Button"
    }

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
        val p = faceShader()
        if (p != null) {
            c.drawCircle(cx, cy, r, p)
        } else {
            fill.color = tints[Math.floorMod(title.hashCode(), tints.size)]
            c.drawCircle(cx, cy, r, fill)
            letter.textSize = face * 0.4f
            val ch = title.trim().firstOrNull()?.uppercase() ?: "?"
            c.drawText(ch, cx, cy - (letter.ascent() + letter.descent()) / 2, letter)
        }
        if (loading) {
            val t = (System.currentTimeMillis() - spinStart) / 1000f
            val sweep = 40f + 240f * (0.5f - 0.5f * kotlin.math.cos(t * Math.PI.toFloat()))
            val inset = spin.strokeWidth / 2
            box.set(pad + inset, pad + inset, pad + face - inset, pad + face - inset)
            c.drawArc(box, (t * 360f) % 360f, sweep, false, spin)
            postInvalidateOnAnimation()
        }
        if (!chrome || count <= 0) return
        val label = badgeText(count)
        val h = context.dp(16f)
        val w = maxOf(h, badgeText.measureText(label) + context.dp(3f) * 2)
        val top = pad
        if (badgeStart) box.set(pad, top, pad + w, top + h) else box.set(pad + face - w, top, pad + face, top + h)
        c.drawRoundRect(box, context.dp(8f), context.dp(8f), badge)
        c.drawText(label, box.centerX(), box.centerY() - (badgeText.ascent() + badgeText.descent()) / 2, badgeText)
    }
}

class TrashView(context: Context, private val icon: Drawable?) : View(context) {
    val zoneW = context.dp(192f)
    val zoneH = context.dp(180f)
    private val circle = context.dp(64f)
    private val bottomGap = context.dp(48f)
    var active = false
        set(v) { if (field != v) { field = v; invalidate() } }
    var hover = 1f
        set(v) { field = v; invalidate() }
    var tint = 0xFF96979E.toInt()
        set(v) { field = v; invalidate() }
    private val glow = Paint(Paint.ANTI_ALIAS_FLAG)
    private val disc = Paint(Paint.ANTI_ALIAS_FLAG)
    private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.WHITE }

    init { importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS }

    fun centerX() = width / 2f
    fun centerY() = height - bottomGap - circle / 2

    fun zone() = RectF(centerX() - zoneW / 2, height - zoneH, centerX() + zoneW / 2, height.toFloat())

    override fun onSizeChanged(w: Int, h: Int, ow: Int, oh: Int) {
        glow.shader = RadialGradient(w / 2f, centerY(), zoneW / 2, 0x4D000000, 0, Shader.TileMode.CLAMP)
    }

    override fun onDraw(c: Canvas) {
        val cx = centerX()
        val cy = centerY()
        c.drawCircle(cx, cy, zoneW / 2, glow)
        val r = circle / 2 * hover
        disc.color = if (active) 0x4D1D1D1D else 0x991D1D1D.toInt()
        ring.strokeWidth = context.dp(if (active) 4f else 2f)
        c.drawCircle(cx, cy, r, disc)
        c.drawCircle(cx, cy, r - ring.strokeWidth / 2, ring)
        val s = (context.dp(24f) * hover).toInt()
        val d = icon
        if (d == null) {
            ring.color = tint
            val a = s * 0.3f
            c.drawLine(cx - a, cy - a, cx + a, cy + a, ring)
            c.drawLine(cx + a, cy - a, cx - a, cy + a, ring)
            ring.color = Color.WHITE
            return
        }
        d.setBounds((cx - s / 2).toInt(), (cy - s / 2).toInt(), (cx + s / 2).toInt(), (cy + s / 2).toInt())
        d.setTint(tint)
        d.draw(c)
    }
}
