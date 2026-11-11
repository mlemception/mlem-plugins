import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { callNativeMethod } from '@valenced/modules/native'
import { instead } from '@valenced/patcher'
import type { PluginApi } from '@valenced/plugins/types'
import { useEffect, useState } from 'react'
import { AppState, ScrollView } from 'react-native'

const defaults = {
	dms: true,
	groups: true,
	quickReply: true,
	preview: false,
	haptics: true,
}
type Options = typeof defaults

const call = callNativeMethod as (name: string, args: unknown[]) => Promise<any>

const KEYS = [
	'BACKGROUND_SURFACE_HIGH',
	'BACKGROUND_SURFACE_HIGHEST',
	'BORDER_SUBTLE',
	'TEXT_STRONG',
	'TEXT_DEFAULT',
	'TEXT_MUTED',
	'MOBILE_CHATINPUT_BACKGROUND_DEFAULT',
	'MOBILE_CHATINPUT_BORDER_DEFAULT',
	'MOBILE_CHATINPUT_BORDER_ACTIVE',
	'INPUT_PLACEHOLDER_TEXT_DEFAULT',
	'INPUT_TEXT_DEFAULT',
	'CHAT_INPUT_SEND_BUTTON_ACTIVE_BACKGROUND',
	'CHAT_INPUT_SEND_BUTTON_ICON_ACTIVE_TINT',
	'BACKGROUND_MOD_SUBTLE',
	'ICON_MUTED',
	'ICON_DEFAULT',
	'TEXT_FEEDBACK_CRITICAL',
	'MOBILE_ANDROID_BUTTON_BACKGROUND_RIPPLE',
	'BACKGROUND_MOD_NORMAL',
]

let lastTheme = ''
function pushTheme() {
	const tokens = lookupModule(withProps('unsafe_rawColors', 'colors'))[0] as any
	const store = Stores.ThemeStore as any
	const theme = store?.theme
	if (!tokens?.internal?.resolveSemanticColor || !theme || store._isInitialized === false) return
	if (theme === lastTheme) return
	lastTheme = theme
	const colors: Record<string, string> = {}
	for (const k of KEYS) {
		const c = tokens.colors[k]
		if (!c) return
		colors[k] = tokens.internal.resolveSemanticColor(theme, c)
	}
	call('mlemheads.theme', [JSON.stringify({ theme, light: theme === 'light', colors })]).catch(() => {})
}

let lastMe = ''
function pushMe() {
	const u = (Stores.UserStore as any)?.getCurrentUser?.()
	if (!u) return
	const name = u.globalName || u.global_name || u.username || ''
	const avatar = u.avatar
		? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128`
		: `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(u.id) >> 22n) % 6n)}.png`
	const key = `${name}|${avatar}`
	if (key === lastMe) return
	lastMe = key
	call('mlemheads.me', [name, avatar]).catch(() => {})
}

function watchSends(cleanup: (...fns: (() => void)[]) => void) {
	const http = lookupModule(withProps('HTTP', 'setRequestPatch'))[0] as any
	if (!http) return
	const told = new Set<string>()
	const hook = (args: any[], orig: (...a: any[]) => any) => {
		const res = orig(...args)
		const req = args[0]
		const url: string | undefined = typeof req === 'string' ? req : req?.url
		const m = url?.match(/\/channels\/(\d+)\/messages$/)
		if (!m || !res?.then) return res
		const body = req?.body ?? {}
		const nonce = body.nonce ? String(body.nonce) : ''
		const report = (ok: boolean) => {
			const id = `${m[1]}|${nonce}|${body.content}`
			if (told.has(id)) return
			told.add(id)
			call('mlemheads.sent', [m[1], String(body.content ?? ''), ok, nonce || null]).catch(() => {})
		}
		res.then(
			(r: any) => report(r?.ok !== false && (r?.status ?? 200) < 300),
			() => report(false),
		)
		return res
	}
	const targets = [http, http.HTTP].filter(Boolean)
	const seen = new Set<any>()
	for (const t of targets) {
		if (typeof t.post !== 'function' || seen.has(t.post)) continue
		seen.add(t.post)
		cleanup(instead(t, 'post', hook as any))
	}
}

const rows: [keyof Options, string, string][] = [
	['dms', 'Direct messages', 'A head for each person who messages you'],
	['groups', 'Group chats and servers', 'Group DMs and server pings you get notified for'],
	['quickReply', 'Quick reply', 'Tap a head to read and reply right there. Hold it to open the chat in Discord'],
	['haptics', 'Haptics', 'Little ticks when you switch chats, send, or snap a head onto the X'],
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
	const quick = s.quickReply ?? defaults.quickReply
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
				<TableRow label="Show a test head" onPress={() => call('mlemheads.test', [])} />
			</TableRowGroup>
		</ScrollView>
	)
}

export default plugin<{ jsonStorage: Options }>({
	jsonStorage: { default: defaults },
	SettingsComponent: Settings,
	start({ cleanup }) {
		pushTheme()
		pushMe()
		const theme = Stores.ThemeStore as any
		const users = Stores.UserStore as any
		const onTheme = () => pushTheme()
		const onUser = () => pushMe()
		theme?.addChangeListener?.(onTheme)
		users?.addChangeListener?.(onUser)
		cleanup(() => theme?.removeChangeListener?.(onTheme))
		cleanup(() => users?.removeChangeListener?.(onUser))
		const poll = setInterval(() => {
			pushTheme()
			pushMe()
		}, 4000)
		cleanup(() => clearInterval(poll))
		watchSends(cleanup)
	},
})
