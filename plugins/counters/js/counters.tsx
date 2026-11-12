import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { useMemo, useState } from 'react'
import { PixelRatio, View } from 'react-native'
import { bump, opts, useOptions } from './store'

const S: any = new Proxy({}, { get: (_, k) => (Stores as any)[k] })
const tokens = () => (Tokens as any).default ?? Tokens

const FONT = 10
const LINE = 12
const GAP = 2
const PAD = 4
const MAX_FONT_SCALE = 1.5
const DOT = 8

let mods:
	| { intl?: any; t?: any; hash?: (k: string) => string; sfs?: any }
	| undefined
const discord = () => {
	if (mods) return mods
	const [i] = lookupModule(withProps<any>('intl', 't'))
	const [h] = lookupModule(withProps<any>('runtimeHashMessageKey'))
	const [s] = lookupModule(withProps<any>('useStateFromStores'))
	mods = {
		intl: i?.intl,
		t: i?.t,
		hash: h?.runtimeHashMessageKey,
		sfs: s?.useStateFromStores,
	}
	return mods
}

function format(
	hash: string,
	values: Record<string, number>,
	fallback: string,
): string {
	const { intl, t } = discord()
	try {
		const msg = t?.[hash]
		if (msg) {
			const s = intl.formatToPlainString(msg, values)
			if (s) return s
		}
	} catch {}
	return fallback
}

const serversText = (n: number) => format('knOfkb', { num: n }, `${n} servers`)
const onlineText = (n: number) => {
	const h = discord().hash?.('INSTANT_INVITE_GUILD_MEMBERS_ONLINE') ?? 'LC+S+m'
	return format(h, { membersOnline: n }, `${n} Online`)
}

const lines = (o = opts()) => (o.servers ? 1 : 0) + (o.online ? 1 : 0)
const fontScale = () => Math.min(PixelRatio.getFontScale() || 1, MAX_FONT_SCALE)

let measured: { key: string; h: number } | undefined
const sizeKey = (o = opts()) => `${lines(o)}|${o.scale}|${fontScale()}`

export function blockHeight() {
	const o = opts()
	const n = lines(o)
	if (!n) return 0
	if (measured?.key === sizeKey(o)) return measured.h
	return PAD * 2 + n * LINE * o.scale * fontScale() + (n - 1) * GAP
}

export const hasBlock = () => lines() > 0

function onlineFriends() {
	const offline = 'offline'
	return S.RelationshipStore.getFriendIDs().filter(
		(id: string) => S.PresenceStore.getStatus(id) !== offline,
	).length
}

const guildCount = () => S.GuildStore.getGuildCount()

function useCount(names: string[], get: () => number) {
	const stores = useMemo(() => names.map(n => S[n]), [])
	return discord().sfs(stores, get)
}

function ServerLine({ n, size }: { n: number; size: object }) {
	const Text = (Design as any).Text
	return (
		<Text
			variant="text-xxs/medium"
			color="text-muted"
			lineClamp={2}
			maxFontSizeMultiplier={MAX_FONT_SCALE}
			style={[size, { textAlign: 'center' }]}
		>
			{serversText(n)}
		</Text>
	)
}

function OnlineLine({ n, size, em }: { n: number; size: object; em: number }) {
	const Text = (Design as any).Text
	const color = (Design as any).useToken(tokens().colors.ICON_STATUS_ONLINE)
	const text = onlineText(n)
	const key = `${text}|${em}`
	const [wrapFor, setWrapFor] = useState<string>()
	const wrap = wrapFor === key
	const gap = wrap ? Math.round(em * 0.25) : 4
	const dot = (
		<View
			style={{
				width: DOT,
				height: DOT,
				borderRadius: tokens().radii.round,
				backgroundColor: color,
				marginRight: wrap ? 4 - gap : 0,
			}}
		/>
	)
	const props = {
		variant: 'text-xxs/medium',
		color: 'text-muted',
		maxFontSizeMultiplier: MAX_FONT_SCALE,
	}
	return (
		<View
			style={{
				flexDirection: 'row',
				flexWrap: wrap ? 'wrap' : 'nowrap',
				alignItems: 'center',
				justifyContent: 'center',
				gap,
			}}
		>
			{dot}
			{wrap ? (
				text.split(/\s+/).map((w, i) => (
					<Text key={i} {...props} lineClamp={1} style={size}>
						{w}
					</Text>
				))
			) : (
				<Text
					{...props}
					lineClamp={2}
					style={[size, { flexShrink: 1 }]}
					onTextLayout={(e: any) => {
						if (e.nativeEvent.lines.length > 1) setWrapFor(key)
					}}
				>
					{text}
				</Text>
			)}
		</View>
	)
}

export function Counters() {
	const o = useOptions()
	const servers = useCount(['GuildStore'], guildCount)
	const online = useCount(['PresenceStore', 'RelationshipStore'], onlineFriends)
	if (!lines(o)) return null
	const label = [
		o.servers && serversText(servers),
		o.online && onlineText(online),
	]
		.filter(Boolean)
		.join(', ')
	const size =
		o.scale === 1
			? {}
			: { fontSize: FONT * o.scale, lineHeight: LINE * o.scale }
	return (
		<View
			accessible
			accessibilityRole="text"
			accessibilityLabel={label}
			onLayout={e => {
				const h = e.nativeEvent.layout.height
				if (Math.abs(h - blockHeight()) > 0.5) {
					measured = { key: sizeKey(o), h }
					bump()
				}
			}}
			style={{
				paddingTop: PAD,
				paddingBottom: PAD,
				paddingHorizontal: PAD,
				gap: GAP,
				alignItems: 'stretch',
			}}
		>
			{o.servers && <ServerLine n={servers} size={size} />}
			{o.online && (
				<OnlineLine n={online} size={size} em={FONT * o.scale * fontScale()} />
			)}
		</View>
	)
}
