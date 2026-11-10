import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import type { PluginApi } from '@valenced/plugins/types'
import type { Options } from '.'

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
		<ScrollView
			contentContainerStyle={{ padding: 16, paddingBottom: 64, gap: 16 }}
		>
			<TableRowGroup>
				<TableSwitchRow
					label="Hide join messages"
					subLabel={'Messages like "X is here." when someone joins a server'}
					value={s.hideJoins}
					onValueChange={(v: boolean) => jsonStorage.set({ hideJoins: v })}
				/>
			</TableRowGroup>
			<TableRowGroup title="Wave stickers">
				<TableSwitchRow
					label="Hide wave sticker replies"
					subLabel="Sticker replies sent with the Wave to say hi button"
					value={s.hideWaves}
					onValueChange={(v: boolean) => jsonStorage.set({ hideWaves: v })}
				/>
				<TableSwitchRow
					label="Show how many were hidden"
					disabled={!s.hideWaves}
					value={s.showCount}
					onValueChange={(v: boolean) => jsonStorage.set({ showCount: v })}
				/>
			</TableRowGroup>
		</ScrollView>
	)
}
