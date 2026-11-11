package mlem.heads

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Outline
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.text.Editable
import android.text.InputFilter
import android.text.InputType
import android.text.TextUtils
import android.text.TextWatcher
import android.text.format.DateUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.text.DateFormat
import kotlin.math.max
import kotlin.math.min

class Pending(val text: String, val time: Long) {
    var state = SENDING
    var nonce: String? = null

    companion object {
        const val SENDING = 0
        const val SENT = 1
        const val FAILED = 2
    }
}

class Me(val name: String, val avatar: Bitmap?)

interface CardHost {
    fun send(head: Head, text: String)
    fun retry(head: Head, p: Pending)
    fun openInDiscord(head: Head)
    fun wantKeyboard()
}

private val tints = intArrayOf(0xFF5865F2.toInt(), 0xFF3BA55C.toInt(), 0xFFFAA61A.toInt(), 0xFFED4245.toInt(), 0xFFEB459E.toInt())

private fun Context.sp(v: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, v, resources.displayMetrics)

@SuppressLint("ViewConstructor")
class AvatarView(context: Context, private val px: Int) : View(context) {
    var bitmap: Bitmap? = null
        set(v) { field = v; paint = null; invalidate() }
    var name = ""
        set(v) { field = v; invalidate() }
    private var paint: Paint? = null
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val letter = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; textAlign = Paint.Align.CENTER }

    fun font(t: android.graphics.Typeface) { letter.typeface = t }

    override fun onMeasure(w: Int, h: Int) = setMeasuredDimension(px, px)

    override fun onDraw(c: Canvas) {
        val r = px / 2f
        val b = bitmap
        if (b != null) {
            val p = paint ?: Paint(Paint.ANTI_ALIAS_FLAG).apply {
                val s = BitmapShader(b, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
                val k = px.toFloat() / min(b.width, b.height)
                s.setLocalMatrix(Matrix().apply { setScale(k, k); postTranslate((px - b.width * k) / 2, (px - b.height * k) / 2) })
                shader = s
            }.also { paint = it }
            c.drawCircle(r, r, r, p)
            return
        }
        fill.color = tints[Math.floorMod(name.hashCode(), tints.size)]
        c.drawCircle(r, r, r, fill)
        letter.textSize = px * 0.42f
        val ch = name.trim().firstOrNull()?.uppercase() ?: "?"
        c.drawText(ch, r, r - (letter.ascent() + letter.descent()) / 2, letter)
    }
}

@SuppressLint("ViewConstructor")
class SendButton(context: Context, private val icon: Drawable?) : View(context) {
    private val bg = Paint(Paint.ANTI_ALIAS_FLAG)
    private var on = 0f
    var idle = 0
    var active = 0
    var idleIcon = 0
    var activeIcon = 0
    var enabledNow = false
        private set
    private var anim: ValueAnimator? = null

    fun setOn(v: Boolean, animate: Boolean) {
        if (v == enabledNow && animate) return
        enabledNow = v
        isEnabled = v
        anim?.cancel()
        if (!animate) { on = if (v) 1f else 0f; invalidate(); return }
        anim = ValueAnimator.ofFloat(on, if (v) 1f else 0f).apply {
            duration = 160
            addUpdateListener { on = it.animatedValue as Float; invalidate() }
            start()
        }
        if (v) {
            scaleX = 0.86f; scaleY = 0.86f
            animate().scaleX(1f).scaleY(1f).setDuration(260).setInterpolator(OvershootInterpolator(2.2f)).start()
        }
    }

    private fun mix(a: Int, b: Int, t: Float): Int {
        fun ch(s: Int) = ((a shr s and 0xFF) + ((b shr s and 0xFF) - (a shr s and 0xFF)) * t).toInt() shl s
        return ch(24) or ch(16) or ch(8) or ch(0)
    }

    override fun onDraw(c: Canvas) {
        val r = min(width, height) / 2f
        bg.color = mix(idle, active, on)
        c.drawCircle(width / 2f, height / 2f, r, bg)
        val d = icon ?: return
        val s = (r * 1.0f).toInt()
        val l = (width - s) / 2 + (r * 0.06f).toInt()
        val t = (height - s) / 2
        d.setBounds(l, t, l + s, t + s)
        d.setTint(mix(idleIcon, activeIcon, on))
        d.draw(c)
    }
}

@SuppressLint("ViewConstructor")
class OpenIcon(context: Context) : View(context) {
    var tint = Color.WHITE
        set(v) { field = v; paint.color = v; invalidate() }
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val path = Path()

    override fun onDraw(c: Canvas) {
        val s = min(width, height) * 0.42f
        val cx = width / 2f
        val cy = height / 2f
        val l = cx - s / 2
        val t = cy - s / 2
        paint.strokeWidth = s * 0.11f
        path.reset()
        path.moveTo(l + s * 0.45f, t)
        path.lineTo(l + s * 0.15f, t)
        path.quadTo(l, t, l, t + s * 0.15f)
        path.lineTo(l, t + s * 0.85f)
        path.quadTo(l, t + s, l + s * 0.15f, t + s)
        path.lineTo(l + s * 0.85f, t + s)
        path.quadTo(l + s, t + s, l + s, t + s * 0.85f)
        path.lineTo(l + s, t + s * 0.55f)
        path.moveTo(l + s * 0.62f, t - s * 0.02f)
        path.lineTo(l + s * 1.02f, t - s * 0.02f)
        path.lineTo(l + s * 1.02f, t + s * 0.38f)
        path.moveTo(l + s * 1.0f, t)
        path.lineTo(l + s * 0.48f, t + s * 0.52f)
        c.drawPath(path, paint)
    }
}

class Caret(context: Context) : View(context) {
    var fill = 0
        set(v) { field = v; invalidate() }
    var edge = 0
        set(v) { field = v; invalidate() }
    private val p = Paint(Paint.ANTI_ALIAS_FLAG)
    private val path = Path()

    override fun onDraw(c: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        val r = h * 0.28f
        path.reset()
        path.moveTo(0f, h)
        path.lineTo(w / 2 - r, r * 0.9f)
        path.quadTo(w / 2, -r * 0.2f, w / 2 + r, r * 0.9f)
        path.lineTo(w, h)
        p.style = Paint.Style.FILL
        p.color = fill
        c.drawPath(path, p)
        p.style = Paint.Style.STROKE
        p.strokeWidth = context.dp(1f)
        p.color = edge
        c.drawPath(path, p)
        p.style = Paint.Style.FILL
        p.color = fill
        c.drawRect(context.dp(1f), h - context.dp(0.5f), w - context.dp(1f), h + context.dp(1.5f), p)
    }
}

class MaxScroll(context: Context) : ScrollView(context) {
    var maxPx = Int.MAX_VALUE

    override fun onMeasure(w: Int, h: Int) {
        super.onMeasure(w, MeasureSpec.makeMeasureSpec(maxPx.coerceAtLeast(0), MeasureSpec.AT_MOST))
    }
}

@SuppressLint("ClickableViewAccessibility")
class Card(
    private val context: Context,
    private val fonts: Fonts,
    private val host: CardHost,
) {
    var pal = Palette.midnight
    var me = Me("", null)
    var head: Head? = null
        private set

    private val sendIcon = runCatching {
        val id = context.resources.getIdentifier("ic_send_white_24dp", "drawable", context.packageName)
        context.resources.getDrawable(id, null).mutate()
    }.getOrNull()

    val root = FrameLayout(context).apply { clipChildren = false; clipToPadding = false }
    private val caret = Caret(context)
    private val body = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
    private val title = TextView(context)
    private val sub = TextView(context)
    private val open = OpenIcon(context)
    private val openBox = FrameLayout(context)
    private val scroll = MaxScroll(context).apply {
        isVerticalScrollBarEnabled = false
        overScrollMode = View.OVER_SCROLL_NEVER
        isFillViewport = false
        isVerticalFadingEdgeEnabled = true
        setFadingEdgeLength(context.dp(18f).toInt())
    }
    private val list = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
    private val composer = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.BOTTOM }
    private val input = EditText(context)
    private val send = SendButton(context, sendIcon)
    private val elsewhere = TextView(context)

    private val caretW = context.dp(22f).toInt()
    private val caretH = context.dp(10f).toInt()
    private var caretX = 0f
    private var caretAnim: ValueAnimator? = null
    private var shown = 0
    var maxHeight = Int.MAX_VALUE
        set(v) { field = v; fit() }

    init {
        build()
        apply()
    }

    private fun build() {
        val d = { v: Float -> context.dp(v).toInt() }
        root.addView(body, FrameLayout.LayoutParams(-1, -2).apply { topMargin = caretH - d(1f) })
        root.addView(caret, FrameLayout.LayoutParams(caretW, caretH))
        body.elevation = context.dp(14f)
        body.outlineProvider = ViewOutlineProvider.BACKGROUND
        body.clipToOutline = true

        val top = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(d(16f), d(10f), d(6f), d(2f))
        }
        val names = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        title.apply {
            typeface = fonts.semibold
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
            includeFontPadding = false
        }
        sub.apply {
            typeface = fonts.medium
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
            includeFontPadding = false
            setPadding(0, d(3f), 0, 0)
        }
        names.addView(title)
        names.addView(sub)
        top.addView(names, LinearLayout.LayoutParams(0, -2, 1f))
        openBox.addView(open, FrameLayout.LayoutParams(-1, -1))
        openBox.contentDescription = "Open in Discord"
        openBox.setOnClickListener { head?.let(host::openInDiscord) }
        top.addView(openBox, LinearLayout.LayoutParams(d(40f), d(40f)))
        body.addView(top, LinearLayout.LayoutParams(-1, -2))

        list.setPadding(d(16f), d(2f), d(16f), d(8f))
        scroll.addView(list, FrameLayout.LayoutParams(-1, -2))
        body.addView(scroll, LinearLayout.LayoutParams(-1, -2))

        composer.setPadding(d(12f), d(4f), d(12f), d(12f))
        input.apply {
            typeface = fonts.normal
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            minHeight = d(44f)
            maxLines = 5
            setPadding(d(16f), d(10f), d(16f), d(10f))
            gravity = Gravity.CENTER_VERTICAL or Gravity.START
            imeOptions = EditorInfo.IME_ACTION_SEND or EditorInfo.IME_FLAG_NO_EXTRACT_UI or EditorInfo.IME_FLAG_NO_FULLSCREEN
            setRawInputType(InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES or InputType.TYPE_TEXT_FLAG_AUTO_CORRECT or InputType.TYPE_TEXT_VARIATION_SHORT_MESSAGE)
            setHorizontallyScrolling(false)
            filters = arrayOf(InputFilter.LengthFilter(2000))
            setOnEditorActionListener { _, action, e ->
                val enter = e != null && e.keyCode == KeyEvent.KEYCODE_ENTER && e.action == KeyEvent.ACTION_DOWN
                if (action == EditorInfo.IME_ACTION_SEND || enter) { submit(); true } else false
            }
            setOnTouchListener { _, ev ->
                if (ev.actionMasked == android.view.MotionEvent.ACTION_DOWN) host.wantKeyboard()
                false
            }
            setOnFocusChangeListener { _, _ -> styleInput() }
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun afterTextChanged(s: Editable?) {
                    send.setOn(!s.isNullOrBlank(), true)
                    head?.draft = s?.toString().orEmpty()
                }
            })
        }
        composer.addView(input, LinearLayout.LayoutParams(0, -2, 1f))
        send.contentDescription = "Send"
        send.setOnClickListener { submit() }
        send.setOn(false, false)
        composer.addView(send, LinearLayout.LayoutParams(d(44f), d(44f)).apply { marginStart = d(8f) })
        body.addView(composer, LinearLayout.LayoutParams(-1, -2))

        elsewhere.apply {
            typeface = fonts.medium
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            gravity = Gravity.CENTER
            text = "Reply in Discord"
            minHeight = d(44f)
            setOnClickListener { head?.let(host::openInDiscord) }
        }
        body.addView(elsewhere, LinearLayout.LayoutParams(-1, -2).apply { setMargins(d(12f), d(4f), d(12f), d(12f)) })
    }

    fun apply() {
        val d = { v: Float -> context.dp(v) }
        body.background = GradientDrawable().apply {
            cornerRadius = d(20f)
            setColor(pal.surface)
            setStroke(d(1f).toInt(), pal.border)
        }
        caret.fill = pal.surface
        caret.edge = pal.border
        title.setTextColor(pal.strong)
        sub.setTextColor(pal.muted)
        open.tint = pal.icon
        openBox.background = RippleDrawable(ColorStateList.valueOf(pal.ripple), null, GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.WHITE) })
        input.setTextColor(pal.inputText)
        input.setHintTextColor(pal.placeholder)
        input.highlightColor = (pal.send and 0x00FFFFFF) or 0x55000000
        styleInput()
        send.idle = pal.sendIdle
        send.active = pal.send
        send.idleIcon = pal.iconMuted
        send.activeIcon = pal.sendIcon
        send.invalidate()
        elsewhere.setTextColor(pal.strong)
        elsewhere.background = RippleDrawable(ColorStateList.valueOf(pal.ripple), GradientDrawable().apply { cornerRadius = d(22f); setColor(pal.sendIdle) }, null)
        render(false)
    }

    private fun styleInput() {
        input.background = GradientDrawable().apply {
            cornerRadius = context.dp(22f)
            setColor(pal.inputBg)
            setStroke(context.dp(1f).toInt(), if (input.hasFocus()) pal.inputBorderActive else pal.inputBorder)
        }
    }

    private fun submit() {
        val h = head ?: return
        val text = input.text?.toString()?.trim().orEmpty()
        if (text.isEmpty()) return
        input.setText("")
        h.draft = ""
        host.send(h, text)
    }

    fun bind(h: Head, caretAt: Float, animate: Boolean) {
        val switching = head != null && head !== h
        head = h
        if (switching && animate) {
            body.animate().cancel()
            val content = listOf(scroll, title, sub)
            content.forEach { it.animate().alpha(0f).setDuration(80).start() }
            root.postDelayed({
                fill(h)
                content.forEach { it.animate().alpha(1f).setDuration(140).start() }
            }, 85)
        } else {
            fill(h)
        }
        moveCaret(caretAt, animate && switching)
    }

    private fun fill(h: Head) {
        title.text = h.title
        sub.text = if (h.group) "Group chat" else ""
        sub.visibility = if (h.group) View.VISIBLE else View.GONE
        input.hint = if (h.group) "Message ${h.title}" else "Message @${h.title}"
        val canReply = h.reply != null || h.test
        composer.visibility = if (canReply) View.VISIBLE else View.GONE
        elsewhere.visibility = if (canReply) View.GONE else View.VISIBLE
        if (input.text.toString() != h.draft) {
            input.setText(h.draft)
            input.setSelection(input.text.length)
        }
        send.setOn(h.draft.isNotBlank(), false)
        shown = 0
        render(false)
    }

    fun moveCaret(x: Float, animate: Boolean) {
        val target = x - caretW / 2f
        caretAnim?.cancel()
        if (!animate) { caretX = target; caret.translationX = target; return }
        caretAnim = ValueAnimator.ofFloat(caretX, target).apply {
            duration = 300
            interpolator = OvershootInterpolator(1.1f)
            addUpdateListener { caretX = it.animatedValue as Float; caret.translationX = caretX }
            start()
        }
    }

    fun refresh() = render(true)

    private fun render(animateNew: Boolean) {
        val h = head ?: return
        val d = { v: Float -> context.dp(v).toInt() }
        val rows = h.timeline()
        val stick = !scroll.canScrollVertically(1)
        list.removeAllViews()
        var i = 0
        var count = 0
        while (i < rows.size) {
            val first = rows[i]
            var j = i + 1
            while (j < rows.size && rows[j].line.senderKey == first.line.senderKey && rows[j].line.time - rows[j - 1].line.time < 7 * 60_000) j++
            val group = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
            val face = AvatarView(context, d(36f)).apply {
                font(fonts.semibold)
                name = first.line.sender
                bitmap = if (first.line.mine) me.avatar else first.line.avatar ?: h.avatarFor(first.line.senderKey)
            }
            group.addView(face, LinearLayout.LayoutParams(d(36f), d(36f)).apply { marginEnd = d(12f); topMargin = d(2f) })
            val col = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
            val name = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.BOTTOM }
            name.addView(TextView(context).apply {
                text = if (first.line.mine) me.name.ifEmpty { first.line.sender } else first.line.sender
                typeface = fonts.semibold
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
                setTextColor(pal.strong)
                maxLines = 1
                ellipsize = TextUtils.TruncateAt.END
                includeFontPadding = false
            }, LinearLayout.LayoutParams(-2, -2).apply { weight = 0f })
            name.addView(TextView(context).apply {
                text = stamp(first.line.time)
                typeface = fonts.medium
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
                setTextColor(pal.muted)
                maxLines = 1
                includeFontPadding = false
                setPadding(d(6f), 0, 0, d(1f))
            })
            col.addView(name)
            for (k in i until j) {
                val row = rows[k]
                val t = TextView(context).apply {
                    text = row.line.text
                    typeface = fonts.normal
                    setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
                    setTextColor(pal.text)
                    setLineSpacing(context.dp(2f), 1f)
                    setPadding(0, if (k == i) d(4f) else d(3f), 0, 0)
                    alpha = if (row.pending?.state == Pending.SENDING) 0.5f else 1f
                    setTextIsSelectable(false)
                }
                col.addView(t)
                val p = row.pending
                if (p != null && p.state == Pending.FAILED) {
                    col.addView(TextView(context).apply {
                        text = "Couldn't send. Tap to retry."
                        typeface = fonts.medium
                        setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
                        setTextColor(pal.danger)
                        setPadding(0, d(2f), 0, 0)
                        setOnClickListener { host.retry(h, p) }
                    })
                    t.setOnClickListener { host.retry(h, p) }
                }
                count++
            }
            list.addView(group, LinearLayout.LayoutParams(-1, -2).apply { topMargin = if (list.childCount == 0) d(8f) else d(14f) })
            group.addView(col, LinearLayout.LayoutParams(0, -2, 1f))
            i = j
        }
        if (animateNew && count > shown && list.childCount > 0) {
            val last = list.getChildAt(list.childCount - 1)
            last.alpha = 0f
            last.translationY = context.dp(8f)
            last.animate().alpha(1f).translationY(0f).setDuration(220).setInterpolator(DecelerateInterpolator(1.6f)).start()
        }
        val grew = count != shown
        shown = count
        if (stick || grew) scroll.post { scroll.fullScroll(View.FOCUS_DOWN) }
    }

    private fun stamp(t: Long): String {
        if (t <= 0) return ""
        val now = System.currentTimeMillis()
        if (DateUtils.isToday(t)) return android.text.format.DateFormat.getTimeFormat(context).format(java.util.Date(t))
        return DateUtils.formatSameDayTime(t, now, DateFormat.SHORT, DateFormat.SHORT).toString()
    }

    private fun fit() {
        val chrome = context.dp(56f).toInt() + (if (composer.visibility == View.VISIBLE) max(composer.height, context.dp(60f).toInt()) else context.dp(60f).toInt()) + caretH
        scroll.maxPx = (maxHeight - chrome).coerceAtLeast(context.dp(64f).toInt())
        scroll.requestLayout()
        scroll.post { scroll.fullScroll(View.FOCUS_DOWN) }
    }

    fun focusInput() {
        input.requestFocus()
        input.setSelection(input.text.length)
    }

    val editor: EditText get() = input

    fun prepare() {
        body.alpha = 0f
        body.translationY = -context.dp(12f)
        body.scaleX = 0.96f
        body.scaleY = 0.96f
        caret.alpha = 0f
    }

    fun enter(delay: Long = 0) {
        prepare()
        body.pivotX = caretX + caretW / 2f
        body.pivotY = 0f
        body.animate().alpha(1f).translationY(0f).scaleX(1f).scaleY(1f).setStartDelay(delay).setDuration(260).setInterpolator(DecelerateInterpolator(1.8f)).start()
        caret.animate().alpha(1f).setStartDelay(delay + 70).setDuration(170).start()
    }

    fun leave(done: () -> Unit) {
        caret.animate().alpha(0f).setStartDelay(0).setDuration(90).start()
        body.animate().alpha(0f).translationY(-context.dp(8f)).scaleX(0.98f).scaleY(0.98f).setDuration(150)
            .setInterpolator(DecelerateInterpolator()).withEndAction(done).start()
    }
}

class Row(val line: Line, val pending: Pending?)
