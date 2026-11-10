import { Design } from '@valenced/discord/design'
import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import type { PluginApi } from '@valenced/plugins/types'
import type { Options } from './latency'

export function Settings({
	api,
}: {
	api: PluginApi<{ jsonStorage: Options }>
}) {
	const { TableRowGroup, TableSwitchRow, TextInput } = Design as any
	const { jsonStorage } = api
	const s = jsonStorage.use()
	const [text, setText] = useState<string | null>(null)
	if (!s) return null

	return (
		<ScrollView
			contentContainerStyle={{ padding: 16, paddingBottom: 64, gap: 16 }}
		>
			<TableRowGroup title="Threshold in seconds for latency indicator">
				<View style={{ padding: 12 }}>
					<TextInput
						value={text ?? String(s.latency)}
						keyboardType="decimal-pad"
						placeholder="2"
						onChange={(v: string) => {
							setText(v)
							const n = Number(v.replace(',', '.'))
							if (v.trim() && Number.isFinite(n) && n >= 0)
								jsonStorage.set({ latency: n })
						}}
					/>
				</View>
			</TableRowGroup>
			<TableRowGroup>
				<TableSwitchRow
					label="Always show indicator"
					subLabel="Green bars on messages under the threshold, tap to see the delay"
					value={s.alwaysShow}
					onValueChange={(v: boolean) => jsonStorage.set({ alwaysShow: v })}
				/>
				<TableSwitchRow
					label="Detect old Discord Android clients"
					value={s.detectDiscordKotlin}
					onValueChange={(v: boolean) =>
						jsonStorage.set({ detectDiscordKotlin: v })
					}
				/>
				<TableSwitchRow
					label="Show milliseconds"
					value={s.showMillis}
					onValueChange={(v: boolean) => jsonStorage.set({ showMillis: v })}
				/>
				<TableSwitchRow
					label="Don't add indicator to your own messages"
					value={s.ignoreSelf}
					onValueChange={(v: boolean) => jsonStorage.set({ ignoreSelf: v })}
				/>
			</TableRowGroup>
		</ScrollView>
	)
}
