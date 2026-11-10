import { Design } from '@valenced/discord/design'
import { ScrollView, View } from 'react-native'
import { Picker } from './speed'
import type { PluginApi } from '@valenced/plugins/types'
import type { Options } from './index'

export function Settings({
	api,
}: {
	api: PluginApi<{ jsonStorage: Options }>
}) {
	const { TableRowGroup } = Design as any
	const { jsonStorage } = api
	const s = jsonStorage.use()
	if (!s) return null

	return (
		<ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 64 }}>
			<TableRowGroup title="Default speed">
				<View style={{ padding: 16 }}>
					<Picker
						value={s.speed ?? 1}
						onChange={speed => jsonStorage.set({ speed })}
					/>
				</View>
			</TableRowGroup>
		</ScrollView>
	)
}
