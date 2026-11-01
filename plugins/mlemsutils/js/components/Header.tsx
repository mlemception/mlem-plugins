import { View } from 'react-native'
import Text from '../lib/components/Text'
import { version } from '../version'
import SillyAvatar from './SillyAvatar'

export function Header() {
	return (
		<View
			style={{
				flexDirection: 'row',
				justifyContent: 'center',
				margin: 20,
				gap: 4,
			}}
		>
			<SillyAvatar />
			<View style={{ flexDirection: 'column', justifyContent: 'center' }}>
				<Text variant="display-md" color="TEXT_DEFAULT" align="left">
					mlem's utils
				</Text>
				<Text variant="text-md/bold" color="TEXT_MUTED" align="left">
					version {version}
				</Text>
			</View>
		</View>
	)
}
