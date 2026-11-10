import { Tokens } from '@valenced/discord/common/tokens'
import { Stores } from '@valenced/discord/flux'

export interface Options {
	latency: number
	detectDiscordKotlin: boolean
	showMillis: boolean
	ignoreSelf: boolean
}

export const defaults: Options = {
	latency: 2,
	detectDiscordKotlin: true,
	showMillis: false,
	ignoreSelf: false,
}

type FillValue =
	| 'STATUS_DANGER'
	| 'STATUS_WARNING'
	| 'STATUS_POSITIVE'
	| 'TEXT_MUTED'
export type Fill = [FillValue, FillValue, FillValue]

interface Diff {
	days: number
	hours: number
	minutes: number
	seconds: number
	milliseconds: number
}

const DISCORD_KT_DELAY = 1471228928
const EPOCH = 1420070400000

const timestamp = (id: string) => Math.floor(Number(id) / 4194304) + EPOCH
const isSnowflake = (s: unknown): s is string =>
	typeof s === 'string' && /^\d{15,20}$/.test(s)

export function stringDelta(delta: number, showMillis: boolean) {
	const diff: Diff = {
		days: Math.floor(delta / (60 * 60 * 24 * 1000)),
		hours: Math.floor((delta / (60 * 60 * 1000)) % 24),
		minutes: Math.floor((delta / (60 * 1000)) % 60),
		seconds: Math.floor((delta / 1000) % 60),
		milliseconds: Math.floor(delta % 1000),
	}

	const str = (k: keyof Diff) =>
		diff[k] > 0
			? `${diff[k]} ${diff[k] > 1 ? k : k.substring(0, k.length - 1)}`
			: null

	const ts = (Object.keys(diff) as (keyof Diff)[]).reduce((prev, k) => {
		const s = str(k)
		if (s == null) return prev
		const join =
			prev !== ''
				? (showMillis ? k === 'milliseconds' : k === 'seconds')
					? ' and '
					: ' '
				: ''
		return prev + join + s
	}, '')

	return ts || '0 seconds'
}

export function latencyData(message: any, s: Options) {
	const { id, nonce } = message
	if (!isSnowflake(id) || !isSnowflake(nonce)) return null
	if (message.state && message.state !== 'SENT') return null

	const users = (Stores as any).UserStore
	if (users?.getUser(message.authorId)?.bot) return null
	if (s.ignoreSelf && message.authorId === users?.getCurrentUser()?.id)
		return null

	let isDiscordKotlin = false
	let delta = timestamp(id) - timestamp(nonce)

	if (-delta >= DISCORD_KT_DELAY - 86400000) {
		isDiscordKotlin = s.detectDiscordKotlin
		delta += DISCORD_KT_DELAY
	}
	if (!s.showMillis) delta = Math.round(delta / 1000) * 1000

	const abs = Math.abs(delta)
	const ahead = abs !== delta
	const latencyMillis = s.latency * 1000

	const text = abs >= latencyMillis ? stringDelta(abs, s.showMillis) : null

	const TROLL_LIMIT = 2 * 60 * 1000

	const fill: Fill = isDiscordKotlin
		? ['STATUS_POSITIVE', 'STATUS_POSITIVE', 'TEXT_MUTED']
		: delta >= TROLL_LIMIT || ahead
			? ['TEXT_MUTED', 'TEXT_MUTED', 'TEXT_MUTED']
			: delta >= latencyMillis * 2
				? ['STATUS_DANGER', 'TEXT_MUTED', 'TEXT_MUTED']
				: ['STATUS_WARNING', 'STATUS_WARNING', 'TEXT_MUTED']

	return abs >= latencyMillis || isDiscordKotlin
		? { delta: text, ahead, fill, isDiscordKotlin }
		: null
}

export function tooltip(d: NonNullable<ReturnType<typeof latencyData>>) {
	if (!d.delta)
		return 'User is suspected to be on an old Discord Android client'
	return (
		(d.ahead
			? `This user's clock is ${d.delta} ahead.`
			: `This message was sent with a delay of ${d.delta}.`) +
		(d.isDiscordKotlin
			? ' User is suspected to be on an old Discord Android client.'
			: '')
	)
}

const tokens = () => (Tokens as any).default ?? Tokens

export function colorsFor(fill: Fill): [string, string, string] {
	const t = (Stores as any).ThemeStore?.theme ?? 'dark'
	const tk = tokens()
	return fill.map(f => tk.internal.resolveSemanticColor(t, tk.colors[f])) as [
		string,
		string,
		string,
	]
}
