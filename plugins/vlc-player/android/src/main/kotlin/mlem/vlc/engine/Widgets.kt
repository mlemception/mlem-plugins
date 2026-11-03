package mlem.vlc.engine

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.drawable.Drawable
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.CornerPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import android.view.TextureView
import android.view.View
import android.view.animation.PathInterpolator

val emphasized = PathInterpolator(0.2f, 0f, 0f, 1f)

fun whenPainted(view: TextureView, tries: Int = 30, done: () -> Unit) {
    val dot = runCatching { view.getBitmap(4, 4) }.getOrNull()
    val lit = dot != null && (0 until 16).any { dot.getPixel(it % 4, it / 4) and 0xFFFFFF != 0 }
    if (lit || tries == 0) done() else view.postDelayed({ whenPainted(view, tries - 1, done) }, 40)
}

fun asset(context: Context, name: String, fallback: Int): Drawable? {
    val res = context.resources
    val full = "design_components_icon_native_redesign_generated_images_$name"
    val id = res.getIdentifier(full, "drawable", context.packageName).takeIf { it != 0 }
        ?: res.getIdentifier(full, "drawable", "com.discord")
    return context.getDrawable(if (id != 0) id else fallback)
}

class SeekRipple(context: Context) : View(context) {
    private val density = resources.displayMetrics.density
    private val circle = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE }
    private val mark = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        pathEffect = CornerPathEffect(2 * density)
    }
    private val label = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textAlign = Paint.Align.CENTER
        textSize = 14 * density
        typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
    }
    private val path = Path()
    private var forward = true
    private var t = 1f
    private var seconds = 0
    private var running: ValueAnimator? = null

    fun play(forward: Boolean, seconds: Int) {
        this.forward = forward
        this.seconds = seconds
        running?.cancel()
        running = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 520
            addUpdateListener {
                t = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    override fun onDraw(canvas: Canvas) {
        if (t >= 1f) return
        val cy = height / 2f
        val side = if (forward) width * 1.1f else width * -0.1f
        val grow = emphasized.getInterpolation((t * 1.6f).coerceAtMost(1f))
        val fade = if (t > 0.55f) (1 - t) / 0.45f else 1f

        circle.alpha = (fade * 34).toInt()
        canvas.drawCircle(side, cy, width * 0.62f * grow, circle)

        val x = if (forward) width * 0.8f else width * 0.2f
        val u = 5 * density
        for (i in 0..2) {
            val lit = ((t * 3.2f - i * 0.5f).coerceIn(0f, 1f))
            val pulse = if (lit < 0.5f) lit * 2 else (1 - lit) * 2
            mark.alpha = (fade * (90 + 165 * pulse)).toInt()
            val at = x + (i - 1) * u * 2.2f * (if (forward) 1 else -1)
            val tip = if (forward) u else -u
            path.reset()
            path.moveTo(at - tip, cy - u * 1.1f - 8 * density)
            path.lineTo(at + tip, cy - 8 * density)
            path.lineTo(at - tip, cy + u * 1.1f - 8 * density)
            path.close()
            canvas.drawPath(path, mark)
        }

        label.alpha = (fade * 255).toInt()
        canvas.drawText("${seconds}s", x, cy + 24 * density, label)
    }
}
