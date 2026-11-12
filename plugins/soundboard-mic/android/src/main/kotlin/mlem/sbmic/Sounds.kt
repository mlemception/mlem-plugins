package mlem.sbmic

import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteOrder
import java.util.concurrent.ConcurrentHashMap

class Pcm(val data: ShortArray, val rate: Int) {
    val ms get() = data.size * 1000L / rate
}

class Sounds(private val dir: () -> File) {
    private val decoded = object : LinkedHashMap<String, Pcm>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Pcm>?) = size > 12
    }
    private val locks = ConcurrentHashMap<String, Any>()

    fun cached(id: String) = synchronized(decoded) { decoded[id] }

    fun get(id: String, url: String): Pcm {
        cached(id)?.let { return it }
        synchronized(locks.getOrPut(id) { Any() }) {
            cached(id)?.let { return it }
            val pcm = decode(fetch(id, url))
            synchronized(decoded) { decoded[id] = pcm }
            return pcm
        }
    }

    fun clear() = synchronized(decoded) { decoded.clear() }

    private fun fetch(id: String, url: String): File {
        val u = URL(url)
        require(u.protocol == "https" && (u.host == "cdn.discordapp.com" || u.host == "media.discordapp.net")) { "bad url" }
        val d = dir().apply { mkdirs() }
        val f = File(d, id.filter { it.isLetterOrDigit() })
        if (f.length() > 0) return f
        val tmp = File(d, f.name + ".part")
        val c = u.openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 8000
            c.readTimeout = 8000
            if (c.responseCode != 200) error("http ${c.responseCode}")
            c.inputStream.use { i -> tmp.outputStream().use { i.copyTo(it) } }
        } finally {
            c.disconnect()
        }
        if (!tmp.renameTo(f)) error("rename")
        return f
    }

    private fun decode(file: File): Pcm {
        val ex = MediaExtractor()
        var codec: MediaCodec? = null
        try {
            ex.setDataSource(file.path)
            val track = (0 until ex.trackCount).first { ex.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true }
            ex.selectTrack(track)
            val format = ex.getTrackFormat(track)
            var rate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            var ch = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
            var float = false
            val c = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
            codec = c
            c.configure(format, null, null, 0)
            c.start()

            var out = ShortArray(rate * 2)
            var size = 0
            val info = MediaCodec.BufferInfo()
            var inputDone = false
            while (true) {
                if (!inputDone) {
                    val i = c.dequeueInputBuffer(10_000)
                    if (i >= 0) {
                        val n = ex.readSampleData(c.getInputBuffer(i)!!, 0)
                        if (n < 0) {
                            c.queueInputBuffer(i, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                            inputDone = true
                        } else {
                            c.queueInputBuffer(i, 0, n, ex.sampleTime, 0)
                            ex.advance()
                        }
                    }
                }
                val o = c.dequeueOutputBuffer(info, 10_000)
                if (o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    val f = c.outputFormat
                    rate = f.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                    ch = f.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                    float = f.containsKey(MediaFormat.KEY_PCM_ENCODING) && f.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_FLOAT
                } else if (o >= 0) {
                    val b = c.getOutputBuffer(o)!!.order(ByteOrder.LITTLE_ENDIAN)
                    b.position(info.offset)
                    b.limit(info.offset + info.size)
                    val frames = info.size / (if (float) 4 else 2) / ch
                    if (size + frames > out.size) out = out.copyOf(maxOf(out.size * 2, size + frames))
                    for (f in 0 until frames) {
                        var sum = 0f
                        for (k in 0 until ch) sum += if (float) b.getFloat() * 32767f else b.getShort().toFloat()
                        out[size++] = (sum / ch).coerceIn(-32768f, 32767f).toInt().toShort()
                    }
                    c.releaseOutputBuffer(o, false)
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0 || size > rate * 15) break
                }
            }
            return Pcm(out.copyOf(size), rate)
        } finally {
            runCatching { codec?.stop() }
            runCatching { codec?.release() }
            ex.release()
        }
    }
}
