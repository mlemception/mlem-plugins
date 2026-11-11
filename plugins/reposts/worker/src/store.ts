import {
	cleanEmbeds,
	hashId,
	isSnowflake,
	LIMITS,
	snowflakeTime,
	WIRE,
} from '../../shared/wire'
import { HttpError } from './env'
import type { AddOp, Entry, FileRef, Op, SyncResult } from '../../shared/wire'
import type { Env } from './env'

export interface Doc {
	v: number
	g: number
	l: Entry[]
	w?: [day: number, count: number]
}

export interface Meta {
	r: string
	n: number
	o?: 1
}

export const DAILY_WRITES = 150
const INDEX_TTL = 300
const MEMO_TTL = 60_000

const key = (uid: string) => `u:${uid}`
const today = () => Math.floor(Date.now() / 86_400_000)
const newRev = () => Date.now().toString(36)

export async function loadDoc(env: Env, uid: string, fresh = false) {
	const { value, metadata } = await env.KV.getWithMetadata<Doc, Meta>(
		key(uid),
		fresh ? { type: 'json' } : { type: 'json', cacheTtl: 60 },
	)
	const doc: Doc =
		value && Array.isArray(value.l) ? value : { v: WIRE, g: 0, l: [] }
	const meta: Meta = metadata ?? { r: '0', n: 0 }
	return { doc, meta, exists: !!value }
}

export async function saveDoc(
	env: Env,
	uid: string,
	doc: Doc,
	meta: Partial<Meta> = {},
) {
	const m: Meta = {
		r: newRev(),
		n: doc.l.filter(e => !e.x).length,
		...(meta.o ? { o: 1 } : {}),
	}
	doc.v = WIRE
	await env.KV.put(key(uid), JSON.stringify(doc), { metadata: m })
	memo = undefined
	await caches.default.delete(INDEX_CACHE_URL).catch(() => {})
	return m
}

export function chargeWrite(doc: Doc) {
	const d = today()
	if (!doc.w || doc.w[0] !== d) doc.w = [d, 0]
	if (doc.w[1] >= DAILY_WRITES) throw new HttpError(429, 'daily')
	doc.w[1]++
}

export interface Index {
	t: number
	seed: number
	users: Map<string, Meta>
	optouts: Set<string>
	optoutTag: string
}

let memo: { at: number; idx: Index } | undefined

const INDEX_CACHE_URL = 'https://reposts.internal/index-v1'

export async function getIndex(
	env: Env,
	ctx: ExecutionContext,
): Promise<Index> {
	if (memo && Date.now() - memo.at < MEMO_TTL) return memo.idx
	const seed = Number(env.INDEX_SEED ?? 7) >>> 0
	const cache = caches.default
	const hit = await cache.match(INDEX_CACHE_URL).catch(() => undefined)
	let raw: { t: number; u: [string, Meta][] } | undefined
	if (hit) raw = await hit.json()
	if (!raw) {
		const u: [string, Meta][] = []
		let cursor: string | undefined
		do {
			const page = await env.KV.list<Meta>({ prefix: 'u:', cursor })
			for (const k of page.keys)
				if (k.metadata) u.push([k.name.slice(2), k.metadata])
			cursor = page.list_complete ? undefined : page.cursor
		} while (cursor)
		raw = { t: Date.now(), u }
		ctx.waitUntil(
			cache
				.put(
					INDEX_CACHE_URL,
					new Response(JSON.stringify(raw), {
						headers: { 'cache-control': `max-age=${INDEX_TTL}` },
					}),
				)
				.catch(() => {}),
		)
	}
	const users = new Map(raw.u)
	const optouts = new Set(raw.u.filter(([, m]) => m.o).map(([id]) => id))
	const idx: Index = {
		t: raw.t,
		seed,
		users,
		optouts,
		optoutTag: hashId([...optouts].sort().join(), seed),
	}
	memo = { at: Date.now(), idx }
	return idx
}

export function publicIndex(idx: Index) {
	const u: Record<string, [string, number]> = {}
	for (const [id, m] of idx.users)
		if (m.n > 0) u[hashId(id, idx.seed)] = [m.r, m.n]
	const o = [...idx.optouts].map(id => hashId(id, idx.seed))
	return { v: WIRE, s: idx.seed, t: idx.t, u, o }
}

export function visible(doc: Doc, idx: Index, uid: string, owner: boolean) {
	return doc.l.filter(
		e => owner || (!e.x && !(e.a && e.a !== uid && idx.optouts.has(e.a))),
	)
}

const str = (v: unknown, max: number) =>
	typeof v === 'string' && v.length <= max ? v : undefined

function cleanFile(f: unknown): FileRef | undefined {
	if (!Array.isArray(f) || f.length !== 5) return
	const [id, name, type, w, h] = f
	if (!isSnowflake(id)) return
	const n = str(name, LIMITS.name)
	const t = str(type, 60) ?? ''
	if (!n || /[/\\]/.test(n)) return
	const dim = (x: unknown) =>
		Number.isInteger(x) && (x as number) >= 0 && (x as number) < 100_000
			? (x as number)
			: 0
	return [id, n, t, dim(w), dim(h)]
}

export function cleanAdd(op: AddOp): Omit<Entry, 'at'> | undefined {
	if (!isSnowflake(op.m) || !isSnowflake(op.c)) return
	if (op.g !== undefined && !isSnowflake(op.g)) return
	if (op.a !== undefined && !isSnowflake(op.a)) return
	const sent = snowflakeTime(op.m)
	if (sent > Date.now() + 60_000) return
	if (op.a && snowflakeTime(op.a) > sent) return
	const t = op.t === undefined ? undefined : str(op.t, LIMITS.text)
	if (op.t !== undefined && t === undefined) return
	const f = Array.isArray(op.f)
		? op.f.slice(0, LIMITS.files).map(cleanFile)
		: []
	if (f.some(x => !x)) return
	const s = Array.isArray(op.s) ? op.s.slice(0, LIMITS.stickers) : []
	if (!s.every(isSnowflake)) return
	const em = cleanEmbeds(op.e)
	if (!t && !f.length && !s.length && !em) return
	const e: Omit<Entry, 'at'> = { m: op.m, c: op.c }
	if (op.g) e.g = op.g
	if (op.p) e.p = 1
	else if (op.a) e.a = op.a
	if (t) e.t = t
	if (f.length) e.f = f as FileRef[]
	if (s.length) e.s = s
	if (em) e.e = em
	return e
}

export async function applyOps(
	env: Env,
	ctx: ExecutionContext,
	uid: string,
	doc: Doc,
	ops: Op[],
): Promise<SyncResult[]> {
	const idx = await getIndex(env, ctx)
	const res: SyncResult[] = []
	for (const op of ops) {
		const m = typeof op?.m === 'string' ? op.m : ''
		const at = doc.l.findIndex(e => e.m === m)
		if (op?.o === 'del') {
			if (at >= 0) doc.l.splice(at, 1)
			res.push({ m, ok: true })
		} else if (op?.o === 'priv') {
			const e = doc.l[at]
			if (!e) res.push({ m, ok: false, err: 'missing' })
			else {
				const { a: _, ...rest } = e
				doc.l[at] = { ...rest, p: 1 }
				res.push({ m, ok: true })
			}
		} else if (op?.o === 'add') {
			const e = cleanAdd(op)
			if (!e) {
				res.push({ m, ok: false, err: 'invalid' })
				continue
			}
			if (op.a && op.a !== uid && (await optedOut(env, idx, op.a))) {
				res.push({ m, ok: false, err: 'optout' })
				continue
			}
			if (at >= 0) {
				const old = doc.l[at]!
				doc.l[at] = { ...e, at: old.at, ...(old.x ? { x: 1 as const } : {}) }
			} else {
				if (doc.l.length >= LIMITS.entries) {
					res.push({ m, ok: false, err: 'limit' })
					continue
				}
				doc.l.unshift({ ...e, at: Math.floor(Date.now() / 1000) })
			}
			res.push({ m, ok: true })
		} else res.push({ m, ok: false, err: 'invalid' })
	}
	return res
}

async function optedOut(env: Env, idx: Index, uid: string) {
	if (idx.optouts.has(uid)) return true
	const { metadata } = await env.KV.getWithMetadata<Meta>(key(uid), {
		cacheTtl: 60,
	})
	return !!metadata?.o
}

export async function reportsFor(env: Env, owner: string, m: string) {
	const page = await env.KV.list({ prefix: `rep:${owner}:${m}:`, limit: 10 })
	return page.keys.length
}
