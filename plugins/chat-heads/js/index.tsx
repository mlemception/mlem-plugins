import { Design } from '@valenced/discord/design'
import { callNativeMethod } from '@valenced/modules/native'
import type { PluginApi } from '@valenced/plugins/types'
import { useEffect, useState } from 'react'
import { AppState, ScrollView } from 'react-native'

const defaults = {
	dms: true,
	groups: true,
	preview: false,
	haptics: true,
}
type Options = typeof defaults

const call = callNativeMethod as (name: string, args: unknown[]) => Promise<any>

const rows: [keyof Options, string, string][] = [
	['dms', 'Direct messages', 'A head for each person who messages you'],
	['groups', 'Group chats and servers', 'Group DMs and server pings you get notified for'],
	['preview', 'Message preview', 'Show the last message under each head when they fan out'],
	['haptics', 'Haptics', 'A tick when a head snaps onto the X'],
]

function Settings({ api }: { api: PluginApi<{ jsonStorage: Options }> }) {
	const { TableRowGroup, TableSwitchRow, TableRow } = Design as any
	const s = api.jsonStorage.use()
	const [allowed, setAllowed] = useState<boolean | null>(null)

	useEffect(() => {
		const check = () => call('mlemheads.allowed', []).then(setAllowed, () => setAllowed(false))
		check()
		const sub = AppState.addEventListener('change', st => st === 'active' && check())
		return () => sub.remove()
	}, [])

	if (!s) return null
	return (
		<ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 64, gap: 16 }}>
			<TableRowGroup
				title="Permission"
				description="Heads float over other apps, so Discord needs to be allowed to display over them."
			>
				<TableRow
					label="Display over other apps"
					subLabel={allowed == null ? 'Checking...' : allowed ? 'Allowed' : 'Not allowed, tap to fix'}
					arrow={!allowed}
					onPress={() => call('mlemheads.permission', [])}
				/>
			</TableRowGroup>
			<TableRowGroup title="Heads">
				{rows.map(([key, label, sub]) => (
					<TableSwitchRow
						key={key}
						label={label}
						subLabel={sub}
						value={s[key] ?? defaults[key]}
						onValueChange={(v: boolean) => api.jsonStorage.set({ [key]: v })}
					/>
				))}
			</TableRowGroup>
			<TableRowGroup description="Pops up a fake head so you can try it out. It's gone the next time you open Discord.">
				<TableRow label="Show a test head" onPress={() => call('mlemheads.test', [])} />
			</TableRowGroup>
		</ScrollView>
	)
}

export default plugin<{ jsonStorage: Options }>({
	jsonStorage: { default: defaults },
	SettingsComponent: Settings,
	start() {},
})
