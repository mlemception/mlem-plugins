package mlem.heads

import android.app.Notification
import android.app.PendingIntent
import android.app.Person
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.graphics.drawable.Icon
import android.os.Build
import android.os.Bundle
import android.os.Parcelable

class Line(
    val senderKey: String,
    val sender: String,
    val text: String,
    val time: Long,
    val mine: Boolean,
    val avatar: Bitmap?,
)

class Msg(
    val key: String,
    val title: String,
    val text: String,
    val count: Int,
    val group: Boolean,
    val avatar: Bitmap?,
    val intent: PendingIntent?,
    val lines: List<Line>,
    val reply: Notification.Action?,
    val selfName: String,
)

@Suppress("DEPRECATION")
private fun Bundle.person(key: String): Person? =
    if (Build.VERSION.SDK_INT >= 33) getParcelable(key, Person::class.java) else getParcelable(key)

private fun Drawable.toBitmap(size: Int): Bitmap {
    if (this is BitmapDrawable && bitmap != null) return bitmap
    val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    setBounds(0, 0, size, size)
    draw(Canvas(out))
    return out
}

private fun Icon?.load(context: Context, size: Int): Bitmap? =
    this?.let { runCatching { it.loadDrawable(context)?.toBitmap(size) }.getOrNull() }

fun read(context: Context, tag: String?, id: Int, n: Notification, size: Int): Msg? {
    if (n.flags and (Notification.FLAG_GROUP_SUMMARY or Notification.FLAG_ONGOING_EVENT or Notification.FLAG_FOREGROUND_SERVICE) != 0) return null
    val x = n.extras ?: return null
    @Suppress("DEPRECATION")
    val raw: Array<Parcelable>? = if (Build.VERSION.SDK_INT >= 33)
        x.getParcelableArray(Notification.EXTRA_MESSAGES, Parcelable::class.java)
    else x.getParcelableArray(Notification.EXTRA_MESSAGES)
    val messages = raw?.filterIsInstance<Bundle>().orEmpty()
    if (messages.isEmpty() && n.category != Notification.CATEGORY_MESSAGE) return null

    val user = x.person(Notification.EXTRA_MESSAGING_PERSON)
    val selfName = (user?.name ?: x.getCharSequence(Notification.EXTRA_SELF_DISPLAY_NAME))?.toString().orEmpty()
    val faces = HashMap<String, Bitmap?>()
    val lines = messages.mapNotNull { b ->
        val p = b.person("sender_person")
        val text = b.getCharSequence("text")?.toString() ?: return@mapNotNull null
        val mine = p == null || (user?.key != null && p.key == user.key)
        val key = p?.key ?: p?.name?.toString() ?: "me"
        Line(
            senderKey = key,
            sender = (p?.name ?: b.getCharSequence("sender") ?: selfName).toString(),
            text = text,
            time = b.getLong("time"),
            mine = mine,
            avatar = if (mine) null else faces.getOrPut(key) { p?.icon.load(context, size) },
        )
    }

    val last = lines.lastOrNull { !it.mine }
    val group = x.getBoolean(Notification.EXTRA_IS_GROUP_CONVERSATION)
    val title = (x.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)
        ?: last?.sender
        ?: x.getCharSequence(Notification.EXTRA_TITLE))?.toString().orEmpty()
    val text = last?.text ?: x.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()

    val large = n.getLargeIcon().load(context, size)
    val face = last?.avatar
    val avatar = if (group) large ?: face else face ?: large

    val unread = lines.size - (lines.indexOfLast { it.mine } + 1)
    val reply = n.actions?.firstOrNull { !it.remoteInputs.isNullOrEmpty() }

    val key = n.shortcutId?.takeIf { it.isNotEmpty() } ?: "${tag.orEmpty()}|$id"
    return Msg(key, title, text, if (lines.isEmpty()) 1 else unread, group, avatar, n.contentIntent, lines, reply, selfName)
}
