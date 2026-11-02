package mlem.vlc.engine

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.graphics.drawable.Drawable
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.CornerPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
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
val bouncy = PathInterpolator(0.34f, 1.56f, 0.64f, 1f)

private fun mix(a: Float, b: Float, t: Float) = a + (b - a) * t

class Glyph(context: Context, kind: Int, private val fill: Int) : View(context) {
    companion object {
        const val PLAY = 0
        const val PAUSE = 1
        const val REPLAY = 2
        const val CLOSE = 3
        const val AUDIO = 4
        const val FIT = 5
        const val ROTATE = 6
        const val DOWNLOAD = 7
    }

    var kind = kind
        set(value) {
            if (field == value) return
            val old = field
            field = value
            if (old <= PAUSE && value <= PAUSE) morphTo(if (value == PLAY) 1f else 0f) else swap(old)
        }

    var inward = false
        set(value) {
            if (field == value) return
            field = value
            animator(corners, if (value) 1f else 0f, 200) { corners = it }
        }

    private var morph = if (kind == PLAY) 1f else 0f
    private var corners = 0f
    private var previous = -1
    private var swapT = 1f
    private var morphing: ValueAnimator? = null

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val soft = Paint(paint).apply { pathEffect = CornerPathEffect(1.8f) }
    private val disc = Paint(Paint.ANTI_ALIAS_FLAG)
    private val path = Path()
    private val box = RectF()

    init {
        isClickable = true
    }

    private fun animator(from: Float, to: Float, duration: Long, set: (Float) -> Unit) =
        ValueAnimator.ofFloat(from, to).apply {
            this.duration = duration
            interpolator = emphasized
            addUpdateListener {
                set(it.animatedValue as Float)
                invalidate()
            }
            start()
        }

    private fun morphTo(to: Float) {
        morphing?.cancel()
        morphing = animator(morph, to, 220) { morph = it }
    }

    private fun swap(old: Int) {
        previous = old
        morph = if (kind == PLAY) 1f else 0f
        animator(0f, 1f, 180) { swapT = it }
    }

    override fun setPressed(pressed: Boolean) {
        super.setPressed(pressed)
        val scale = if (pressed) 0.84f else 1f
        animate().cancel()
        animate().scaleX(scale).scaleY(scale)
            .setDuration(if (pressed) 90 else 240)
            .setInterpolator(if (pressed) emphasized else bouncy)
            .start()
    }

    override fun onDraw(canvas: Canvas) {
        val size = minOf(width, height).toFloat()
        val cx = width / 2f
        val cy = height / 2f
        if (fill != 0) {
            disc.color = fill
            canvas.drawCircle(cx, cy, size / 2, disc)
        }

        val unit = size / (if (fill != 0) 46f else 38f)
        canvas.save()
        canvas.translate(cx, cy)
        canvas.scale(unit, unit)

        if (swapT < 1f && previous >= 0) {
            paint.alpha = ((1 - swapT) * 255).toInt()
            soft.alpha = paint.alpha
            canvas.save()
            canvas.scale(mix(1f, 0.6f, swapT), mix(1f, 0.6f, swapT))
            draw(canvas, previous)
            canvas.restore()
        }

        paint.alpha = (swapT * 255).toInt()
        soft.alpha = paint.alpha
        val grow = mix(0.6f, 1f, swapT)
        canvas.scale(grow, grow)
        draw(canvas, kind)
        canvas.restore()
    }

    private fun draw(canvas: Canvas, what: Int) {
        path.reset()
        paint.strokeWidth = 2.3f

        when (what) {
            PLAY, PAUSE -> {
                val t = morph
                soft.style = Paint.Style.FILL
                path.moveTo(mix(-7.5f, -6f, t), mix(-9f, -10f, t))
                path.lineTo(mix(-2.2f, 2.3f, t), mix(-9f, -5.1f, t))
                path.lineTo(mix(-2.2f, 2.3f, t), mix(9f, 5.1f, t))
                path.lineTo(mix(-7.5f, -6f, t), mix(9f, 10f, t))
                path.close()
                path.moveTo(mix(2.2f, 2f, t), mix(-9f, -5.3f, t))
                path.lineTo(mix(7.5f, 10.5f, t), mix(-9f, 0f, t))
                path.lineTo(mix(7.5f, 10.5f, t), mix(9f, 0f, t))
                path.lineTo(mix(2.2f, 2f, t), mix(9f, 5.3f, t))
                path.close()
                canvas.drawPath(path, soft)
            }
            REPLAY -> {
                paint.style = Paint.Style.STROKE
                box.set(-8f, -8f, 8f, 8f)
                canvas.drawArc(box, 20f, 280f, false, paint)
                soft.style = Paint.Style.FILL
                path.moveTo(7.2f, -5.2f)
                path.lineTo(5.3f, -10f)
                path.lineTo(2.2f, -4f)
                path.close()
                canvas.drawPath(path, soft)
            }
            CLOSE -> {
                paint.style = Paint.Style.STROKE
                canvas.drawLine(-6.5f, -6.5f, 6.5f, 6.5f, paint)
                canvas.drawLine(6.5f, -6.5f, -6.5f, 6.5f, paint)
            }
            AUDIO -> {
                paint.style = Paint.Style.STROKE
                box.set(-8f, -8f, 8f, 8f)
                canvas.drawArc(box, 180f, 180f, false, paint)
                canvas.drawLine(-8f, 0f, -8f, 2f, paint)
                canvas.drawLine(8f, 0f, 8f, 2f, paint)
                paint.style = Paint.Style.FILL
                canvas.drawRoundRect(-10f, 1f, -5.6f, 9f, 1.8f, 1.8f, paint)
                canvas.drawRoundRect(5.6f, 1f, 10f, 9f, 1.8f, 1.8f, paint)
            }
            FIT -> {
                paint.style = Paint.Style.STROKE
                val edge = mix(9f, 6f, corners)
                val arm = 4.5f
                for (sx in listOf(-1f, 1f)) {
                    for (sy in listOf(-1f, 1f)) {
                        val hook = if (corners > 0.5f) -arm else arm
                        path.moveTo(sx * edge, sy * (edge - hook))
                        path.lineTo(sx * edge, sy * edge)
                        path.lineTo(sx * (edge - hook), sy * edge)
                    }
                }
                canvas.drawPath(path, paint)
            }
            DOWNLOAD -> {
                paint.style = Paint.Style.STROKE
                canvas.drawLine(0f, -8f, 0f, 3f, paint)
                canvas.drawLine(-4.6f, -1.2f, 0f, 3.4f, paint)
                canvas.drawLine(4.6f, -1.2f, 0f, 3.4f, paint)
                canvas.drawLine(-7f, 8f, 7f, 8f, paint)
            }
            ROTATE -> {
                paint.style = Paint.Style.STROKE
                canvas.drawRoundRect(-5.5f, -9.5f, 5.5f, 9.5f, 2.6f, 2.6f, paint)
                canvas.drawLine(-1.6f, 6.2f, 1.6f, 6.2f, paint)
            }
        }
    }
}

@SuppressLint("ClickableViewAccessibility")
class Bar(context: Context) : View(context) {
    var onScrub: ((Float, Boolean) -> Unit)? = null

    var progress = 0f
        set(value) {
            if (held || field == value) return
            field = value
            invalidate()
        }

    private val density = resources.displayMetrics.density
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private var held = false
    private var at = 0f
    private var heat = 0f
    private var heating: ValueAnimator? = null

    private fun heatTo(to: Float) {
        heating?.cancel()
        heating = ValueAnimator.ofFloat(heat, to).apply {
            duration = 170
            interpolator = emphasized
            addUpdateListener {
                heat = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    override fun onDraw(canvas: Canvas) {
        val pad = 10 * density
        val cy = height / 2f
        val line = (3 + 3 * heat) * density
        val span = width - pad * 2
        val x = pad + span * (if (held) at else progress)
        val radius = line / 2

        paint.color = 0x47FFFFFF
        canvas.drawRoundRect(pad, cy - radius, width - pad, cy + radius, radius, radius, paint)
        paint.color = 0xFF5865F2.toInt()
        canvas.drawRoundRect(pad, cy - radius, x, cy + radius, radius, radius, paint)
        if (heat > 0f) {
            paint.color = 0x335865F2
            canvas.drawCircle(x, cy, (9 + 11 * heat) * density, paint)
        }
        paint.color = Color.WHITE
        canvas.drawCircle(x, cy, (6 + 3 * heat) * density, paint)
    }

    override fun onTouchEvent(e: MotionEvent): Boolean {
        val pad = 10 * density
        val fraction = ((e.x - pad) / (width - pad * 2)).coerceIn(0f, 1f)

        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                parent.requestDisallowInterceptTouchEvent(true)
                held = true
                at = fraction
                heatTo(1f)
                performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
                onScrub?.invoke(at, false)
            }
            MotionEvent.ACTION_MOVE -> {
                at = fraction
                invalidate()
                onScrub?.invoke(at, false)
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                held = false
                heatTo(0f)
                progress = fraction
                onScrub?.invoke(fraction, true)
            }
        }
        return true
    }
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
