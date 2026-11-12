import { getAssetIdByName } from '@valenced/assets'
import { Stores } from '@valenced/discord/flux'
import { ReactNativeSafeAreaContext } from '@valenced/externals/react-native-safe-area-context'
import { callNativeMethod } from '@valenced/modules/native'
import {
	Component,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from 'react'
import {
	AppState,
	DeviceEventEmitter,
	Image,
	Pressable,
	ScrollView,
	Text,
	TextInput,
	View,
} from 'react-native'
import { D, warn, worklet } from './discord'
import type { ReactNode } from 'react'

const call = callNativeMethod as (name: string, args: unknown[]) => Promise<any>

type Line = {
	sender: string
	senderKey: string
	text: string
	time: number
	mine: boolean
}
type Head = {
	key: string
	title: string
	group: boolean
	test: boolean
	canReply: boolean
	lines: Line[]
	avatar?: string
}
type Layout = {
	top: number
	caret: number
	width: number
	height: number
	safeTop: number
	ime: number
	nav: number
}
type Pending = {
	id: string
	text: string
	time: number
	state: 'sending' | 'sent' | 'failed'
}

const K = {
	open: 'G/Ez6p',
	failed: 'lBLP4u',
	send: 'TXNS7S',
	messageDm: '0ZQw/X',
	messageChannel: '4c+CAx',
}

function str(key: string, args?: Record<string, unknown>): string {
	const i = D.intl
	try {
		return args
			? i.intl.formatToPlainString(i.t[key], args)
			: i.intl.string(i.t[key])
	} catch {
		return ''
	}
}

class Guard extends Component<
	{ children: ReactNode; onError: () => void },
	{ failed: boolean }
> {
	state = { failed: false }
	static getDerivedStateFromError() {
		return { failed: true }
	}
	componentDidCatch(e: unknown) {
		warn('card crashed', e)
		this.props.onError()
	}
	render() {
		return this.state.failed ? null : this.props.children
	}
}

let themeVersion = 0
const subscribeTheme = (cb: () => void) => {
	const s = Stores.ThemeStore as any
	const a = Stores.AccessibilityStore as any
	const f = () => {
		themeVersion++
		cb()
	}
	s?.addChangeListener?.(f)
	a?.addChangeListener?.(f)
	return () => {
		s?.removeChangeListener?.(f)
		a?.removeChangeListener?.(f)
	}
}
const themeSnapshot = () => themeVersion

function useThemeProps(saved?: string) {
	const tick = useSyncExternalStore(subscribeTheme, themeSnapshot)
	return useMemo(() => {
		const s = Stores.ThemeStore as any
		const a = Stores.AccessibilityStore as any
		let enabledExperiments: string[] = []
		try {
			const c = D.refresh?.MobileVisualRefreshExperiment?.getConfig({
				location: 'chat_heads',
			})
			if (c?.enabled) {
				enabledExperiments.push('mobile-visual-refresh')
				if (c.chatInputFloating)
					enabledExperiments.push('mobile-visual-refresh-floating')
				if (c.chatInputLegacySendButton)
					enabledExperiments.push('mobile-visual-refresh-legacy-send-button')
			}
		} catch {
			enabledExperiments = []
		}
		return {
			theme: s?._isInitialized === false && saved ? saved : s?.theme,
			saturation: a?.saturation ?? 1,
			contrast: a?.contrast ?? 1,
			enabledExperiments,
			tick,
		}
	}, [tick, saved])
}

function size(token: any, exp: string[], fallback: number): number {
	try {
		const v = token?.resolve?.({ enabledExperiments: exp, density: 'compact' })
		return typeof v === 'number' ? v : fallback
	} catch {
		return fallback
	}
}

function useColors(theme: string) {
	return useMemo(() => {
		const t = D.tokens
		const c = (k: string, fb: string) => {
			try {
				return t.internal.resolveSemanticColor(theme, t.colors[k]) ?? fb
			} catch {
				return fb
			}
		}
		return {
			surface: c('BACKGROUND_SURFACE_HIGH', '#1a1a1e'),
			border: c('BORDER_SUBTLE', '#97979f33'),
			strong: c('TEXT_STRONG', '#ffffff'),
			text: c('TEXT_DEFAULT', '#dcdcdf'),
			muted: c('TEXT_MUTED', '#81828a'),
			danger: c('TEXT_FEEDBACK_CRITICAL', '#eb5f5e'),
			inputBg: c('MOBILE_CHATINPUT_BACKGROUND_DEFAULT', '#19191c'),
			inputBorder: c('MOBILE_CHATINPUT_BORDER_DEFAULT', '#97979f29'),
			placeholder: c('TEXT_MUTED', '#81828a'),
			sendBg: c('CHAT_INPUT_SEND_BUTTON_ACTIVE_BACKGROUND', '#5865f2'),
			sendIcon: c('CHAT_INPUT_SEND_BUTTON_ICON_ACTIVE_TINT', '#ffffff'),
			icon: c('ICON_MUTED', '#81828a'),
			iconActive: c('ICON_DEFAULT', '#d4d5d8'),
			picker: c('MOBILE_EXPRESSION_PICKER_BACKGROUND_DEFAULT', '#0a0a0c'),
		}
	}, [theme])
}

let storeVersion = 0
const subscribeMessages = (cb: () => void) => {
	const stores = [Stores.MessageStore, Stores.ChannelStore, Stores.UserStore] as any[]
	const f = () => {
		storeVersion++
		cb()
	}
	for (const s of stores) s?.addChangeListener?.(f)
	return () => {
		for (const s of stores) s?.removeChangeListener?.(f)
	}
}

let sessionStarted = false
function ensureSession() {
	if (sessionStarted || (Stores.UserStore as any)?.getCurrentUser?.()) return
	sessionStarted = true
	try {
		Promise.resolve(D.startup?.initHeadlessTask?.()).catch(e => warn('initHeadlessTask failed', e))
	} catch (e) {
		warn('initHeadlessTask failed', e)
	}
}
const messagesVersion = () => storeVersion

function useMessages(head: Head | undefined, pending: Pending[]) {
	const tick = useSyncExternalStore(subscribeMessages, messagesVersion)
	return useMemo(() => {
		if (!head) return []
		const me = (Stores.UserStore as any)?.getCurrentUser?.()
		const list = (Stores.MessageStore as any)?.getMessages?.(head.key)
		const arr: any[] = list?.toArray?.() ?? list?._array ?? []
		if (arr.length) {
			return arr.slice(-40).map(m => ({
				id: String(m.id),
				senderKey: String(m.author?.id),
				sender: m.author?.globalName || m.author?.username || '',
				avatar: avatarOf(m.author),
				text: String(m.content ?? ''),
				time: +new Date(m.timestamp),
				mine: m.author?.id === me?.id,
				state:
					m.state === 'SEND_FAILED'
						? 'failed'
						: m.state === 'SENDING'
							? 'sending'
							: 'sent',
				message: m,
			}))
		}
		const rows = head.lines.map((l, i) => {
			const u = l.mine ? me : (Stores.UserStore as any)?.getUser?.(l.senderKey)
			return {
				id: `n${i}`,
				senderKey: l.senderKey,
				sender: u?.globalName || u?.username || l.sender,
				avatar: avatarOf(u) ?? (!l.mine && !head.group ? head.avatar : undefined),
				text: l.text,
				time: l.time,
				mine: l.mine,
				state: 'sent',
				message: null,
			}
		})
		for (const p of pending)
			rows.push({
				id: p.id,
				senderKey: 'me',
				sender: me?.globalName || me?.username || '',
				avatar: avatarOf(me),
				text: p.text,
				time: p.time,
				mine: true,
				state: p.state,
				message: null,
			})
		return rows.sort((a, b) => a.time - b.time)
	}, [head, pending, tick])
}

function avatarOf(user: any): string | undefined {
	try {
		return user?.getAvatarURL?.(undefined, 80) ?? undefined
	} catch {
		return undefined
	}
}

function src(v: unknown): any {
	return typeof v === 'number' ? v : v ? { uri: String(v) } : undefined
}

function defaultAvatar(key: string): number | string | undefined {
	try {
		let h = 0
		for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) | 0
		return D.avatars?.getDefaultAvatarURL?.(String(Math.abs(h)))
	} catch {
		return undefined
	}
}

function useKeyboardStore(): { type: string; height?: number } {
	const read = () => {
		try {
			const main = D.keyboardStore?.getState?.()?.byAppEntry?.main
			return {
				type: main?.keyboardContexts?.expression?.type ?? 'emoji',
				height: main?.customKeyboardHeightExcludingSafeAreaInsets,
			}
		} catch {
			return { type: 'emoji' }
		}
	}
	const [v, setV] = useState(read)
	useEffect(() => {
		const off = D.keyboardStore?.subscribe?.(() => setV(read()))
		return () => off?.()
	}, [])
	return v
}

const previewIcons: Record<string, string> = {
	attachment: 'AttachmentIcon',
	sticker: 'StickerIcon',
	video: 'VideoIcon',
	image: 'ImageIcon',
	gif: 'GifIcon',
	poll: 'PollsIcon',
	voice: 'MicrophoneIcon',
	link: 'LinkIcon',
}

function Body({
	r,
	colors,
	size,
	scale,
}: {
	r: any
	colors: any
	size: number
	scale: number
}) {
	const color = r.state === 'sent' ? colors.text : colors.muted
	const style = {
		fontFamily: 'ggsans-Medium',
		fontSize: size,
		lineHeight: Math.round(size * 1.334 * 1.05),
		color,
	}
	let preview: any
	try {
		if (r.message)
			preview = D.preview?.formatMessagePreview?.(r.message, {
				isBlocked: false,
				isIgnored: false,
			})
	} catch {}
	if (preview?.type === 'text') {
		const icon =
			previewIcons[preview.trailingIcon] &&
			getAssetIdByName(previewIcons[preview.trailingIcon])
		return (
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
				<Text style={{ ...style, color: colors.muted }}>{preview.text}</Text>
				{icon ? (
					<Image
						source={icon}
						style={{
							width: 16 * scale,
							height: 16 * scale,
							tintColor: colors.muted,
						}}
					/>
				) : null}
			</View>
		)
	}
	let nodes: any = r.text
	try {
		const m = r.message
		const out = D.markup?.renderMessagePreviewMarkup?.({
			content: r.text,
			channelId: m?.channel_id,
			guildId: undefined,
			color,
			fontScale: scale,
		})
		if (out != null) nodes = out
	} catch {}
	return <Text style={style}>{nodes}</Text>
}

function Rows({
	rows,
	colors,
	scale,
	onRetry,
}: {
	rows: any[]
	colors: any
	scale: number
	onRetry: (r: any) => void
}) {
	const dates = D.dates
	const groups: any[][] = []
	for (const r of rows) {
		const g = groups[groups.length - 1]
		const prev = g?.[g.length - 1]
		if (
			prev &&
			prev.senderKey === r.senderKey &&
			r.time - prev.time < 7 * 60_000
		)
			g.push(r)
		else groups.push([r])
	}
	const body = 16 * scale
	return (
		<>
			{groups.map(g => {
				const first = g[0]
				let stamp = ''
				let stampLabel = ''
				try {
					stamp = dates?.calendarFormat?.(new Date(first.time)) ?? ''
					stampLabel =
						dates?.accessibilityLabelCalendarFormat?.(new Date(first.time)) ??
						stamp
				} catch {}
				return (
					<View
						key={first.id}
						style={{
							flexDirection: 'row',
							paddingHorizontal: 12,
							paddingTop: 2,
							marginBottom: 16,
						}}
					>
						<Image
							source={src(first.avatar ?? defaultAvatar(first.senderKey))}
							style={{ width: 40, height: 40, borderRadius: 20, marginTop: 2 }}
							accessibilityIgnoresInvertColors
						/>
						<View style={{ flex: 1, marginLeft: 12 }}>
							<View
								style={{ flexDirection: 'row', alignItems: 'baseline' }}
								accessible
								accessibilityLabel={`${first.sender}, ${stampLabel}`}
							>
								<Text
									numberOfLines={1}
									style={{
										fontFamily: 'ggsans-Semibold',
										fontSize: 16 * scale,
										color: colors.strong,
										flexShrink: 1,
									}}
								>
									{first.sender}
								</Text>
								<Text
									style={{
										fontFamily: 'ggsans-Medium',
										fontSize: 12 * scale,
										color: colors.muted,
										marginLeft: 8,
									}}
								>
									{stamp}
								</Text>
							</View>
							{g.map((r, i) => (
								<Pressable
									key={r.id}
									disabled={r.state !== 'failed'}
									onLongPress={() => onRetry(r)}
									style={{ paddingTop: i === 0 ? 0 : 4 }}
									accessibilityRole="text"
								>
									<Body r={r} colors={colors} size={body} scale={scale} />

									{r.state === 'failed' && (
										<Text
											style={{
												fontFamily: 'ggsans-Medium',
												fontSize: 12 * scale,
												color: colors.danger,
												marginTop: 2,
											}}
										>
											{str(K.failed)}
										</Text>
									)}
								</Pressable>
							))}
						</View>
					</View>
				)
			})}
		</>
	)
}

function Picker({
	channel,
	height,
	nav,
	colors,
	exp,
	type,
	onEmoji,
	onGif,
	onSticker,
	onBackspace,
	stickers,
	onExpand,
}: any) {
	const EP = D.ExpressionPicker
	const sheet = D.sheet
	const R = D.reanimated
	const index = R.useSharedValue(0)
	const raw = useRef<any>(null)
	const expand = useRef(onExpand)
	expand.current = onExpand
	const ref = useMemo(
		() => ({
			get current() {
				return new Proxy(raw.current ?? {}, {
					get(t: any, k) {
						if (k === 'expandActionSheet' || k === 'expand')
							return () => expand.current?.()
						if (k in t) return typeof t[k] === 'function' ? t[k].bind(t) : t[k]
						warn(`picker called sheet.${String(k)}`)
						return () => {}
					},
				})
			},
		}),
		[],
	)
	const radius = size(
		D.tokens?.modules?.mobile?.MOBILE_MEDIA_KEYBOARD_TOP_BORDER_RADIUS,
		exp,
		0,
	)
	if (!EP || !sheet || !channel) return null
	const Sheet = sheet.default
	return (
		<View
			style={{
				height: height + nav,
				backgroundColor: colors.picker,
				borderTopLeftRadius: radius,
				borderTopRightRadius: radius,
				overflow: 'hidden',
			}}
		>
			<Sheet
				ref={raw}
				animatedIndex={index}
				index={0}
				snapPoints={['100%']}
				enableDynamicSizing={false}
				enablePanDownToClose={false}
				enableContentPanningGesture={false}
				handleComponent={null}
				backgroundStyle={{ backgroundColor: 'transparent' }}
				bottomInset={nav}
			>
				<EP
					channel={channel}
					expressionType={type}
					bottomSheetRef={ref}
					bottomSheetIndex={index}
					height={height}
					inPortalKeyboard={false}
					visibleTabs={stickers ? undefined : ['emoji', 'gif']}
					onPressEmoji={onEmoji}
					onPressGIF={onGif}
					onPressSticker={onSticker}
					onBackspace={onBackspace}
				/>
			</Sheet>
		</View>
	)
}

function loadChannel(id: string) {
	const ms = Stores.MessageStore as any
	if (ms?.isReady?.(id) || ms?.isLoadingMessages?.(id)) return
	try {
		D.messages?.fetchMessages?.({ channelId: id, limit: 30 })
	} catch (e) {
		warn('fetchMessages failed', e)
	}
}

const raf = { orig: null as any, cancel: null as any, ids: new Set<any>() }
function frameShim(on: boolean) {
	const g = globalThis as any
	if (on === !!raf.orig) return
	if (on) {
		raf.orig = g.requestAnimationFrame
		raf.cancel ??= g.cancelAnimationFrame
		g.requestAnimationFrame = (cb: (t: number) => void) => {
			const id = setTimeout(() => {
				raf.ids.delete(id)
				if (!raf.orig && !raf.ids.size && raf.cancel) {
					g.cancelAnimationFrame = raf.cancel
					raf.cancel = null
				}
				cb(g.performance?.now?.() ?? Date.now())
			}, 16)
			raf.ids.add(id)
			return id
		}
		g.cancelAnimationFrame = (id: any) => {
			if (!raf.ids.delete(id)) return raf.cancel?.(id)
			clearTimeout(id)
		}
		return
	}
	g.requestAnimationFrame = raf.orig
	raf.orig = null
	if (!raf.ids.size) {
		g.cancelAnimationFrame = raf.cancel
		raf.cancel = null
	}
}

function Card() {
	const [st, setSt] = useState<{
		heads: Head[]
		selected?: string
		theme?: string
		layout: Layout
		leaving: boolean
	} | null>(null)
	const [drafts, setDrafts] = useState<Record<string, string>>({})
	const [pending, setPending] = useState<Record<string, Pending[]>>({})
	const [picker, setPicker] = useState(false)
	const [lastIme, setLastIme] = useState(0)
	const kb = useKeyboardStore()
	const [expanded, setExpanded] = useState(false)
	const scroll = useRef<ScrollView>(null)
	const input = useRef<TextInput>(null)
	const themeProps = useThemeProps(st?.theme)
	const colors = useColors(themeProps.theme)
	const R = D.reanimated
	const mana = D.mana

	useEffect(() => {
		const pull = () =>
			call('mlemheads.state', [])
				.then(s => {
					const j = JSON.parse(s)
					setSt({
						heads: j.heads,
						selected: j.selected,
						theme: j.theme || undefined,
						layout: j.layout,
						leaving: false,
					})
				})
				.catch(e => warn('state failed', e))
		pull()
		const sub = DeviceEventEmitter.addListener('mlemheads', (raw: string) => {
			let e: any
			try {
				e = JSON.parse(raw)
			} catch {
				return
			}
			setSt(s => {
				if (!s) return s
				switch (e.t) {
					case 'update':
						return {
							...s,
							heads: s.heads.some(h => h.key === e.head.key)
								? s.heads.map(h => (h.key === e.head.key ? e.head : h))
								: [...s.heads, e.head],
						}
					case 'heads':
						return { ...s, heads: e.heads }
					case 'layout':
						return {
							...s,
							layout: {
								...s.layout,
								...e.layout,
								ime: s.layout.ime,
								nav: s.layout.nav,
							},
						}
					case 'select':
						return {
							...s,
							selected: e.key,
							layout: { ...s.layout, caret: e.layout.caret },
						}
					case 'insets':
						return { ...s, layout: { ...s.layout, ime: e.ime, nav: e.nav } }
					case 'leave':
						return { ...s, leaving: true }
					default:
						return s
				}
			})
			if (e.t === 'open') {
				setPicker(false)
				pull()
			}
			if (e.t === 'back')
				setPicker(p => (p ? false : (call('mlemheads.collapse', []), false)))
			if (e.t === 'insets' && e.ime > 0) {
				setLastIme(e.ime)
				setPicker(false)
			}
		})
		return () => sub.remove()
	}, [])

	const head =
		st?.heads.find(h => h.key === st.selected) ?? st?.heads[st.heads.length - 1]
	useEffect(() => {
		if (st) ensureSession()
	}, [!!st])
	const channel = head
		? (Stores.ChannelStore as any)?.getChannel?.(head.key)
		: null
	const pickerChannel = useMemo(() => {
		if (channel) return channel
		const cs = Stores.ChannelStore as any
		const id = cs?.getSortedPrivateChannels?.()?.[0]?.id
		return id ? cs.getChannel(id) : null
	}, [channel])
	const rows = useMessages(head, head ? (pending[head.key] ?? []) : [])
	useEffect(() => {
		if (channel && !head?.test) loadChannel(channel.id)
	}, [channel?.id])
	const draft = head ? (drafts[head.key] ?? '') : ''
	const setDraft = (t: string) =>
		head && setDrafts(d => ({ ...d, [head.key]: t }))
	let scale = 1
	try {
		scale = D.fontScale?.getFontScale?.() ?? 1
	} catch {}

	const shown = R.useSharedValue(0)
	const visible = !!st && !st.leaving
	const [active, setActive] = useState(AppState.currentState === 'active')
	useEffect(() => {
		const sub = AppState.addEventListener('change', a => setActive(a === 'active'))
		return () => sub.remove()
	}, [])
	useEffect(() => {
		frameShim(picker && visible && !active)
		return () => frameShim(false)
	}, [picker, visible, active])
	useEffect(() => {
		shown.value = R.withSpring(visible ? 1 : 0, {
			mass: 0.3,
			damping: 20,
			stiffness: 200,
			overshootClamping: true,
			restDisplacementThreshold: 0.001,
		})
	}, [visible])
	const cardStyle = R.useAnimatedStyle(
		worklet(
			'function chCard(){const{s}=this.__closure;return{opacity:s.value,transform:[{scale:0.5+0.5*s.value}]};}',
			{ s: shown },
			() => ({
				opacity: shown.value,
				transform: [{ scale: 0.5 + 0.5 * shown.value }],
			}),
		),
	)

	const pickerH = R.useSharedValue(0)
	const L = st?.layout
	const imeH = lastIme - (L?.nav ?? 0)
	const baseH = imeH >= 180 ? imeH : (kb.height ?? 300)
	const keyboardH = expanded && L ? L.height - L.top - (L.nav ?? 0) : baseH
	useEffect(() => {
		if (!picker) setExpanded(false)
		pickerH.value = R.withSpring(picker ? keyboardH + (L?.nav ?? 0) : 0, {
			damping: 500,
			stiffness: 1000,
			mass: 3,
			overshootClamping: true,
		})
	}, [picker, keyboardH])
	useEffect(() => {
		const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 350)
		return () => clearTimeout(t)
	}, [picker, keyboardH, lastIme])
	const pickerStyle = R.useAnimatedStyle(
		worklet(
			'function chPicker(){const{h}=this.__closure;return{height:h.value};}',
			{ h: pickerH },
			() => ({ height: pickerH.value }),
		),
	)

	const exp = themeProps.enabledExperiments
	const mobile = D.tokens?.modules?.mobile
	const inputRadius = size(mobile?.CHAT_INPUT_BORDER_RADIUS, exp, 24)
	const sendSize = size(mobile?.CHAT_INPUT_SEND_BUTTON_WIDTH, exp, 40)
	const iconSize = size(D.tokens?.modules?.chat?.INPUT_ICON_SIZE, exp, 20)
	const cardRadius = size(mobile?.CARD_DEFAULT_RADIUS, exp, 16)
	const sheetRadius = size(
		mobile?.MOBILE_MEDIA_KEYBOARD_TOP_BORDER_RADIUS,
		exp,
		0,
	)

	const hasText = draft.trim().length > 0
	const sendO = R.useSharedValue(0)
	const sendS = R.useSharedValue(0.5)
	useEffect(() => {
		sendO.value = R.withTiming(hasText ? 1 : 0, {
			duration: hasText ? 200 : 50,
		})
		sendS.value = hasText
			? R.withSpring(1, { mass: 0.5, damping: 13, stiffness: 400 })
			: R.withTiming(0.5, { duration: 50 })
	}, [hasText])
	const sendStyle = R.useAnimatedStyle(
		worklet(
			'function chSend(){const{o,s}=this.__closure;return{opacity:o.value,transform:[{scale:s.value}]};}',
			{ o: sendO, s: sendS },
			() => ({
				opacity: sendO.value,
				transform: [{ scale: sendS.value }],
			}),
		),
	)

	const close = () => call('mlemheads.collapse', [])

	const addPending = (key: string, text: string) => {
		const p: Pending = {
			id: `p${Date.now()}`,
			text,
			time: Date.now(),
			state: 'sending',
		}
		setPending(s => ({ ...s, [key]: [...(s[key] ?? []), p] }))
		return (state: Pending['state']) =>
			setPending(s => ({
				...s,
				[key]: (s[key] ?? []).map(x => (x.id === p.id ? { ...x, state } : x)),
			}))
	}

	const sendText = useCallback(
		(text: string) => {
			if (!head || !text.trim()) return
			const actions = D.messages
			const parser = D.parser
			if (channel && actions?.sendMessage && parser?.parse && !head.test) {
				loadChannel(channel.id)
				try {
					actions.sendMessage(channel.id, parser.parse(channel, text), true, {})
					call('mlemheads.replied', [head.key])
					return
				} catch (e) {
					warn('sendMessage failed', e)
				}
			}
			const done = addPending(head.key, text)
			call('mlemheads.reply', [head.key, text]).then(
				ok => done(ok ? 'sent' : 'failed'),
				() => done('failed'),
			)
		},
		[head, channel],
	)

	const submit = () => {
		const t = draft.trim()
		if (!t) return
		setDraft('')
		sendText(t)
	}

	const retry = (r: any) => {
		if (r.message && D.messages?.retrySendMessage)
			return D.messages.retrySendMessage(channel, r.message)
		if (r.state === 'failed') sendText(r.text)
	}

	const onEmoji = (e: any) => {
		const text = e?.id
			? `:${e.uniqueName ?? e.name}:`
			: (e?.surrogates ?? e?.emojiObject?.surrogates ?? '')
		if (text) setDraft(draft + text)
	}
	const onGif = (g: any) => {
		if (!g?.url) return
		sendText(g.url)
		setPicker(false)
	}
	const onSticker = (s: any) => {
		if (!head || !channel || !s?.id) return
		try {
			D.messages.sendStickers(channel.id, [s.id], draft, {})
			setDraft('')
			setPicker(false)
			call('mlemheads.replied', [head.key])
		} catch (e) {
			warn('sendStickers failed', e)
		}
	}
	const onBackspace = () => setDraft(Array.from(draft).slice(0, -1).join(''))

	const togglePicker = () => {
		if (picker) {
			setPicker(false)
			input.current?.focus()
			return
		}
		input.current?.blur()
		call('mlemheads.keyboard', [false])
		setPicker(true)
	}

	const full = !!(st && L && head && mana)
	useEffect(() => {
		if (full) call('mlemheads.painted', []).catch(() => {})
	}, [full, st?.selected, visible])
	if (!st || !L || !head || !mana) return null
	const { ThemeContextProvider, ToastContainer, IconButton } = mana
	const AView = R.default.View
	const SafeArea = ReactNativeSafeAreaContext.SafeAreaProvider
	const GestureRoot = D.gesture?.GestureHandlerRootView ?? View
	const Portal = D.portal?.PortalProvider ?? (({ children }: any) => children)
	const width = Math.min(L.width - 24, 440)
	const left = Math.max(12, Math.min(L.width - 12 - width, L.caret - width / 2))
	const bottomRoom = Math.max(L.ime, picker ? keyboardH + L.nav : 0, L.nav)
	const maxH = Math.max(160, L.height - L.top - bottomRoom - 12)
	const other =
		channel?.recipients?.length === 1
			? (Stores.UserStore as any)?.getUser?.(channel.recipients[0])
			: null
	const title =
		(other && (other.globalName || other.username)) ||
		channel?.name ||
		head.title
	const placeholder = head.group
		? str(K.messageChannel, { channel: title }) || `Message #${title}`
		: str(K.messageDm, { name: title }) || `Message @${title}`
	const canSend = head.canReply || !!(channel && D.messages?.sendMessage)
	const stickers = !!(channel && D.messages?.sendStickers)

	return (
		<GestureRoot style={{ flex: 1 }}>
			<SafeArea>
				<Portal>
					<ThemeContextProvider
						theme={themeProps.theme}
						saturation={themeProps.saturation}
						contrast={themeProps.contrast}
						enabledExperiments={exp}
					>
						<Pressable
							style={{
								position: 'absolute',
								top: 0,
								left: 0,
								right: 0,
								bottom: 0,
							}}
							onPress={close}
							accessible={false}
						/>
						<AView
							style={[
								{
									position: 'absolute',
									top: L.top,
									left,
									width,
									maxHeight: maxH,
									backgroundColor: colors.surface,
									borderRadius: cardRadius,
									borderWidth: 1,
									borderColor: colors.border,
									overflow: 'hidden',
									transformOrigin: `${L.caret - left}px 0px`,
								},
								cardStyle,
							]}
						>
							<Guard onError={close}>
								<View
									style={{
										flexDirection: 'row',
										alignItems: 'center',
										paddingLeft: 16,
										paddingRight: 8,
										paddingTop: 10,
										paddingBottom: 4,
									}}
								>
									<Text
										numberOfLines={1}
										accessibilityRole="header"
										style={{
											flex: 1,
											fontFamily: 'ggsans-Semibold',
											fontSize: 16,
											lineHeight: 22,
											color: colors.strong,
										}}
									>
										{title}
									</Text>
									<IconButton
										icon={getAssetIdByName('ArrowAngleRightUpIcon')}
										variant="tertiary"
										size="sm"
										accessibilityLabel={str(K.open)}
										onPress={() => call('mlemheads.open', [head.key])}
									/>
								</View>
								<ScrollView
									ref={scroll}
									style={{ flexShrink: 1 }}
									contentContainerStyle={{ paddingTop: 8 }}
									onContentSizeChange={() =>
										scroll.current?.scrollToEnd({ animated: false })
									}
									onLayout={() =>
										scroll.current?.scrollToEnd({ animated: false })
									}
								>
									<Rows
										rows={rows}
										colors={colors}
										scale={scale}
										onRetry={retry}
									/>
								</ScrollView>
								{canSend ? (
									<View
										style={{
											flexDirection: 'row',
											alignItems: 'flex-end',
											paddingHorizontal: 12,
											paddingBottom: 12,
											paddingTop: 4,
											gap: 8,
										}}
									>
										<View
											style={{
												flex: 1,
												flexDirection: 'row',
												alignItems: 'center',
												backgroundColor: colors.inputBg,
												borderColor: colors.inputBorder,
												borderWidth: 1,
												borderRadius: inputRadius,
												minHeight: 40,
												paddingLeft: 12,
											}}
										>
											<TextInput
												ref={input}
												value={draft}
												onChangeText={setDraft}
												onFocus={() => setPicker(false)}
												placeholder={placeholder}
												placeholderTextColor={colors.placeholder}
												multiline
												maxLength={2000}
												style={{
													flex: 1,
													fontFamily: 'ggsans-Medium',
													fontSize: 16,
													color: colors.text,
													paddingVertical: 8,
													maxHeight: 120,
												}}
											/>
											<Pressable
												onPress={togglePicker}
												hitSlop={8}
												style={{ padding: 8 }}
												accessibilityRole="button"
												accessibilityLabel={D.intl ? str('Xu3wE3') : 'Emoji'}
											>
												<Image
													source={
														getAssetIdByName(
															picker ? 'KeyboardIcon' : 'ReactionIcon',
														) ?? getAssetIdByName('ReactionIcon')
													}
													style={{
														width: iconSize,
														height: iconSize,
														tintColor: picker ? colors.iconActive : colors.icon,
													}}
												/>
											</Pressable>
										</View>
										<AView
											style={[{ width: sendSize, height: sendSize }, sendStyle]}
											pointerEvents={hasText ? 'auto' : 'none'}
										>
											<Pressable
												onPress={submit}
												accessibilityRole="button"
												accessibilityLabel={str(K.send)}
												style={{
													flex: 1,
													borderRadius: sendSize / 2,
													backgroundColor: colors.sendBg,
													alignItems: 'center',
													justifyContent: 'center',
												}}
											>
												<Image
													source={getAssetIdByName('SendMessageIcon')}
													style={{
														width: iconSize,
														height: iconSize,
														tintColor: colors.sendIcon,
													}}
												/>
											</Pressable>
										</AView>
									</View>
								) : (
									<Pressable
										onPress={() => call('mlemheads.open', [head.key])}
										style={{ padding: 16, alignItems: 'center' }}
										accessibilityRole="button"
									>
										<Text
											style={{
												fontFamily: 'ggsans-Medium',
												fontSize: 16,
												color: colors.strong,
											}}
										>
											{str(K.open)}
										</Text>
									</Pressable>
								)}
							</Guard>
						</AView>
						<AView
							style={[
								{
									position: 'absolute',
									left: 0,
									right: 0,
									bottom: 0,
									overflow: 'hidden',
									backgroundColor: colors.picker,
									borderTopLeftRadius: sheetRadius,
									borderTopRightRadius: sheetRadius,
								},
								pickerStyle,
							]}
						>
							{picker && (
								<Guard onError={() => setPicker(false)}>
									<Picker
										channel={pickerChannel}
										height={keyboardH}
										onExpand={() => setExpanded(true)}
										nav={L.nav}
										colors={colors}
										exp={exp}
										type={kb.type}
										stickers={stickers}
										onEmoji={onEmoji}
										onGif={onGif}
										onSticker={onSticker}
										onBackspace={onBackspace}
									/>
								</Guard>
							)}
						</AView>
						{ToastContainer && <ToastContainer />}
					</ThemeContextProvider>
				</Portal>
			</SafeArea>
		</GestureRoot>
	)
}

export const overlay = { open: false }

export default class Root extends Component<object, { failed: boolean }> {
	state = { failed: false }
	static getDerivedStateFromError() {
		return { failed: true }
	}
	componentDidCatch(e: unknown) {
		warn('card crashed', e)
		call('mlemheads.collapse', []).catch(() => {})
	}
	componentDidMount() {
		overlay.open = true
	}
	componentWillUnmount() {
		overlay.open = false
		frameShim(false)
	}
	render() {
		return this.state.failed ? null : <Card />
	}
}
