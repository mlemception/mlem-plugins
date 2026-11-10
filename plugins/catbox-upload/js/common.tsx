import { getAssetIdByName } from '@valenced/assets'
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

export function chatInput(channelId: string) {
	try {
		return byProps(
			'getBestActiveInputForChannelId',
		)?.getBestActiveInputForChannelId(channelId)
	} catch {}
}
