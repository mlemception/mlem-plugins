import { Tokens } from '@valenced/discord/common/tokens'
import { Stores } from '@valenced/discord/flux'

export interface Options {
	latency: number
	millis: boolean
	ignoreSelf: boolean
	kotlin: boolean
}

export const defaults: Options = {
	latency: 2,
	millis: false,
	ignoreSelf: false,
	kotlin: true,
}

const EPOCH = 1420070400000
const KT_DELAY = 1471228928
const DAY = 86400000
const TROLL = 2 * 60 * 1000

const stamp = (id: string) => Math.floor(Number(id) / 4194304) + EPOCH
const isSnowflake = (s: unknown): s is string =>
	typeof s === 'string' && /^\d{15,20}$/.test(s)

const units: [string, number][] = [
	['d', DAY],
	['h', 3600000],
	['m', 60000],
	['s', 1000],
]

export function short(ms: number, millis: boolean) {
	const out: string[] = []
	let left = ms
	for (const [name, size] of units) {
		const n = Math.floor(left / size)
		left -= n * size
		if (n) out.push(n + name)
	}
	if (millis && left) out.push(`${left}ms`)
	return out.slice(0, 2).join(' ') || (millis ? '0ms' : '0s')
}

const tokens = () => (Tokens as any).default ?? Tokens
const theme = (): string => (Stores as any).ThemeStore?.theme ?? 'dark'

const colorCache = new Map<string, number>()

function color(name: string) {
	const t = theme()
	const key = `${t}:${name}`
	let c = colorCache.get(key)
	if (c === undefined) {
		const tk = tokens()
		const hex: string = tk.internal.resolveSemanticColor(t, tk.colors[name])
		c = 0xff000000 | Number.parseInt(hex.slice(1, 7), 16) | 0
		colorCache.set(key, c)
	}
	return c
}

export function check(m: any, s: Options) {
	if (!isSnowflake(m?.id) || !isSnowflake(m.nonce)) return
	if (m.state && m.state !== 'SENT') return

	const stores = Stores as any
	if (stores.UserStore?.getUser(m.authorId)?.bot) return
	if (s.ignoreSelf && m.authorId === stores.UserStore?.getCurrentUser()?.id)
		return

	let delta = stamp(m.id) - stamp(m.nonce)

	let kotlin = false
	if (-delta >= KT_DELAY - DAY) {
		kotlin = s.kotlin
		delta += KT_DELAY
	}
	if (!s.millis) delta = Math.round(delta / 1000) * 1000

	const abs = Math.abs(delta)
	const ahead = abs !== delta
	const limit = s.latency * 1000
	const late = abs >= limit
	if (!late && !kotlin) return

	const parts: string[] = []
	if (late) {
		const d = short(abs, s.millis)
		parts.push(ahead ? `clock ${d} ahead` : `${d} late`)
	}
	if (kotlin) parts.push('old android')

	const text = parts.join(', ')
	m.edited = m.edited ? `${m.edited} · ${text}` : text

	if (kotlin) m.editedColor = color('STATUS_POSITIVE')
	else if (ahead || delta >= TROLL) return
	else
		m.editedColor = color(
			delta >= limit * 2 ? 'STATUS_DANGER' : 'STATUS_WARNING',
		)
}
