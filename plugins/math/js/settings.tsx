import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import type { PluginApi } from '@valenced/plugins/types'
import type { Options } from './index'

export function Settings({
	api,
}: {
	api: PluginApi<{ jsonStorage: Options }>
}) {
	const { TableRowGroup, TableSwitchRow } = Design as any
	const { jsonStorage } = api
	const s = jsonStorage.use()
	if (!s) return null

	return (
		<ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 64 }}>
			<TableRowGroup>
				<TableSwitchRow
					label="Solve math"
					subLabel="Solves math in your messages when you send them"
					value={s.enabled}
					onValueChange={(v: boolean) => jsonStorage.set({ enabled: v })}
				/>
				<TableSwitchRow
					label="Chat bar button"
					subLabel="Adds a button to the chat bar to turn math on or off"
					value={s.button}
					onValueChange={(v: boolean) => jsonStorage.set({ button: v })}
				/>
			</TableRowGroup>
		</ScrollView>
	)
}
