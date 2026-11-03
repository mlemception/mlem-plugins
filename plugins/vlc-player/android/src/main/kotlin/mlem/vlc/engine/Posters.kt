package mlem.vlc.engine

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.LruCache
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService

class Posters(private val root: File, private val disk: ExecutorService) {
    private val main = Handler(Looper.getMainLooper())
    private val dir = File(root, "posters").apply { mkdirs() }
    private val files = ConcurrentHashMap<String, File>()
    private val missing = ConcurrentHashMap.newKeySet<String>()
    private val memory = object : LruCache<String, Bitmap>(16 * 1024 * 1024) {
        override fun sizeOf(key: String, value: Bitmap) = value.byteCount
    }

    init {
        val all = dir.listFiles().orEmpty().sortedByDescending { it.lastModified() }
        all.drop(300).forEach { it.delete() }
        all.take(300).forEach { files[it.name.substringBefore('-')] = it }
    }

    private fun key(url: String): String {
        val path = Uri.parse(url).path.orEmpty()
        val hash = MessageDigest.getInstance("SHA-1").digest(path.toByteArray())
        return hash.joinToString("") { "%02x".format(it) }
    }

    fun now(image: Bitmap): File {
        val folder = File(root, "frames").apply { mkdirs() }
        folder.listFiles()?.forEach(File::delete)
        val out = File(folder, "${System.nanoTime()}.jpg")
        out.outputStream().use { image.compress(Bitmap.CompressFormat.JPEG, 92, it) }
        return out
    }

    fun file(url: String): File? = dir.listFiles()?.firstOrNull { it.name.startsWith(key(url)) }

    fun aspect(url: String): Float? {
        val parts = files[key(url)]?.nameWithoutExtension?.split('-') ?: return null
        val w = parts.getOrNull(1)?.toFloatOrNull() ?: return null
        val h = parts.getOrNull(2)?.toFloatOrNull() ?: return null
        return if (h > 0) w / h else null
    }

    fun miss(url: String) {
        missing += key(url)
    }

    fun missed(url: String) = key(url) in missing

    fun load(url: String, done: (Bitmap?) -> Unit) {
        val name = key(url)
        memory.get(name)?.let {
            done(it)
            return
        }
        val file = files[name]
        if (file == null) {
            done(null)
            return
        }
        runCatching {
            disk.execute {
                val image = runCatching { BitmapFactory.decodeFile(file.path) }.getOrNull()
                if (image != null) memory.put(name, image)
                main.post { done(image) }
            }
        }
    }

    fun save(url: String, image: Bitmap, ratio: Float) {
        val name = key(url)
        memory.put(name, image)
        val file = File(dir, "$name-${(ratio * 10000).toInt()}-10000.jpg")
        files[name] = file
        runCatching {
            disk.execute {
                runCatching {
                    file.outputStream().use { image.compress(Bitmap.CompressFormat.JPEG, 82, it) }
                }
            }
        }
    }
}
