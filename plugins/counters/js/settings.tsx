import { Design } from '@valenced/discord/design'
import { ScrollView, View } from 'react-native'
import { defaults } from './store'
import type { PluginApi } from '@valenced/plugins/types'
import type { Options } from './store'

export function Settings({
	api,
}: {
	api: PluginApi<{ jsonStorage: Options }>
}) {
	const { TableRowGroup, TableSwitchRow, Slider, Text } = Design as any
	const s = api.jsonStorage.use()
	if (!s) return null
	const scale = Math.min(1.5, Math.max(0.5, s.scale ?? defaults.scale))

	return (
		<ScrollView
			contentContainerStyle={{ padding: 16, paddingBottom: 64, gap: 16 }}
		>
			<TableRowGroup>
				<TableSwitchRow
					label="Server count"
					subLabel="Show the amount of servers you are in near the top of the guild list."
					value={s.servers ?? defaults.servers}
					onValueChange={(v: boolean) => api.jsonStorage.set({ servers: v })}
				/>
				<TableSwitchRow
					label="Online friend count"
					subLabel="Show the amount of friends currently online near the top of the guild list."
					value={s.online ?? defaults.online}
					onValueChange={(v: boolean) => api.jsonStorage.set({ online: v })}
				/>
			</TableRowGroup>
			<TableRowGroup title="Text size">
				<View style={{ padding: 16, gap: 8 }}>
					<Text variant="text-md/medium">
						{scale.toFixed(2).replace(/0$/, '')}x
					</Text>
					<Slider
						value={scale}
						minimumValue={0.5}
						maximumValue={1.5}
						step={0.05}
						onValueChange={(v: number) =>
							api.jsonStorage.set({ scale: Math.round(v * 100) / 100 })
						}
					/>
				</View>
			</TableRowGroup>
		</ScrollView>
	)
}
