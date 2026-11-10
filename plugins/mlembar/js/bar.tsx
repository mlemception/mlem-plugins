import { Tokens } from '@valenced/discord/common/tokens'
import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { createElement } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import { useOptions } from './store'
import type { ComponentType } from 'react'

const tokens = () => (Tokens as any).default ?? Tokens

function barColor() {
	const t = tokens()
	const theme = (Stores as any).ThemeStore?.theme ?? 'dark'
	const c = t.colors
	const color =
		c.MOBILE_FLOATINGBAR_BACKGROUND ??
		c.MOBILE_FLOATINGBAR_BACKGROUND_NAMEPLATE ??
		c.BACKGROUND_TERTIARY
	return (color && t.internal.resolveSemanticColor(theme, color)) || '#1e1f22'
}

let Gradient: any
const gradient = () => {
	if (!Gradient) [Gradient] = lookupModule(withName<any>('LinearGradient'))
	return Gradient
}

const clear = (c: string) =>
	/^#[0-9a-f]{6}$/i.test(c)
		? `${c}00`
		: /^#[0-9a-f]{8}$/i.test(c)
			? `${c.slice(0, 7)}00`
			: 'transparent'

function Fade() {
	const G = gradient()
	if (!G) return null
	const c = barColor()
	return (
		<G
			pointerEvents="none"
			colors={[c, clear(c)]}
			start={{ x: 0, y: 0 }}
			end={{ x: 1.3, y: 0 }}
			style={StyleSheet.absoluteFill}
		/>
	)
}

type Wrapped = { p: any; real: ComponentType<any> }

export function Background({ p, real }: Wrapped) {
	const s = useOptions()
	if (s.mode === 'nameplate') return createElement(real, p)

	const res = createElement(real, { ...p, hasNameplate: false })
	const url = s.url.trim()
	if (s.mode !== 'image' || !url) return res

	return (
		<View style={StyleSheet.absoluteFill} pointerEvents="none">
			{res}
			<View
				style={[
					styles.image,
					{ left: (p?.avatarSize ?? 60) / 2, borderRadius: 24 },
				]}
			>
				<Image
					source={{ uri: url }}
					style={StyleSheet.absoluteFill}
					resizeMode="cover"
				/>
				{s.fade && <Fade />}
			</View>
		</View>
	)
}

export function Nameplate({ p, real }: Wrapped) {
	const s = useOptions()
	if (s.mode !== 'nameplate') return null
	return createElement(real, p)
}

export function Bell({ p, real }: Wrapped) {
	const s = useOptions()
	if (s.mode === 'nameplate') return createElement(real, p)
	const hasNameplate = s.mode === 'image' && !!s.url.trim()
	return createElement(real, { ...p, hasNameplate })
}

const styles = StyleSheet.create({
	image: {
		position: 'absolute',
		top: 0,
		right: 0,
		bottom: 0,
		overflow: 'hidden',
		borderTopLeftRadius: 0,
		borderBottomLeftRadius: 0,
	},
})
