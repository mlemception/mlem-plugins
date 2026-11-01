import { getAssetIdByName } from '@valenced/assets'
import { ToastActionCreators } from '@valenced/discord/actions'
import { Dispatcher } from '@valenced/discord/common/flux'
import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { createElement } from 'react'
import { Image } from 'react-native'

const cached = new Map<string, any>()

export function byProps<T = any>(...props: [string, ...string[]]): T {
	const key = props.join()
	let mod = cached.get(key)
	if (!mod) {
		;[mod] = lookupModule(withProps<any>(...props))
		if (mod) cached.set(key, mod)
	}
	return mod
}

export const tokens = () => (Tokens as any).default ?? Tokens

export const semanticColors = new Proxy({} as Record<string, any>, {
	get: (_, k: string) => tokens().colors[k],
})

export const rawColors = new Proxy({} as Record<string, string>, {
	get: (_, k: string) => tokens().unsafe_rawColors[k],
})

export const theme = (): string => (Stores as any).ThemeStore?.theme ?? 'dark'

export function resolveSemanticColor(color: any, t = theme()) {
	return (
		(color && tokens().internal.resolveSemanticColor(t, color)) || '#000000'
	)
}

export const resolveCustomSemantic = (
	dark: any,
	light: any,
	inverted?: boolean,
) => (theme() === 'light' ? (inverted ? dark : light) : inverted ? light : dark)

export const lerp = (og: string, target: string, perc: number) => {
	const hex2rgb = (hex: string) =>
		hex.match(/\w\w/g)?.map(x => Number.parseInt(x, 16)) ?? [0, 0, 0]
	const rgb2hex = (rgb: number[]) =>
		`#${rgb.map(x => x.toString(16).padStart(2, '0')).join('')}`

	const a = hex2rgb(og)
	const b = hex2rgb(target)
	return rgb2hex(a.map((x, i) => Math.round(x + (b[i]! - x) * perc)))
}

export function makeStyles(
	styles: Record<string, any> | (() => Record<string, any>),
) {
	let hook: (() => any) | undefined
	return (): Record<string, any> => {
		hook ??= Design.createStyles(
			typeof styles === 'function' ? styles() : (styles as any),
		) as any
		return hook!()
	}
}

export function fluxSubscribe(
	topic: string,
	callback: (data: any) => void,
	once?: boolean,
) {
	const d = Dispatcher as any
	const cback = (data: any) => (
		callback(data), once && d.unsubscribe(topic, cback)
	)
	d.subscribe(topic, cback)
	return () => d.unsubscribe(topic, cback)
}

export const icon = (name: string) => getAssetIdByName(name)!

export function showToast(text: string, iconId?: number) {
	const IconComponent = iconId
		? () =>
				createElement(Image, {
					source: iconId,
					style: { width: 24, height: 24 },
					resizeMode: 'contain',
				})
		: undefined
	ToastActionCreators.open(`mlemsutils-${text}`, {
		text,
		icon: IconComponent as any,
	})
}

export const Reanimated = new Proxy({} as any, {
	get: (_, k: string) => byProps('useSharedValue', 'withTiming')[k],
})

export const Forms = new Proxy({} as any, {
	get: (_, k: string) => byProps('FormRow', 'FormSwitchRow')[k],
})
