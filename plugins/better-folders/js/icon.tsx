import { getAssetIdByName } from '@valenced/assets'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { Image } from 'react-native'

const icons = new Map<string, any>()
let base: any

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
