import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { api } from './games'
import type { Credit, Game } from './store'

export const HEARTBEAT_MS = 5 * 60_000
export const MAX_GAP = 15 * 60_000
export const DAILY_CAP = 8 * 60 * 60_000
const TOKEN_AGE = 12 * 60 * 60_000
const PER_REQUEST = 100

let token = ''
let tokenAt = 0
let seq = 0
let chain: Promise<unknown> = Promise.resolve()

let props: any
function superProps(): Record<string, any> {
	try {
		if (!props) [props] = lookupModule(withProps<any>('getSuperProperties'))
		return props?.getSuperProperties?.() ?? {}
	} catch {
		return {}
	}
}

const uuid = () =>
	'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
		const r = (Math.random() * 16) | 0
		return (c === 'x' ? r : (r & 3) | 8).toString(16)
	})

function fingerprint(id: string): string {
	try {
		const s = (Stores as any).RunningGameStore
		const seen = [
			...(s?.getRunningGames?.() ?? []),
			...(s?.getGamesSeen?.(true) ?? []),
		]
		return (
			seen.find((g: any) => g.id === id && g.executableFingerprint)
				?.executableFingerprint ?? ''
		)
	} catch {
		return ''
	}
}

async function getToken() {
	if (token && Date.now() - tokenAt < TOKEN_AGE) return token
	const res = await api().HTTP.get({
		url: '/users/@me',
		query: { with_analytics_token: true },
	})
	const t = res?.body?.analytics_token
	if (typeof t !== 'string') throw new Error('No analytics token')
	token = t
	tokenAt = Date.now()
	return t
}

function session() {
	const p = superProps()
	return {
		heartbeat: p.client_heartbeat_session_id ?? uuid(),
		signature: p.launch_signature ?? uuid(),
		locale: p.system_locale ?? 'en-US',
	}
}

function launch(g: Game, at: number) {
	const s = session()
	const fp = fingerprint(g.id)
	const properties: Record<string, any> = {
		client_track_timestamp: at,
		client_heartbeat_session_id: s.heartbeat,
		event_sequence_number: ++seq,
		game: g.name,
		game_id: g.id,
		verified: true,
		elevated: false,
		is_launcher: false,
		game_platform: 'desktop',
		detection_method: 'verified_game',
		is_overlay_enabled: false,
		is_overlay_game_enabled: true,
		is_overlay_game_source: 'OOP_DEFAULT_DATABASE',
		fullscreen_type: 'UNKNOWN',
		hardware_display_count: 1,
		overlay_method: 'Disabled',
		activity_status_enabled: true,
		activity_status_shared_guilds: [],
		current_user_status: 'online',
		game_detection_enabled: true,
		executable_path: g.exe,
		voice_channel_id: null,
		voice_channel_type: null,
		voice_channel_bitrate: null,
		voice_channel_guild_id: null,
		hidden_by_distributor: false,
		game_metadata: null,
		client_performance_cpu: null,
		client_performance_memory: null,
		cpu_core_count: null,
		accessibility_features: 0,
		rendered_locale: s.locale,
		launch_signature: s.signature,
		client_rtc_state: null,
		client_app_state: 'focused',
		client_send_timestamp: at,
	}
	if (fp) properties.executable_fingerprint = fp
	return { type: 'launch_game', properties }
}

function beat(
	g: Game,
	ms: number,
	gameSession: string,
	initial: boolean,
	final: boolean,
	at: number,
) {
	const s = session()
	return {
		type: 'running_game_heartbeat',
		properties: {
			client_track_timestamp: at,
			client_heartbeat_session_id: s.heartbeat,
			event_sequence_number: ++seq,
			game_id: g.id,
			game_name: g.name,
			game_metadata: null,
			game_executable: g.exe,
			game_detection_enabled: true,
			initial_heartbeat: initial,
			final_heartbeat: final,
			game_session_id: gameSession,
			duration_tracked_ms: Math.round(ms),
			rtc_connection_id: null,
			media_session_id: null,
			discord_window_state: 'focused',
			launch_signature: s.signature,
			client_app_state: 'focused',
			client_send_timestamp: at,
		},
	}
}

export const newCredit = (from: number): Credit => ({
	gameSession: uuid(),
	creditedUntil: from,
	launched: false,
	finished: false,
})

async function post(body: any) {
	const h = api()
	const send = h.post && h.post !== h.HTTP.post ? h.post : h.HTTP.post
	const res = await send({ url: '/science', body })
	if (res === undefined) throw new Error('blocked')
}

async function send(g: Game, c: Credit, until: number, final: boolean) {
	if (c.finished) return 0
	if (!c.launched && final && until <= c.creditedUntil) {
		c.finished = true
		return 0
	}
	const end = Math.max(until, c.creditedUntil)
	const events: any[] = []
	let at = c.creditedUntil

	if (!c.launched)
		events.push(launch(g, at), beat(g, 0, c.gameSession, true, false, at))

	while (end - at > HEARTBEAT_MS) {
		at += HEARTBEAT_MS
		events.push(beat(g, HEARTBEAT_MS, c.gameSession, false, false, at))
	}
	if (final || end > at)
		events.push(beat(g, end - at, c.gameSession, false, final, end))

	if (!events.length) return 0
	const t = await getToken()
	for (let i = 0; i < events.length; i += PER_REQUEST)
		await post({ token: t, events: events.slice(i, i + PER_REQUEST) })

	const added = end - c.creditedUntil
	c.launched = true
	c.creditedUntil = end
	c.finished = final
	return added
}

export function report(g: Game, c: Credit, until: number, final = false) {
	const p = chain.then(() => send(g, c, until, final))
	chain = p.catch(() => {})
	return p
}
