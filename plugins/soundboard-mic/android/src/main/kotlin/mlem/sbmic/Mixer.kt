package mlem.sbmic

import android.media.AudioFormat
import android.media.AudioRecord
import android.os.SystemClock
import java.nio.ByteBuffer
import java.nio.ByteOrder

class Voice(val id: String, private val pcm: ShortArray, private val rate: Int, private val gain: Float) {
    private var pos = 0.0
    var done = false
        private set

    fun next(step: Double): Float {
        val i = pos.toInt()
        if (i + 1 >= pcm.size) {
            done = true
            return 0f
        }
        val f = (pos - i).toFloat()
        pos += step
        return (pcm[i] * (1f - f) + pcm[i + 1] * f) * gain
    }

    fun step(out: Int) = 1.0 * rate / out
}

class Mixer {
    @Volatile private var voices: Array<Voice> = emptyArray()
    private val lock = Any()

    @Volatile var record: AudioRecord? = null
    @Volatile private var lastRead = 0L
    @Volatile var rate = 0
        private set
    @Volatile var channels = 0
        private set

    private var buffer: ByteBuffer? = null
    private var view: ByteBuffer? = null

    fun live() = record != null && SystemClock.elapsedRealtime() - lastRead < 500

    fun count() = voices.size

    fun play(v: Voice) = synchronized(lock) {
        voices = voices.filter { it.id != v.id }.toTypedArray() + v
    }

    fun stop(id: String) = synchronized(lock) {
        voices = voices.filter { it.id != id }.toTypedArray()
    }

    fun clear() = synchronized(lock) { voices = emptyArray() }

    fun mix(rec: AudioRecord, b: ByteBuffer, n: Int) {
        lastRead = SystemClock.elapsedRealtime()
        rate = rec.sampleRate
        channels = rec.channelCount
        val vs = voices
        if (vs.isEmpty() || n <= 0 || rec.audioFormat != AudioFormat.ENCODING_PCM_16BIT) return
        if (b !== buffer) {
            buffer = b
            view = b.duplicate().order(ByteOrder.LITTLE_ENDIAN)
        }
        val w = view ?: return
        val ch = channels.coerceAtLeast(1)
        val frames = n / 2 / ch
        val steps = DoubleArray(vs.size) { vs[it].step(rate) }
        for (f in 0 until frames) {
            var acc = 0f
            for (k in vs.indices) acc += vs[k].next(steps[k])
            if (acc == 0f) continue
            for (c in 0 until ch) {
                val at = (f * ch + c) * 2
                val s = (w.getShort(at) + acc).coerceIn(-32768f, 32767f)
                w.putShort(at, s.toInt().toShort())
            }
        }
        if (vs.any { it.done }) synchronized(lock) { voices = voices.filter { !it.done }.toTypedArray() }
    }
}
