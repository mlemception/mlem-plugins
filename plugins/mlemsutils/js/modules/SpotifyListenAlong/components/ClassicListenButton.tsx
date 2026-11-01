import { Design } from '@valenced/discord/design'
import { View } from 'react-native'
import UserPlayIcon from '../../../../assets/SpotifyListenAlong/UserPlayIcon.png'
import { doSync, useListenButton, useLoading } from './core'
import type { ListenButtonProps } from './core'

export default function ClassicListenButton({
	button,
	activity,
}: ListenButtonProps) {
	const { disabled, userId } = useListenButton(activity)
	const { loading: _loading, trigger } = useLoading()
	const loading = _loading && !disabled

	const { IconButton } = Design as any

	return (
		<View style={{ flexDirection: 'row', flexGrow: 1 }}>
			<View style={[{ paddingRight: 6 }, !!disabled && { opacity: 0.5 }]}>
				<IconButton
					size="sm"
					variant="primary"
					loading={loading}
					icon={{ uri: UserPlayIcon }}
					onPress={() =>
						!loading &&
						(doSync(disabled, activity, userId), !disabled && trigger())
					}
				/>
			</View>
			<View style={{ flexGrow: 1 }}>{button}</View>
		</View>
	)
}
