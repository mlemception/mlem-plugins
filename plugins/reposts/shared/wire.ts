
export const WIRE = 1

export type FileRef = [
	id: string,
	name: string,
	type: string,
	w: number,
	h: number,
]

export interface Entry {
	m: string
	c: string
	g?: string
	a?: string
	p?: 1
	t?: string
	f?: FileRef[]
	s?: string[]
	e?: EmbedRef[]
	at: number
	x?: 1
}

export interface EmbedRef {
	k: string
	u?: string
	ti?: string
	d?: string
	p?: string
	au?: string
	c?: number
	m?: [url: string, w: number, h: number]
	big?: 1
	v?: [url: string, w: number, h: number]
}

export interface IndexBody {
	v: number
	s: number
	t: number
	u: Record<string, [rev: string, count: number]>
	o?: string[]
	min?: number
}

export interface ListBody {
	v: number
	u: string
	r: string
	n: number
	l: Entry[]
}

export interface MeBody {
	v: number
	u: string
	r: string
	n: number
	o: boolean
	token?: string
	exp?: number
}

export type AddOp = { o: 'add' } & Omit<Entry, 'at' | 'x'>
export type Op = AddOp | { o: 'del'; m: string } | { o: 'priv'; m: string }

export interface SyncResult {
	m: string
	ok: boolean
	err?: 'optout' | 'invalid' | 'limit' | 'missing'
}

export interface SyncBody {
	v: number
	r: string
	n: number
	res: SyncResult[]
}

export const LIMITS = {
	text: 4000,
	files: 10,
	stickers: 3,
	name: 120,
	entries: 500,
	ops: 25,
	embeds: 4,
	title: 256,
	desc: 1000,
	url: 2048,
}

const MEDIA_HOSTS =
	/^https:\/\/(images-ext-\d\.discordapp\.net|media\.discordapp\.net|cdn\.discordapp\.com)\//
const LINK = /^https?:\/\/\S+$/

const short = (v: unknown, max: number) =>
	typeof v === 'string' && v.trim() ? v.slice(0, max) : undefined

const dims = (v: unknown) =>
	Number.isInteger(v) && (v as number) > 0 && (v as number) < 100_000
		? (v as number)
		: 0

function media(
	v: unknown,
	hosts: RegExp,
): [string, number, number] | undefined {
	if (!Array.isArray(v) || typeof v[0] !== 'string') return
	if (v[0].length > LIMITS.url || !hosts.test(v[0])) return
	return [v[0], dims(v[1]), dims(v[2])]
}

export function cleanEmbeds(list: unknown): EmbedRef[] | undefined {
	if (!Array.isArray(list)) return
	const out: EmbedRef[] = []
	for (const x of list.slice(0, LIMITS.embeds)) {
		if (!x || typeof x !== 'object') continue
		const e = x as Record<string, unknown>
		const k = short(e.k, 20)
		if (!k || !/^[a-z_]+$/.test(k)) continue
		const r: EmbedRef = { k }
		const u = short(e.u, LIMITS.url)
		if (u && LINK.test(u)) r.u = u
		const ti = short(e.ti, LIMITS.title)
		if (ti) r.ti = ti
		const desc = short(e.d, LIMITS.desc)
		if (desc) r.d = desc
		const prov = short(e.p, LIMITS.title)
		if (prov) r.p = prov
		const au = short(e.au, LIMITS.title)
		if (au) r.au = au
		if (
			Number.isInteger(e.c) &&
			(e.c as number) >= 0 &&
			(e.c as number) <= 0xffffff
		)
			r.c = e.c as number
		const m = media(e.m, MEDIA_HOSTS)
		if (m) r.m = m
		if (m && e.big) r.big = 1
		const v = media(e.v, LINK)
		if (v) r.v = v
		if (r.ti || r.d || r.m || r.au) out.push(r)
	}
	return out.length ? out : undefined
}

const EPOCH = 1420070400000

export const isSnowflake = (s: unknown): s is string =>
	typeof s === 'string' && /^\d{15,20}$/.test(s)

export const snowflakeTime = (id: string) => Number(BigInt(id) >> 22n) + EPOCH

export function hashId(id: string, seed: number) {
	let h1 = 0xdeadbeef ^ seed
	let h2 = 0x41c6ce57 ^ seed
	for (let i = 0; i < id.length; i++) {
		const c = id.charCodeAt(i)
		h1 = Math.imul(h1 ^ c, 2654435761)
		h2 = Math.imul(h2 ^ c, 1597334677)
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
	h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
	h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
	return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

const KEY = 0x5ee9a1c3
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const B64I = new Map([...B64].map((c, i) => [c, i]))

function stream(seed: number) {
	let s = seed >>> 0
	return () => {
		s = (s + 0x6d2b79f5) >>> 0
		let t = s
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) & 255
	}
}

function toB64(b: number[]) {
	let s = ''
	for (let i = 0; i < b.length; i += 3) {
		const n = (b[i]! << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0)
		s += B64[n >> 18]! + B64[(n >> 12) & 63]!
		if (i + 1 < b.length) s += B64[(n >> 6) & 63]
		if (i + 2 < b.length) s += B64[n & 63]
	}
	return s
}

function fromB64(s: string) {
	const out: number[] = []
	for (let i = 0; i < s.length; i += 4) {
		const n =
			(B64I.get(s[i]!)! << 18) |
			((B64I.get(s[i + 1]!) ?? 0) << 12) |
			((B64I.get(s[i + 2] ?? 'A') ?? 0) << 6) |
			(B64I.get(s[i + 3] ?? 'A') ?? 0)
		out.push((n >> 16) & 255)
		if (i + 2 < s.length) out.push((n >> 8) & 255)
		if (i + 3 < s.length) out.push(n & 255)
	}
	return out
}

const ascii = (s: string) =>
	s.replace(
		/[\u007f-￿]/g,
		c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
	)

export function obfuscate(value: unknown, nonce: number) {
	const text = ascii(JSON.stringify(value))
	const ks = stream(nonce ^ KEY)
	const out = [
		nonce >>> 24,
		(nonce >>> 16) & 255,
		(nonce >>> 8) & 255,
		nonce & 255,
	]
	for (let i = 0; i < text.length; i++) out.push(text.charCodeAt(i) ^ ks())
	return `r${WIRE}.${toB64(out)}`
}

export function deobfuscate<T = unknown>(body: string): T {
	const dot = body.indexOf('.')
	if (dot < 0 || body[0] !== 'r') throw new Error('bad body')
	const bytes = fromB64(body.slice(dot + 1))
	const nonce =
		((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0
	const ks = stream(nonce ^ KEY)
	let text = ''
	for (let i = 4; i < bytes.length; i++)
		text += String.fromCharCode(bytes[i]! ^ ks())
	return JSON.parse(text)
}
