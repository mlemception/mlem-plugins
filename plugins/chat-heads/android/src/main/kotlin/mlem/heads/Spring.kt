package mlem.heads

import android.view.Choreographer
import kotlin.math.abs
import kotlin.math.sqrt

class Spring(
    private val stiffness: Float = 200f,
    private val dampingRatio: Float = 0.75f,
    private val apply: (Float) -> Unit,
) : Choreographer.FrameCallback {
    var value = 0f
        private set
    var target = 0f
        private set
    private var velocity = 0f
    private var last = 0L
    var running = false
        private set
    private var done: (() -> Unit)? = null

    fun snap(v: Float) {
        cancel()
        value = v
        target = v
        velocity = 0f
        apply(v)
    }

    fun to(t: Float, startVelocity: Float? = null, end: (() -> Unit)? = null) {
        target = t
        done = end
        if (startVelocity != null) velocity = startVelocity
        if (!running) {
            running = true
            last = 0L
            Choreographer.getInstance().postFrameCallback(this)
        }
    }

    fun cancel() {
        if (running) Choreographer.getInstance().removeFrameCallback(this)
        running = false
        done = null
    }

    override fun doFrame(now: Long) {
        if (!running) return
        if (last == 0L) last = now - 16_666_666L
        var dt = ((now - last) / 1e9f).coerceAtMost(0.064f)
        last = now
        val damping = 2f * dampingRatio * sqrt(stiffness)
        while (dt > 0f) {
            val h = minOf(dt, 0.002f)
            val a = -stiffness * (value - target) - damping * velocity
            velocity += a * h
            value += velocity * h
            dt -= h
        }
        if (abs(value - target) < 0.5f && abs(velocity) < 1f) {
            value = target
            velocity = 0f
            running = false
            apply(value)
            val d = done
            done = null
            d?.invoke()
            return
        }
        apply(value)
        Choreographer.getInstance().postFrameCallback(this)
    }
}
