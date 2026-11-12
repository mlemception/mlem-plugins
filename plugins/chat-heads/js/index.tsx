import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { callNativeMethod } from '@valenced/modules/native'
import { useEffect, useState } from 'react'
import { AppRegistry, AppState, ScrollView } from 'react-native'
import Card, { overlay } from './card'
import { D, warn } from './discord'
import type { PluginApi } from '@valenced/plugins/types'

const defaults = {
	dms: true,
	groups: true,
	quickReply: true,
	preview: false,
	haptics: true,
}
type Options = typeof defaults

const call = callNativeMethod as (name: string, args: unknown[]) => Promise<any>

const KEYS = ['BACKGROUND_FEEDBACK_NOTIFICATION', 'TEXT_MUTED']

let seeded = false
function seedStartup() {
	if (seeded || AppState.currentState !== 'active') return
	seeded = !!D.startup
}

let lastTheme = ''
function pushTheme() {
	const tokens = D.tokens
	const store = Stores.ThemeStore as any
	const theme = store?.theme
	if (
		!tokens?.internal?.resolveSemanticColor ||
		!theme ||
		store._isInitialized === false
	)
		return
	if (theme === lastTheme) return
	lastTheme = theme
	const colors: Record<string, string> = {}
	for (const k of KEYS) {
		const c = tokens.colors[k]
		if (!c) return
		colors[k] = tokens.internal.resolveSemanticColor(theme, c)
	}
	call('mlemheads.theme', [
		JSON.stringify({ theme, light: theme === 'light', colors }),
	]).catch(() => {})
}

const rows: [keyof Options, string, string][] = [
	['dms', 'Direct messages', 'A head for each person who messages you'],
	[
		'groups',
		'Group chats and servers',
		'Group DMs and server pings you get notified for',
	],
	[
		'quickReply',
		'Quick reply',
		'Tap a head to read and reply right there. Hold it to open the chat in Discord',
	],
	[
		'haptics',
		'Haptics',
		'The same ticks Discord uses when you drag a head, open the card or switch chats',
	],
]

function Settings({ api }: { api: PluginApi<{ jsonStorage: Options }> }) {
	const { TableRowGroup, TableSwitchRow, TableRow } = Design as any
	const s = api.jsonStorage.use()
	const [allowed, setAllowed] = useState<boolean | null>(null)

	useEffect(() => {
		const check = () =>
			call('mlemheads.allowed', []).then(setAllowed, () => setAllowed(false))
		check()
		const sub = AppState.addEventListener(
			'change',
			st => st === 'active' && check(),
		)
		return () => sub.remove()
	}, [])

	if (!s) return null
	const quick = s.quickReply ?? defaults.quickReply
	return (
		<ScrollView
			contentContainerStyle={{ padding: 16, paddingBottom: 64, gap: 16 }}
		>
			<TableRowGroup
				title="Permission"
				description="Heads float over other apps, so Discord needs to be allowed to display over them."
			>
				<TableRow
					label="Display over other apps"
					subLabel={
						allowed == null
							? 'Checking...'
							: allowed
								? 'Allowed'
								: 'Not allowed, tap to fix'
					}
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
				{!quick && (
					<TableSwitchRow
						label="Message preview"
						subLabel="Show the last message under each head when they fan out"
						value={s.preview ?? defaults.preview}
						onValueChange={(v: boolean) => api.jsonStorage.set({ preview: v })}
					/>
				)}
			</TableRowGroup>
			<TableRowGroup description="Pops up a fake head so you can try it out. It's gone the next time you open Discord.">
				<TableRow
					label="Show a test head"
					onPress={() => call('mlemheads.test', [])}
				/>
			</TableRowGroup>
		</ScrollView>
	)
}

export default plugin<{ jsonStorage: Options }>({
	jsonStorage: { default: defaults },
	SettingsComponent: Settings,
	start({ cleanup }) {
		AppRegistry.registerComponent('MlemHeadsCard', () => Card)
		const ready = !!(D.mana && D.reanimated && D.tokens && D.intl)
		call('mlemheads.ready', [ready]).catch(() => {})
		cleanup(() => call('mlemheads.ready', [false]).catch(() => {}))
		const EU = (globalThis as any).ErrorUtils
		const orig = EU?.getGlobalHandler?.()
		if (orig) {
			EU.setGlobalHandler((e: unknown, fatal?: boolean) => {
				if (overlay.open && AppState.currentState !== 'active') {
					warn('error while the card was open', e)
					call('mlemheads.collapse', []).catch(() => {})
					return
				}
				orig(e, fatal)
			})
			cleanup(() => EU.setGlobalHandler(orig))
		}
		pushTheme()
		seedStartup()
		const theme = Stores.ThemeStore as any
		const onTheme = () => pushTheme()
		theme?.addChangeListener?.(onTheme)
		cleanup(() => theme?.removeChangeListener?.(onTheme))
		const poll = setInterval(() => {
			pushTheme()
			seedStartup()
		}, 4000)
		cleanup(() => clearInterval(poll))
	},
})
