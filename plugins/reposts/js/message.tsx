import { Design } from '@valenced/discord/design'
import {
	cloneElement,
	isValidElement,
	useEffect,
	useReducer,
	useRef,
	useState,
} from 'react'
import { Image, Linking, Pressable, View } from 'react-native'
import { snowflakeTime } from '../shared/wire'
import {
	assetIcon,
	avatarSource,
	bio,
	calendar,
	colors,
	defaultAvatar,
	displayName,
	guildTags,
	openProfile,
	stores,
	userActions,
	usernames,
	useToken,
} from './discord'
import { isImage, isVideo, onUrls, openNative, signed, thumb } from './media'
import type { EmbedRef, Entry, FileRef } from '../shared/wire'
import type { ViewItem } from './media'

export const AVATAR = 40
const fetching = new Map<string, 'pending' | 'gone'>()

export function useUser(id?: string) {
	const [, tick] = useReducer(x => x + 1, 0)
	const user = id ? stores.UserStore?.getUser?.(id) : undefined
	useEffect(() => {
		if (!id || user || fetching.has(id)) return
		const fn = userActions()?.getUser
		if (!fn) return
		fetching.set(id, 'pending')
		Promise.resolve(fn(id))
			.then(() => fetching.delete(id))
			.catch(() => fetching.set(id, 'gone'))
			.finally(tick)
	}, [id, user])
	return { user, gone: !!id && fetching.get(id) === 'gone' }
}

export function when(ms: number) {
	try {
		const out = calendar()?.calendarFormat(new Date(ms))
		if (typeof out === 'string') return out
	} catch {}
	const d = new Date(ms)
	const time = d.toLocaleTimeString(undefined, {
		hour: 'numeric',
		minute: '2-digit',
	})
	const day = (x: Date) =>
		new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
	if (day(new Date()) === day(d)) return `Today at ${time}`
	return `${d.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: 'numeric' })} ${time}`
}

export function ago(sec: number) {
	const s = Math.max(0, Date.now() / 1000 - sec)
	if (s < 60) return 'just now'
	if (s < 3600) return `${Math.floor(s / 60)}m`
	if (s < 86400) return `${Math.floor(s / 3600)}h`
	if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`
	return new Date(sec * 1000).toLocaleDateString(undefined, {
		month: 'short',
		day: 'numeric',
	})
}

const MENTION = /<@!?(\d{15,20})>|<#(\d{15,20})>|<@&(\d{15,20})>/g
const INVISIBLE = /[\s ᅟᅠ​-‏⁠-⁤ㅤ﻿ﾠ]|\udb40[\udc00-\udc7f]/g

function sized(node: any, variant: string): any {
	if (Array.isArray(node)) return node.map(n => sized(n, variant))
	if (!isValidElement(node)) return node
	const p = node.props as any
	const name = (node.type as any)?.displayName ?? (node.type as any)?.name
	const extra = name === 'MarkupText' && !p.variant ? { variant } : undefined
	if (!extra && p.children === undefined) return node
	return cloneElement(
		node,
		extra,
		...(p.children === undefined ? [] : [sized(p.children, variant)]),
	)
}

function Mention({ text, variant }: { text: string; variant: string }) {
	const { Text } = Design as any
	const c = colors()
	const bg = useToken(c.MENTION_BACKGROUND ?? c.BACKGROUND_MENTIONED)
	const fg = useToken(c.MENTION_FOREGROUND ?? c.TEXT_BRAND)
	return (
		<Text
			variant={variant.replace(/\/\w+$/, '/semibold')}
			style={{ backgroundColor: bg, color: fg, borderRadius: 4 }}
		>
			{text}
		</Text>
	)
}

export function Markdown({
	text,
	lines,
	variant = 'text-md/normal',
	color = 'text-default',
}: {
	text: string
	lines?: number
	variant?: string
	color?: string
}) {
	const { Text } = Design as any
	const parse = bio()?.parseBioReact
	const parts: any[] = []
	let last = 0
	let k = 0
	for (const m of text.matchAll(MENTION)) {
		if (m.index! > last) parts.push(text.slice(last, m.index))
		const [, user, channel] = m
		const u = user && stores.UserStore?.getUser?.(user)
		const label = user
			? `@${u ? displayName(u) : 'unknown-user'}`
			: channel
				? `#${stores.ChannelStore?.getChannel?.(channel)?.name ?? 'unknown'}`
				: '@role'
		parts.push(<Mention key={`m${k++}`} text={label} variant={variant} />)
		last = m.index! + m[0].length
	}
	if (last < text.length) parts.push(text.slice(last))
	const rendered = parts.map((p, i) => {
		if (typeof p !== 'string') return p
		try {
			return parse ? <Text key={`t${i}`}>{sized(parse(p), variant)}</Text> : p
		} catch {
			return p
		}
	})
	return (
		<Text variant={variant} color={color} lineClamp={lines}>
			{rendered}
		</Text>
	)
}

const MEDIA_KINDS = new Set(['image', 'gifv'])
const isMediaEmbed = (e: EmbedRef) =>
	!!e.m && (MEDIA_KINDS.has(e.k) || (e.k === 'video' && !e.p && !e.ti))

export function shownText(entry: Entry) {
	const t = entry.t ?? ''
	const media = (entry.e ?? []).filter(isMediaEmbed)
	if (!t || !media.length) return t
	let rest = t
	for (const e of media) if (e.u) rest = rest.split(e.u).join('')
	rest = rest.replace(/\[[^\]]*\]\(\s*<?\s*>?\s*\)/g, '').replace(/<\s*>/g, '')
	return rest.replace(INVISIBLE, '').length ? t : ''
}

export const isLong = (entry: Entry) => {
	const t = shownText(entry)
	return t.length > 420 || t.split('\n').length > 8
}

const proxyVideo = (thumbUrl: string) =>
	/^https:\/\/images-ext-\d\.discordapp\.net\/external\//.test(thumbUrl)
		? thumbUrl.split('?')[0]
		: undefined

export function viewItems(entry: Entry): (ViewItem | null)[] {
	const out: (ViewItem | null)[] = []
	for (const f of entry.f ?? []) {
		if (!isImage(f) && !isVideo(f)) continue
		const url = signed(entry, f)
		if (!url) {
			out.push(null)
			continue
		}
		const video = isVideo(f)
		const w = f[3] || 1280
		const h = f[4] || 720
		const scale = Math.min(1, 1600 / Math.max(w, h))
		out.push({
			key: f[0],
			kind: video ? 'video' : 'image',
			thumb: thumb(video ? `${url}&format=webp` : url, w * scale, h * scale),
			full: url,
			video: video ? url : undefined,
			w,
			h,
			type: f[2] || undefined,
			accessory: 'attachment',
		})
	}
	for (const [i, e] of (entry.e ?? []).entries()) {
		if (!isMediaEmbed(e)) continue
		const [src, w, h] = e.m!
		const kind = e.k === 'image' ? 'image' : e.k === 'gifv' ? 'gifv' : 'video'
		out.push({
			key: `e${i}`,
			kind,
			thumb: src,
			full: kind === 'image' ? src.split('?')[0]! : (e.u ?? src),
			video: kind === 'image' ? undefined : (e.v?.[0] ?? proxyVideo(src)),
			link: e.u,
			w: w || e.v?.[1] || 1280,
			h: h || e.v?.[2] || 720,
			type: kind === 'image' ? undefined : 'video/mp4',
			accessory: 'embed',
		})
	}
	return out
}

function Badge({ text }: { text: string }) {
	const { Text } = Design as any
	return (
		<View
			style={{
				position: 'absolute',
				left: 6,
				top: 6,
				paddingHorizontal: 5,
				paddingVertical: 1,
				borderRadius: 4,
				backgroundColor: 'rgba(0,0,0,0.6)',
			}}
		>
			<Text variant="text-xxs/bold" style={{ color: '#fff' }}>
				{text}
			</Text>
		</View>
	)
}

function Tile({
	item,
	w,
	h,
	onPress,
	radius = 8,
}: {
	item: ViewItem | null
	w: number
	h: number
	onPress: (ref: any) => void
	radius?: number
}) {
	const c = colors()
	const bg = useToken(c.BACKGROUND_MOD_SUBTLE)
	const fg = useToken(c.ICON_MUTED ?? c.TEXT_MUTED)
	const [broken, setBroken] = useState(false)
	const [ready, setReady] = useState(false)
	const ref = useRef<View>(null)
	const Play = assetIcon('PlayIcon')
	const Warn = assetIcon('ImageWarningIcon')
	const ok = item && !broken
	return (
		<Pressable
			ref={ref}
			disabled={!ok}
			onPress={() => onPress(ref.current)}
			style={({ pressed }) => ({
				width: w,
				height: h,
				borderRadius: radius,
				overflow: 'hidden',
				backgroundColor: bg,
				alignItems: 'center',
				justifyContent: 'center',
				opacity: pressed ? 0.85 : 1,
			})}
		>
			{ok ? (
				<Image
					source={{ uri: item.thumb }}
					onLoad={() => setReady(true)}
					onError={() => setBroken(true)}
					fadeDuration={ready ? 0 : 180}
					style={{ width: w, height: h }}
					resizeMode="cover"
				/>
			) : item === null || broken ? (
				<Warn size="md" color={fg} />
			) : null}
			{ok && item.kind === 'video' && (
				<View
					style={{
						position: 'absolute',
						width: 48,
						height: 48,
						borderRadius: 24,
						backgroundColor: 'rgba(0,0,0,0.64)',
						alignItems: 'center',
						justifyContent: 'center',
					}}
				>
					<Play size="md" color="#fff" />
				</View>
			)}
			{ok && item.kind === 'gifv' && <Badge text="GIF" />}
		</Pressable>
	)
}

function fit(w: number, h: number, max: number, maxH = 320) {
	const scale = Math.min(1, max / w, maxH / h)
	return [Math.max(80, w * scale), Math.max(80, h * scale)] as const
}

function Gallery({ entry, width }: { entry: Entry; width: number }) {
	const [, tick] = useReducer(x => x + 1, 0)
	useEffect(() => onUrls(tick), [])
	const items = viewItems(entry)
	if (!items.length || width <= 0) return null
	const live = items.filter(Boolean) as ViewItem[]
	const open = (it: ViewItem | null) => (ref: any) => {
		if (!it) return
		openNative(entry, live, live.indexOf(it), ref)
	}
	if (items.length === 1) {
		const it = items[0]!
		const [w, h] = it ? fit(it.w, it.h, width) : [width, width * 0.56]
		return <Tile item={it} w={w} h={h} onPress={open(it)} />
	}
	const size = (width - 4) / 2
	return (
		<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
			{items.slice(0, 4).map((it, i) => (
				<Tile
					key={it?.key ?? `x${i}`}
					item={it}
					w={items.length === 3 && i === 0 ? width : size}
					h={items.length === 2 ? size * 1.15 : size}
					onPress={open(it)}
				/>
			))}
		</View>
	)
}

function FileRow({ entry, file }: { entry: Entry; file: FileRef }) {
	const { Text } = Design as any
	const c = colors()
	const bg = useToken(
		c.MOBILE_EMBED_BACKGROUND_DEFAULT ?? c.BACKGROUND_MOD_SUBTLE,
	)
	const border = useToken(c.BORDER_SUBTLE ?? c.BACKGROUND_MOD_SUBTLE)
	const fg = useToken(c.TEXT_LINK ?? c.TEXT_BRAND)
	const Icon = assetIcon('FileIcon')
	const url = signed(entry, file)
	return (
		<Pressable
			disabled={!url}
			onPress={() => url && Linking.openURL(url).catch(() => {})}
			style={({ pressed }) => ({
				flexDirection: 'row',
				alignItems: 'center',
				gap: 10,
				padding: 12,
				borderRadius: 8,
				borderWidth: 1,
				borderColor: border,
				backgroundColor: bg,
				opacity: pressed ? 0.8 : 1,
			})}
		>
			<Icon size="lg" color={fg} />
			<Text
				variant="text-md/medium"
				color={url === null ? 'text-muted' : 'text-link'}
				lineClamp={1}
				style={{ flex: 1 }}
			>
				{url === null ? `${file[1]} (no longer available)` : file[1]}
			</Text>
		</Pressable>
	)
}

const hex = (n?: number) =>
	n === undefined ? undefined : `#${n.toString(16).padStart(6, '0')}`

function RichEmbed({
	entry,
	e,
	width,
	full,
}: {
	entry: Entry
	e: EmbedRef
	width: number
	full?: boolean
}) {
	const { Text } = Design as any
	const c = colors()
	const bg = useToken(c.MOBILE_EMBED_BACKGROUND_DEFAULT ?? c.EMBED_BACKGROUND)
	const border = useToken(c.BORDER_SUBTLE ?? c.BACKGROUND_MOD_SUBTLE)
	const bar = useToken(c.BORDER_STRONG ?? c.BACKGROUND_MOD_STRONG)
	const inner = width - 4 - 24 - 2
	const side = !!e.m && !e.big && e.k !== 'video'
	const big = !!e.m && !side
	const link = () => e.u && Linking.openURL(e.u).catch(() => {})
	const item: ViewItem | null =
		big && e.m && e.k !== 'video'
			? {
					key: 'rich',
					kind: 'image',
					thumb: e.m[0],
					full: e.m[0].split('?')[0]!,
					link: e.u,
					w: e.m[1] || 1280,
					h: e.m[2] || 720,
					accessory: 'embed',
				}
			: null
	const [bw, bh] = e.m ? fit(e.m[1] || 1280, e.m[2] || 720, inner, 300) : [0, 0]
	return (
		<View
			style={{
				flexDirection: 'row',
				borderRadius: 8,
				overflow: 'hidden',
				backgroundColor: bg,
				borderWidth: 1,
				borderColor: border,
				maxWidth: width,
			}}
		>
			<View style={{ width: 4, backgroundColor: hex(e.c) ?? bar }} />
			<View style={{ flex: 1, padding: 12, gap: 6 }}>
				<View style={{ flexDirection: 'row', gap: 12 }}>
					<View style={{ flex: 1, gap: 4 }}>
						{!!e.p && (
							<Text variant="text-xs/normal" color="text-muted" lineClamp={1}>
								{e.p}
							</Text>
						)}
						{!!e.au && (
							<Text
								variant="text-sm/semibold"
								color="text-strong"
								lineClamp={1}
							>
								{e.au}
							</Text>
						)}
						{!!e.ti && (
							<Text
								variant="text-md/semibold"
								color={e.u ? 'text-link' : 'text-strong'}
								lineClamp={full ? undefined : 2}
								onPress={e.u ? link : undefined}
							>
								{e.ti}
							</Text>
						)}
						{!!e.d && (
							<Markdown
								text={e.d}
								variant="text-sm/normal"
								lines={full ? undefined : 4}
							/>
						)}
					</View>
					{side && (
						<Pressable onPress={link}>
							<Image
								source={{ uri: e.m![0] }}
								style={{ width: 80, height: 80, borderRadius: 4 }}
								resizeMode="cover"
							/>
						</Pressable>
					)}
				</View>
				{big && e.m && (
					<Tile
						item={
							item ?? {
								key: 'vid',
								kind: 'video',
								thumb: e.m[0],
								full: e.u ?? e.m[0],
								w: bw,
								h: bh,
								accessory: 'embed',
							}
						}
						w={bw}
						h={bh}
						radius={4}
						onPress={ref => (item ? openNative(entry, [item], 0, ref) : link())}
					/>
				)}
			</View>
		</View>
	)
}

export function Stickers({ ids }: { ids: string[] }) {
	return (
		<View style={{ flexDirection: 'row', gap: 8 }}>
			{ids.map(id => (
				<Image
					key={id}
					source={{
						uri: `https://media.discordapp.net/stickers/${id}.webp?size=320`,
					}}
					style={{ width: 160, height: 160 }}
				/>
			))}
		</View>
	)
}

export function Source({ entry }: { entry: Entry }) {
	const { Text } = Design as any
	const ch = stores.ChannelStore?.getChannel?.(entry.c)
	if (!ch) return null
	const guild = ch.guild_id
		? stores.GuildStore?.getGuild?.(ch.guild_id)
		: undefined
	const label = ch.guild_id
		? `#${ch.name}${guild ? ` · ${guild.name}` : ''}`
		: ch.type === 3
			? ch.name || 'Group chat'
			: 'Direct message'
	return (
		<Text
			variant="text-xs/medium"
			color="text-muted"
			lineClamp={1}
			style={{ alignSelf: 'flex-end', marginTop: 2 }}
		>
			{label}
		</Text>
	)
}

function AppTag() {
	const { Text } = Design as any
	const c = colors()
	const bg = useToken(c.BACKGROUND_BRAND ?? c.BRAND_500)
	return (
		<View
			style={{
				backgroundColor: bg,
				borderRadius: 4,
				paddingHorizontal: 4,
				height: 16,
				justifyContent: 'center',
			}}
		>
			<Text variant="text-xxs/bold" style={{ color: '#fff' }}>
				APP
			</Text>
		</View>
	)
}

function Header({
	entry,
	user,
	gone,
}: {
	entry: Entry
	user: any
	gone: boolean
}) {
	const { Text } = Design as any
	const Styled = usernames()?.default
	const Tag = guildTags()?.default
	const sent = snowflakeTime(entry.m)
	const member =
		entry.g && entry.a
			? stores.GuildMemberStore?.getMember?.(entry.g, entry.a)
			: undefined
	const anon = !!entry.p
	const name = anon
		? 'Anonymous'
		: gone
			? 'Deleted User'
			: member?.nick || (user ? displayName(user) : '…')
	const color =
		!anon && !user?.displayNameStyles && member?.colorString
			? { color: member.colorString }
			: undefined
	const tappable = !anon && !!entry.a && !gone
	const primary =
		!anon && user?.primaryGuild?.identityEnabled && user.primaryGuild.tag
			? user.primaryGuild
			: undefined
	return (
		<View
			style={{
				flexDirection: 'row',
				alignItems: 'center',
				gap: 6,
				minHeight: 22,
			}}
		>
			<Pressable
				disabled={!tappable}
				onPress={() => entry.a && openProfile(entry.a)}
				hitSlop={{ top: 6, bottom: 6 }}
				style={({ pressed }) => ({
					flexShrink: 1,
					minWidth: 0,
					opacity: pressed ? 0.6 : 1,
				})}
			>
				{Styled && user && tappable ? (
					<Styled
						userId={entry.a}
						guildId={entry.g}
						userName={name}
						variant="text-md/semibold"
						effectDisplayType={1}
						lineClamp={1}
						defaultColor="text-strong"
						style={color}
						containerStyle={{ flexShrink: 1, minWidth: 0 }}
					/>
				) : (
					<Text
						variant="text-md/semibold"
						color={anon || gone ? 'text-muted' : 'text-strong'}
						lineClamp={1}
						style={color}
					>
						{name}
					</Text>
				)}
			</Pressable>
			{primary && Tag && (
				<Tag
					primaryGuild={primary}
					badgeSize={14}
					textVariant="text-xs/medium"
					containerStyles={{ alignSelf: 'center' }}
				/>
			)}
			{user?.bot && !anon && <AppTag />}
			<Text
				variant="text-xs/medium"
				color="text-muted"
				style={{ flexShrink: 0 }}
			>
				{when(sent)}
			</Text>
		</View>
	)
}

export function Avatar({
	entry,
	user,
	gone,
}: {
	entry: Entry
	user: any
	gone: boolean
}) {
	const c = colors()
	const muted = useToken(c.ICON_MUTED ?? c.TEXT_MUTED)
	const anonBg = useToken(c.BACKGROUND_MOD_STRONG ?? c.BACKGROUND_MOD_SUBTLE)
	const EyeSlash = assetIcon('EyeSlashIcon')
	const tappable = !entry.p && !!entry.a && !gone
	const source = entry.p
		? undefined
		: (user && avatarSource(user, 80)) ||
			(entry.a ? { uri: defaultAvatar(entry.a) } : undefined)
	return (
		<Pressable
			disabled={!tappable}
			onPress={() => entry.a && openProfile(entry.a)}
			style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
			accessibilityLabel={tappable ? 'Open profile' : undefined}
		>
			{source ? (
				<Image
					source={source}
					style={{ width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 }}
				/>
			) : (
				<View
					style={{
						width: AVATAR,
						height: AVATAR,
						borderRadius: AVATAR / 2,
						backgroundColor: anonBg,
						alignItems: 'center',
						justifyContent: 'center',
					}}
				>
					<EyeSlash size="sm" color={muted} />
				</View>
			)}
		</Pressable>
	)
}

export function MessageBody({
	entry,
	full,
	onMore,
}: {
	entry: Entry
	full?: boolean
	onMore?: () => void
}) {
	const { Text } = Design as any
	const { user, gone } = useUser(entry.a)
	const [width, setWidth] = useState(0)
	const text = shownText(entry)
	const long = !full && isLong(entry)
	const rich = (entry.e ?? []).filter(e => !isMediaEmbed(e))
	const files = (entry.f ?? []).filter(f => !isImage(f) && !isVideo(f))
	return (
		<View style={{ flexDirection: 'row', gap: 12 }}>
			<Avatar entry={entry} user={user} gone={gone} />
			<View
				style={{ flex: 1, gap: 4 }}
				onLayout={e => setWidth(e.nativeEvent.layout.width)}
			>
				<Header entry={entry} user={user} gone={gone} />
				{!!text && <Markdown text={text} lines={full ? undefined : 8} />}
				{long && onMore && (
					<Text
						variant="text-sm/semibold"
						color="text-link"
						onPress={onMore}
						suppressHighlighting
					>
						Show more
					</Text>
				)}
				<Gallery entry={entry} width={width} />
				{files.map(f => (
					<FileRow key={f[0]} entry={entry} file={f} />
				))}
				{(full ? rich : rich.slice(0, long ? 1 : 4)).map((e, i) => (
					<RichEmbed key={i} entry={entry} e={e} width={width} full={full} />
				))}
				{!!entry.s?.length && <Stickers ids={entry.s} />}
			</View>
		</View>
	)
}
