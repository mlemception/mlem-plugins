import { beforeAll, describe, expect, test } from 'bun:test'
import { deobfuscate, hashId, WIRE } from '../../shared/wire'
import type { IndexBody, ListBody, SyncBody } from '../../shared/wire'

const BASE = process.env.REPOSTS_URL ?? 'http://localhost:8799'
const EPOCH = 1420070400000n
const flake = (msAgo = 0, salt = 0) =>
	(((BigInt(Date.now() - msAgo) - EPOCH) << 22n) + BigInt(salt)).toString()

const run = Math.floor(Math.random() * 4000)
const A = flake(9e10, run)
const B = flake(8e10, run)
const C = flake(7e10, run)
const D = flake(6e10, run)
const tokens: Record<string, string> = {}

async function call(path: string, init: RequestInit & { as?: string } = {}) {
	const headers = new Headers(init.headers)
	if (init.as) headers.set('authorization', `Bearer ${tokens[init.as]}`)
	if (init.body) headers.set('content-type', 'application/json')
	return fetch(BASE + path, { ...init, headers })
}

const post = (path: string, as: string, body: unknown, method = 'POST') =>
	call(path, { method, as, body: JSON.stringify(body) })

async function list(owner: string, as: string) {
	const r = await call(`/v1/u/${owner}`, { as })
	expect(r.status).toBe(200)
	return deobfuscate<ListBody>(await r.text())
}

async function login(uid: string) {
	const r = await post('/v1/auth', '', { code: `dev:${uid}` })
	expect(r.status).toBe(200)
	const j: any = await r.json()
	expect(j.u).toBe(uid)
	tokens[uid] = j.token
}

const msgB = flake(5000, 1)
const msgC = flake(4000, 2)
const msgB2 = flake(3000, 3)

beforeAll(async () => {
	for (const u of [A, B, C, D]) await login(u)
})

describe('auth', () => {
	test('health', async () => {
		const r = await call('/v1/health')
		expect(await r.json()).toEqual({ v: WIRE, ok: true })
	})
	test('reads need a session', async () => {
		expect((await call('/v1/index')).status).toBe(401)
		expect((await call(`/v1/u/${A}`)).status).toBe(401)
	})
	test('tampered token is rejected', async () => {
		const [body, sig] = tokens[A]!.split('.')
		const forged = JSON.parse(atob(body!.replace(/-/g, '+').replace(/_/g, '/')))
		forged.u = B
		const fake = `${btoa(JSON.stringify(forged)).replace(/=+$/, '')}.${sig}`
		const r = await fetch(`${BASE}/v1/me`, {
			headers: { authorization: `Bearer ${fake}` },
		})
		expect(r.status).toBe(401)
	})
	test('newer wire version is refused', async () => {
		const r = await call('/v1/health', { headers: { 'x-reposts-wire': '99' } })
		expect(r.status).toBe(426)
	})
})

describe('reposts', () => {
	test('public and private reposts', async () => {
		const r = await post('/v1/me/sync', A, {
			ops: [
				{ o: 'add', m: msgB, c: flake(9e9, 5), a: B, t: 'hello **world**' },
				{
					o: 'add',
					m: msgC,
					c: flake(9e9, 6),
					a: C,
					p: 1,
					t: 'secret',
					f: [[flake(4000, 9), 'cat.png', 'image/png', 640, 480]],
				},
			],
		})
		expect(r.status).toBe(200)
		const s = (await r.json()) as SyncBody
		expect(s.res.every(x => x.ok)).toBe(true)
		expect(s.n).toBe(2)

		const l = await list(A, D)
		expect(l.l.map(e => e.m)).toEqual([msgC, msgB])
		const priv = l.l.find(e => e.m === msgC)!
		expect(priv.p).toBe(1)
		expect(priv.a).toBeUndefined()
		expect(JSON.stringify(l)).not.toContain(C)
		expect(l.l.find(e => e.m === msgB)!.a).toBe(B)
	})

	test('embeds are kept, unsafe parts dropped', async () => {
		const m = flake(1200, 13)
		const proxied =
			'https://images-ext-1.discordapp.net/external/abc/https/x.com/a.png'
		const r = await post('/v1/me/sync', A, {
			ops: [
				{
					o: 'add',
					m,
					c: flake(9e9, 5),
					t: 'https://x.com/a',
					e: [
						{
							k: 'rich',
							u: 'https://x.com/a',
							ti: 'A title',
							d: 'desc',
							c: 0x5865f2,
							m: [proxied, 400, 300],
						},
						{ k: 'image', m: ['https://evil.example/track.png', 1, 1] },
						{ k: 'link', u: 'javascript:alert(1)', ti: 'bad link' },
						{ k: 'Bad Type', ti: 'x' },
					],
				},
			],
		})
		expect(((await r.json()) as SyncBody).res[0]!.ok).toBe(true)
		const e = (await list(A, D)).l.find(x => x.m === m)!.e!
		expect(e).toHaveLength(2)
		expect(e[0]).toEqual({
			k: 'rich',
			u: 'https://x.com/a',
			ti: 'A title',
			d: 'desc',
			c: 0x5865f2,
			m: [proxied, 400, 300],
		})
		expect(e[1]).toEqual({ k: 'link', ti: 'bad link' })
		await post('/v1/me/sync', A, { ops: [{ o: 'del', m }] })
	})

	test('an embed alone is enough for a repost', async () => {
		const m = flake(1100, 14)
		const r = await post('/v1/me/sync', A, {
			ops: [
				{
					o: 'add',
					m,
					c: flake(9e9, 5),
					e: [
						{
							k: 'video',
							u: 'https://files.catbox.moe/x.mp4',
							v: ['https://files.catbox.moe/x.mp4', 1920, 1080],
							m: [
								'https://images-ext-1.discordapp.net/external/x/https/files.catbox.moe/x.mp4?format=webp',
								1920,
								1080,
							],
							big: 1,
						},
					],
				},
			],
		})
		expect(((await r.json()) as SyncBody).res[0]!.ok).toBe(true)
		await post('/v1/me/sync', A, { ops: [{ o: 'del', m }] })
	})

	test('unicode survives the codec', async () => {
		const t = 'héllo 👋 世界   "quotes"  back'
		const m = flake(1500, 11)
		await post('/v1/me/sync', A, {
			ops: [{ o: 'add', m, c: flake(9e9, 5), t }],
		})
		expect((await list(A, D)).l.find(e => e.m === m)?.t).toBe(t)
		await post('/v1/me/sync', A, { ops: [{ o: 'del', m }] })
	})

	test('browser login fallback', async () => {
		const state = `${'x'.repeat(10) + run}abcdefghijklmnopqrst`
		let r = await post('/v1/auth/poll', '', { state })
		expect(((await r.json()) as any).pending).toBe(true)
		r = await fetch(`${BASE}/v1/auth/callback?state=${state}&code=dev:${D}`)
		expect(await r.text()).toContain('Connected')
		r = await post('/v1/auth/poll', '', { state })
		const j: any = await r.json()
		expect(j.u).toBe(D)
		expect(typeof j.token).toBe('string')
	})

	test('index lists A by hash only', async () => {
		const r = await call('/v1/index', { as: D })
		const text = await r.text()
		expect(text).not.toContain(A)
		const idx = deobfuscate<IndexBody>(text)
		expect(idx.u[hashId(A, idx.s)]?.[1]).toBe(2)
		expect(idx.u[hashId(D, idx.s)]).toBeUndefined()
		const again = await call('/v1/index', {
			as: D,
			headers: { 'if-none-match': r.headers.get('etag')! },
		})
		expect(again.status).toBe(304)
	})

	test('etag on lists', async () => {
		const r = await call(`/v1/u/${A}`, { as: D })
		const again = await call(`/v1/u/${A}`, {
			as: D,
			headers: { 'if-none-match': r.headers.get('etag')! },
		})
		expect(again.status).toBe(304)
	})

	test('bad input is rejected per op', async () => {
		const r = await post('/v1/me/sync', A, {
			ops: [
				{ o: 'add', m: flake(-9e9), c: flake(), t: 'from the future' },
				{ o: 'add', m: flake(1000), c: flake(), t: 'x'.repeat(5000) },
				{ o: 'add', m: flake(1000), c: flake() },
				{
					o: 'add',
					m: flake(1000),
					c: flake(),
					a: flake(-1e6),
					t: 'author newer than message',
				},
				{
					o: 'add',
					m: flake(1000),
					c: flake(),
					t: 'x',
					f: [['1', '../x', '', 0, 0]],
				},
				{ o: 'nope', m: '1' },
			],
		})
		const s = (await r.json()) as SyncBody
		expect(s.res.map(x => x.err)).toEqual(Array(6).fill('invalid'))
		expect(s.n).toBe(2)
	})

	test('too many ops in one batch', async () => {
		const ops = Array.from({ length: 30 }, (_, i) => ({
			o: 'del',
			m: flake(0, i),
		}))
		expect((await post('/v1/me/sync', A, { ops })).status).toBe(400)
	})

	test('make private strips the author', async () => {
		await post('/v1/me/sync', A, { ops: [{ o: 'priv', m: msgB }] })
		const e = (await list(A, D)).l.find(x => x.m === msgB)!
		expect(e.a).toBeUndefined()
		expect(e.p).toBe(1)
		await post('/v1/me/sync', A, {
			ops: [
				{ o: 'add', m: msgB, c: flake(9e9, 5), a: B, t: 'hello **world**' },
			],
		})
		expect((await list(A, D)).l.find(x => x.m === msgB)!.a).toBe(B)
	})
})

describe('respect', () => {
	test('opt out blocks new reposts, private ones too', async () => {
		expect((await post('/v1/me', B, { o: true }, 'PUT')).status).toBe(200)
		const r = await post('/v1/me/sync', C, {
			ops: [
				{ o: 'add', m: msgB2, c: flake(9e9, 7), a: B, t: 'nope' },
				{ o: 'add', m: msgB2, c: flake(9e9, 7), a: B, p: 1, t: 'nope' },
			],
		})
		const s = (await r.json()) as SyncBody
		expect(s.res.map(x => x.err)).toEqual(['optout', 'optout'])
		const idx = deobfuscate<IndexBody>(
			await (await call('/v1/index', { as: D })).text(),
		)
		expect(idx.o).toContain(hashId(B, idx.s))
	})

	test('opting out does not hide your own reposts of yourself', async () => {
		const m = flake(2500, 12)
		const r = await post('/v1/me/sync', B, {
			ops: [{ o: 'add', m, c: flake(9e9, 9), a: B, t: 'my own words' }],
		})
		expect(((await r.json()) as SyncBody).res[0]!.ok).toBe(true)
		expect((await list(B, D)).l.some(e => e.m === m)).toBe(true)
	})

	test('existing reposts of an opted out author are hidden from others', async () => {
		expect((await list(A, D)).l.some(e => e.a === B)).toBe(false)
		expect((await list(A, A)).l.some(e => e.a === B)).toBe(true)
		await post('/v1/me', B, { o: false }, 'PUT')
		expect((await list(A, D)).l.some(e => e.a === B)).toBe(true)
	})

	test('author can take down a public repost of their message', async () => {
		expect((await post('/v1/remove', D, { u: A, m: msgB })).status).toBe(403)
		expect((await post('/v1/remove', B, { u: A, m: msgB })).status).toBe(200)
		expect((await list(A, D)).l.some(e => e.m === msgB)).toBe(false)
	})

	test('three reports hide a repost from everyone but the owner', async () => {
		for (const who of [B, C])
			await post('/v1/report', who, { u: A, m: msgC, why: 'spam' })
		expect((await list(A, D)).l.some(e => e.m === msgC)).toBe(true)
		await post('/v1/report', D, { u: A, m: msgC, why: 'spam' })
		expect((await list(A, D)).l.some(e => e.m === msgC)).toBe(false)
		const own = (await list(A, A)).l.find(e => e.m === msgC)
		expect(own?.x).toBe(1)
	})

	test('cannot report yourself', async () => {
		expect((await post('/v1/report', A, { u: A, m: msgC })).status).toBe(400)
	})
})

describe('account', () => {
	test('logout revokes writes for old sessions', async () => {
		const old = tokens[C]!
		expect((await post('/v1/logout', C, {})).status).toBe(200)
		tokens.old = old
		const r = await post('/v1/me/sync', 'old', { ops: [{ o: 'del', m: msgB }] })
		expect(r.status).toBe(401)
		await login(C)
		expect((await call('/v1/me', { as: C })).status).toBe(200)
	})

	test('delete everything', async () => {
		await post('/v1/me/sync', D, {
			ops: [{ o: 'add', m: flake(2000, 4), c: flake(9e9, 8), t: 'bye' }],
		})
		expect((await list(D, D)).n).toBe(1)
		const old = tokens[D]!
		expect((await call('/v1/me', { method: 'DELETE', as: D })).status).toBe(200)
		tokens.old = old
		expect((await call('/v1/me', { as: 'old' })).status).toBe(401)
		await login(D)
		expect((await list(D, D)).n).toBe(0)
	})

	test('write rate limit kicks in', async () => {
		let limited = false
		for (let i = 0; i < 30 && !limited; i++) {
			const r = await post('/v1/me/sync', C, {
				ops: [{ o: 'del', m: flake(0, i) }],
			})
			limited = r.status === 429
		}
		expect(limited).toBe(true)
	})
})
