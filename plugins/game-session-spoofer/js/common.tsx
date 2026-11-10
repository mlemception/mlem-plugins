import { getAssetIdByName } from '@valenced/assets'
import { ToastActionCreators } from '@valenced/discord/actions'
import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { useEffect, useReducer, useState } from 'react'
import { Image, Pressable, View } from 'react-native'
import { iconHash, iconUrl, onIcons, wantIcon } from './games'

let base: any
const icons = new Map<string, any>()

export function icon(name: string) {
	let Icon = icons.get(name)
	if (!Icon) {
		Icon = ({ size, color, style }: any) => {
			if (!base) [base] = lookupModule(withProps<any>('BaseIconImage'))
			const Base = base?.BaseIconImage
			const source = getAssetIdByName(name)
			if (Base)
				return <Base source={source} size={size} color={color} style={style} />
			const px = typeof size === 'number' ? size : 24
			return (
				<Image
					source={source}
					style={[{ width: px, height: px, tintColor: color }, style]}
				/>
			)
		}
		icons.set(name, Icon)
	}
	return Icon
}

export function toast(text: string, iconName = 'GameControllerIcon') {
	ToastActionCreators.open(`gss-${Date.now()}`, {
		text,
		icon: icon(iconName),
	} as any)
}

const tokens = () => (Tokens as any).default ?? Tokens
export const colors = () => tokens().colors
export const useToken = (t: any) => (Design as any).useToken(t)

export function useNow(on = true, every = 1000) {
	const [, tick] = useReducer(x => x + 1, 0)
	useEffect(() => {
		if (!on) return
		const t = setInterval(tick, every)
		return () => clearInterval(t)
	}, [on, every])
	return Date.now()
}

export function useIcons() {
	const [, tick] = useReducer(x => x + 1, 0)
	useEffect(() => onIcons(tick), [])
}

export function GameIcon({
	id,
	hash,
	size = 40,
}: {
	id: string
	hash?: string | null
	size?: number
}) {
	const c = colors()
	const bg = useToken(c.BACKGROUND_MOD_SUBTLE)
	const fg = useToken(c.INTERACTIVE_NORMAL ?? c.TEXT_MUTED)
	const [broken, setBroken] = useState(false)
	const h = hash ?? iconHash(id)
	useEffect(() => {
		if (h === undefined) wantIcon(id)
	}, [id, h])
	const uri = !broken && iconUrl(id, h, size > 48 ? 256 : 128)
	const radius = Math.round(size * 0.24)
	const Ctrl = icon('GameControllerIcon')
	return (
		<View
			style={{
				width: size,
				height: size,
				borderRadius: radius,
				backgroundColor: bg,
				overflow: 'hidden',
				alignItems: 'center',
				justifyContent: 'center',
			}}
		>
			{uri ? (
				<Image
					source={{ uri }}
					onError={() => setBroken(true)}
					style={{ width: size, height: size }}
				/>
			) : (
				<Ctrl size={size > 40 ? 'md' : 'sm'} color={fg} />
			)}
		</View>
	)
}

export function Pill({
	label,
	selected,
	onPress,
	disabled,
}: {
	label: string
	selected?: boolean
	onPress: () => void
	disabled?: boolean
}) {
	const { Text } = Design as any
	const c = colors()
	const brand = useToken(c.BACKGROUND_BRAND)
	const bg = useToken(c.BACKGROUND_MOD_SUBTLE)
	const pressedBg = useToken(c.BACKGROUND_MOD_STRONG ?? c.BACKGROUND_MOD_SUBTLE)
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityState={{ selected: !!selected, disabled: !!disabled }}
			disabled={disabled}
			onPress={onPress}
			style={({ pressed }) => ({
				paddingHorizontal: 14,
				height: 34,
				borderRadius: 17,
				justifyContent: 'center',
				opacity: disabled ? 0.4 : 1,
				backgroundColor: selected ? brand : pressed ? pressedBg : bg,
			})}
		>
			<Text
				variant="text-sm/semibold"
				color={selected ? 'white' : 'text-default'}
				style={selected ? { color: '#fff' } : undefined}
			>
				{label}
			</Text>
		</Pressable>
	)
}

export function Label({ text, hint }: { text: string; hint?: string }) {
	const { Text } = Design as any
	return (
		<View style={{ gap: 2 }}>
			<Text variant="text-sm/semibold" color="text-strong">
				{text}
			</Text>
			{!!hint && (
				<Text variant="text-xs/medium" color="text-muted">
					{hint}
				</Text>
			)}
		</View>
	)
}

export function Bar({ value }: { value: number }) {
	const c = colors()
	const track = useToken(c.BACKGROUND_MOD_STRONG ?? c.BACKGROUND_MOD_SUBTLE)
	const fill = useToken(c.STATUS_POSITIVE ?? c.BACKGROUND_BRAND)
	return (
		<View
			style={{
				height: 4,
				borderRadius: 2,
				backgroundColor: track,
				overflow: 'hidden',
			}}
		>
			<View
				style={{
					width: `${Math.max(0, Math.min(1, value)) * 100}%`,
					height: 4,
					borderRadius: 2,
					backgroundColor: fill,
				}}
			/>
		</View>
	)
}

export function fmt(ms: number) {
	const total = Math.max(0, Math.floor(ms / 60_000))
	if (total < 1) return 'under a minute'
	const d = Math.floor(total / 1440)
	const h = Math.floor((total % 1440) / 60)
	const m = total % 60
	if (d) return h ? `${d}d ${h}h` : `${d}d`
	if (h) return m ? `${h}h ${m}m` : `${h}h`
	return `${m}m`
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const fmtMinutes = (m: number) => (m ? fmt(m * 60_000) : 'until stopped')

export const MAX_MINUTES = 7 * 1440
export const MAX_PLAYED = 1440

export function parse(input: string, max = MAX_MINUTES): number | null {
	const s = input.trim().toLowerCase()
	if (!s) return null
	if (/^(0|forever|inf(inite)?|∞)$/.test(s)) return 0
	if (/^\d+$/.test(s)) {
		const n = Number(s)
		return n <= max ? n : null
	}
	const re =
		/(\d+(?:[.,]\d+)?)\s*(d(?:ays?)?|h(?:(?:ou)?rs?)?|m(?:in(?:ute)?s?)?)/g
	let total = 0
	let used = ''
	for (const m of s.matchAll(re)) {
		const n = Number(m[1].replace(',', '.'))
		const u = m[2][0]
		total += u === 'd' ? n * 1440 : u === 'h' ? n * 60 : n
		used += m[0]
	}
	if (!used || s.replace(/\s+/g, '') !== used.replace(/\s+/g, '')) return null
	const r = Math.round(total)
	return r > 0 && r <= max ? r : null
}
