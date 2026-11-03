package mlem.vlc.engine

import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URL
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

class Cache(private val dir: File) {
    private val server = ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"))
    private val pool = Executors.newCachedThreadPool()
    private val urls = ConcurrentHashMap<String, String>()
    private val owners = ConcurrentHashMap<String, Any>()

    init {
        dir.mkdirs()
        trim()
        pool.execute {
            while (!server.isClosed) runCatching { server.accept().let { pool.execute { runCatching { serve(it) } } } }
        }
    }

    fun local(url: String): String {
        val key = UUID.nameUUIDFromBytes(url.substringBefore('?').toByteArray()).toString()
        urls[key] = url
        return "http://127.0.0.1:${server.localPort}/$key"
    }

    fun have(url: String) = data(local(url).substringAfterLast('/')).length()
    fun total(url: String) = size(local(url).substringAfterLast('/'))

    fun file(url: String) = data(local(url).substringAfterLast('/')).takeIf { it.length() > 0 && it.length() == total(url) }

    fun close() {
        runCatching { server.close() }
        pool.shutdownNow()
    }

    private fun data(key: String) = File(dir, key)
    private fun size(key: String) = File(dir, "$key.size").takeIf { it.exists() }?.readText()?.toLongOrNull() ?: -1L

    private fun serve(socket: Socket) = socket.use {
        val input = socket.getInputStream()
        val path = line(input)?.split(' ')?.getOrNull(1)?.trimStart('/') ?: return
        var from = 0L
        while (true) {
            val header = line(input)?.takeIf { it.isNotEmpty() } ?: break
            if (header.startsWith("range:", true)) from = header.substringAfter('=').substringBefore('-').trim().toLongOrNull() ?: 0L
        }
        val url = urls[path] ?: return
        val out = socket.getOutputStream().buffered(1 shl 16)
        val file = data(path).also { it.setLastModified(System.currentTimeMillis()) }
        val me = Any()
        val have = synchronized(owners) { file.length().also { if (from <= it) owners[path] = me } }
        var total = size(path)
        if (total in 1..from) {
            out.write("HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */$total\r\nContent-Length: 0\r\n\r\n".toByteArray())
            out.flush()
            return
        }
        if (total > 0 && from < have) {
            head(out, from, total)
            file.inputStream().use { disk -> disk.skip(from); pump(disk, out, have - from) }
            if (have < total) fetch(url, have, path, out, false, me)
        } else {
            total = fetch(url, from, path, out, true, me)
        }
        out.flush()
        owners.remove(path, me)
        if (have < total) trim()
    }

    private fun fetch(url: String, from: Long, key: String, out: OutputStream, answer: Boolean, me: Any): Long {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            setRequestProperty("Range", "bytes=$from-")
            setRequestProperty("User-Agent", "Discord-Android")
            connectTimeout = 10_000
            readTimeout = 20_000
        }
        try {
            val total = conn.getHeaderField("Content-Range")?.substringAfter('/')?.toLongOrNull()
                ?: (conn.contentLengthLong + if (conn.responseCode == 206) from else 0)
            if (total > 0) File(dir, "$key.size").writeText(total.toString())
            if (answer) head(out, from, total)
            val body = conn.inputStream
            if (conn.responseCode == 200 && from > 0) body.skip(from)
            if (owners[key] !== me) {
                pump(body, out)
            } else {
                RandomAccessFile(data(key), "rw").use { sink ->
                    sink.seek(from)
                    pump(body, out) { buf, n -> synchronized(owners) { if (owners[key] === me) sink.write(buf, 0, n) } }
                }
            }
            return total
        } finally {
            conn.disconnect()
        }
    }

    private fun pump(from: InputStream, to: OutputStream, limit: Long = Long.MAX_VALUE, keep: ((ByteArray, Int) -> Unit)? = null) {
        val buf = ByteArray(1 shl 16)
        var left = limit
        while (left > 0) {
            val n = from.read(buf, 0, minOf(buf.size.toLong(), left).toInt())
            if (n < 0) break
            keep?.invoke(buf, n)
            to.write(buf, 0, n)
            left -= n
        }
    }

    private fun head(out: OutputStream, from: Long, total: Long) = out.write(
        ("HTTP/1.1 206 Partial Content\r\nAccept-Ranges: bytes\r\nContent-Type: application/octet-stream\r\n" +
            "Content-Range: bytes $from-${total - 1}/$total\r\nContent-Length: ${total - from}\r\nConnection: close\r\n\r\n").toByteArray(),
    )

    private fun line(input: InputStream): String? {
        val sb = StringBuilder()
        while (true) {
            val c = input.read()
            if (c < 0) return sb.takeIf { it.isNotEmpty() }?.toString()
            if (c == '\n'.code) return sb.toString().trimEnd('\r')
            sb.append(c.toChar())
        }
    }

    private fun trim() {
        val files = dir.listFiles { f -> !f.name.endsWith(".size") }?.sortedBy { it.lastModified() } ?: return
        var used = files.sumOf { it.length() }
        for (f in files) {
            if (used <= 100L shl 20) break
            if (owners.containsKey(f.name)) continue
            used -= f.length()
            f.delete()
            File(dir, "${f.name}.size").delete()
        }
    }
}
