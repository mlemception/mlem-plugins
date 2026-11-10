import { getAssetIdByName } from '@valenced/assets'
import { ToastActionCreators } from '@valenced/discord/actions'
import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { Image } from 'react-native'

const cache = new Map<string, any>()

export function byProps(...props: [string, ...string[]]): any {
	const key = props.join()
	let mod = cache.get(key)
	if (!mod) {
		;[mod] = lookupModule(withProps<any>(...props))
		if (mod) cache.set(key, mod)
	}
	return mod
}

const icons = new Map<string, any>()

export function icon(name: string) {
	let Icon = icons.get(name)
	if (!Icon) {
		Icon = ({ size, color, style }: any) => {
			const Base = byProps('BaseIconImage')?.BaseIconImage
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

export function chatInput(channelId?: string) {
	if (!channelId) return
	try {
		return byProps(
			'getBestActiveInputForChannelId',
		)?.getBestActiveInputForChannelId(channelId)
	} catch {}
}

export function draftOf(channelId?: string): string {
	if (!channelId) return ''
	try {
		const i = chatInput(channelId)
		const t = i?.getText?.()
		if (typeof t === 'string') return t
	} catch {}
	try {
		const d = byProps('getDraft', 'getThreadSettings')?.getDraft(channelId, 0)
		return typeof d === 'string' ? d : (d?.content ?? '')
	} catch {}
	return ''
}

export function putText(channelId: string | undefined, text: string) {
	const i = chatInput(channelId)
	if (!i?.setText) return false
	i.setText(text)
	return true
}

export function toast(text: string, iconName = 'PencilSparkleIcon') {
	const Icon = icon(iconName)
	ToastActionCreators.open(`styletranslate-${Date.now()}`, {
		text,
		icon: Icon as any,
	} as any)
}

export const tokens = () => (Tokens as any).default ?? Tokens

export const useToken = (t: any) => (Design as any).useToken(t)

export const colors = () => tokens().colors

export function pretty(text: string) {
	const S = Stores as any
	const name = (id: string) => {
		try {
			const u = S.UserStore.getUser(id)
			return u ? `@${u.globalName ?? u.username}` : undefined
		} catch {}
	}
	const chan = (id: string) => {
		try {
			const c = S.ChannelStore.getChannel(id)
			return c?.name ? `#${c.name}` : undefined
		} catch {}
	}
	return text
		.replace(/<@!?(\d+)>/g, (m, id) => name(id) ?? m)
		.replace(/<@&\d+>/g, '@role')
		.replace(/<#(\d+)>/g, (m, id) => chan(id) ?? m)
		.replace(/<a?:(\w+):\d+>/g, ':$1:')
}
