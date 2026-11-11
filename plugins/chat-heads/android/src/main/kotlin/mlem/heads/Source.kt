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

class Msg(
    val key: String,
    val title: String,
    val text: String,
    val count: Int,
    val group: Boolean,
    val avatar: Bitmap?,
    val intent: PendingIntent?,
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

    val last = messages.lastOrNull()
    val group = x.getBoolean(Notification.EXTRA_IS_GROUP_CONVERSATION)
    val sender = last?.person("sender_person")
    val title = (x.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)
        ?: sender?.name
        ?: x.getCharSequence(Notification.EXTRA_TITLE))?.toString().orEmpty()
    val text = (last?.getCharSequence("text") ?: x.getCharSequence(Notification.EXTRA_TEXT))?.toString().orEmpty()

    val large = n.getLargeIcon().load(context, size)
    val face = sender?.icon.load(context, size)
    val avatar = if (group) large ?: face else face ?: large

    val key = n.shortcutId?.takeIf { it.isNotEmpty() } ?: "${tag.orEmpty()}|$id"
    return Msg(key, title, text, messages.size.coerceAtLeast(1), group, avatar, n.contentIntent)
}
