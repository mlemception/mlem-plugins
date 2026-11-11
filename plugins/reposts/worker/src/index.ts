import { hashId, isSnowflake, LIMITS, obfuscate, WIRE } from '../../shared/wire'
import {
	authorizeUrl,
	identify,
	needsRefresh,
	readSession,
	signSession,
} from './auth'
import { HttpError } from './env'
import {
	applyOps,
	chargeWrite,
	getIndex,
	loadDoc,
	publicIndex,
	reportsFor,
	saveDoc,
	visible,
} from './store'
import type { MeBody, Op, SyncBody } from '../../shared/wire'
import type { Env, Session } from './env'

const REPORTS_TO_HIDE = 3

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
	new Response(JSON.stringify(body), {
		status,
		headers: {
			'content-type': 'application/json',
			'cache-control': 'no-store',
			...headers,
		},
	})

const hidden = (body: unknown, etag?: string) =>
	new Response(
		obfuscate(body, crypto.getRandomValues(new Uint32Array(1))[0]!),
		{
			headers: {
				'content-type': 'application/octet-stream',
				'cache-control': 'private, no-cache',
				...(etag ? { etag } : {}),
			},
		},
	)

async function body<T>(req: Request): Promise<T> {
	if (Number(req.headers.get('content-length') ?? 0) > 64_000)
		throw new HttpError(413, 'too_big')
	const text = await req.text()
	if (text.length > 64_000) throw new HttpError(413, 'too_big')
	try {
		return JSON.parse(text) as T
	} catch {
		throw new HttpError(400, 'invalid')
	}
}

async function limit(rl: RateLimit, key: string) {
	const { success } = await rl.limit({ key })
	if (!success) throw new HttpError(429, 'slow_down')
}

async function writer(env: Env, req: Request) {
	const s = await readSession(env, req)
	await limit(env.RL_WRITE, s.u)
	const loaded = await loadDoc(env, s.u, true)
	if (loaded.doc.g !== s.g) throw new HttpError(401, 'auth')
	return { s, ...loaded }
}

async function me(env: Env, s: Session, fresh = true): Promise<MeBody> {
	const { doc, meta } = await loadDoc(env, s.u, fresh)
	const out: MeBody = { v: WIRE, u: s.u, r: meta.r, n: meta.n, o: !!meta.o }
	if (doc.g !== s.g) throw new HttpError(401, 'auth')
	if (needsRefresh(s)) Object.assign(out, await signSession(env, s.u, doc.g))
	return out
}

async function login(env: Env, code: string) {
	const uid = await identify(env, code)
	const { doc, meta } = await loadDoc(env, uid, true)
	const session = await signSession(env, uid, doc.g)
	return {
		v: WIRE,
		u: uid,
		...session,
		me: { r: meta.r, n: meta.n, o: !!meta.o },
	}
}

const page = (title: string, text: string) =>
	new Response(
		`<!doctype html><meta name=viewport content="width=device-width"><title>${title}</title><body style="font:16px system-ui;background:#1a1a1e;color:#ddd;display:grid;place-items:center;height:90vh;text-align:center"><div><h2>${title}</h2><p>${text}</p></div>`,
		{ headers: { 'content-type': 'text/html; charset=utf-8' } },
	)

async function route(
	req: Request,
	env: Env,
	ctx: ExecutionContext,
): Promise<Response> {
	const url = new URL(req.url)
	const path = url.pathname.replace(/\/+$/, '')
	const ver = Number(req.headers.get('x-reposts-wire') ?? WIRE)
	if (path.startsWith('/v1/') && ver > WIRE)
		throw new HttpError(426, 'update_worker')
	const ip = req.headers.get('cf-connecting-ip') ?? 'x'

	switch (`${req.method} ${path}`) {
		case 'GET /v1/health':
			return json({ v: WIRE, ok: true })

		case 'POST /v1/auth': {
			await limit(env.RL_AUTH, ip)
			const { code } = await body<{ code: string }>(req)
			return json(await login(env, code))
		}

		case 'GET /v1/auth/start': {
			const state = url.searchParams.get('state') ?? ''
			if (!/^[\w-]{24,64}$/.test(state)) throw new HttpError(400, 'invalid')
			return Response.redirect(authorizeUrl(env, state), 302)
		}

		case 'GET /v1/auth/callback': {
			await limit(env.RL_AUTH, ip)
			const state = url.searchParams.get('state') ?? ''
			const code = url.searchParams.get('code') ?? ''
			if (!/^[\w-]{24,64}$/.test(state) || !code)
				return page(
					'Not connected',
					'Something went wrong. Go back to Discord and try again.',
				)
			try {
				const out = await login(env, code)
				await env.KV.put(`pend:${state}`, JSON.stringify(out), {
					expirationTtl: 300,
				})
				return page('Connected', 'You can go back to Discord now.')
			} catch {
				return page(
					'Not connected',
					'Discord did not accept that login. Try again from the plugin.',
				)
			}
		}

		case 'POST /v1/auth/poll': {
			await limit(env.RL_READ, `poll:${ip}`)
			const { state } = await body<{ state: string }>(req)
			if (!/^[\w-]{24,64}$/.test(state ?? ''))
				throw new HttpError(400, 'invalid')
			const got = await env.KV.get(`pend:${state}`)
			if (!got) return json({ v: WIRE, pending: true })
			ctx.waitUntil(env.KV.delete(`pend:${state}`))
			return json(JSON.parse(got))
		}

		case 'GET /v1/me': {
			const s = await readSession(env, req)
			await limit(env.RL_READ, s.u)
			return json(await me(env, s))
		}

		case 'PUT /v1/me': {
			const { s, doc, meta } = await writer(env, req)
			const { o } = await body<{ o: boolean }>(req)
			if (typeof o !== 'boolean') throw new HttpError(400, 'invalid')
			chargeWrite(doc)
			const m = await saveDoc(env, s.u, doc, { o: o ? 1 : undefined })
			return json({ v: WIRE, u: s.u, r: m.r, n: m.n, o, was: !!meta.o })
		}

		case 'DELETE /v1/me': {
			const { s, doc } = await writer(env, req)
			await saveDoc(env, s.u, { v: WIRE, g: doc.g + 1, l: [] })
			return json({ v: WIRE, ok: true })
		}

		case 'POST /v1/logout': {
			const { s, doc, meta } = await writer(env, req)
			doc.g++
			await saveDoc(env, s.u, doc, { o: meta.o })
			return json({ v: WIRE, ok: true })
		}

		case 'POST /v1/me/sync': {
			const { s, doc, meta } = await writer(env, req)
			const { ops } = await body<{ ops: Op[] }>(req)
			if (!Array.isArray(ops) || !ops.length || ops.length > LIMITS.ops)
				throw new HttpError(400, 'invalid')
			chargeWrite(doc)
			const res = await applyOps(env, ctx, s.u, doc, ops)
			const m = await saveDoc(env, s.u, doc, { o: meta.o })
			const out: SyncBody = { v: WIRE, r: m.r, n: m.n, res }
			return json(out)
		}

		case 'GET /v1/index': {
			const s = await readSession(env, req)
			await limit(env.RL_READ, s.u)
			const idx = await getIndex(env, ctx)
			const etag = `"${idx.t.toString(36)}"`
			if (req.headers.get('if-none-match') === etag)
				return new Response(null, { status: 304, headers: { etag } })
			return hidden(publicIndex(idx), etag)
		}

		case 'POST /v1/report': {
			const s = await readSession(env, req)
			await limit(env.RL_WRITE, s.u)
			const { u, m, why } = await body<{ u: string; m: string; why?: string }>(
				req,
			)
			if (!isSnowflake(u) || !isSnowflake(m) || u === s.u)
				throw new HttpError(400, 'invalid')
			const reason = typeof why === 'string' ? why.slice(0, 40) : 'other'
			await env.KV.put(`rep:${u}:${m}:${s.u}`, '', {
				metadata: { why: reason, at: Date.now() },
				expirationTtl: 90 * 86_400,
			})
			if ((await reportsFor(env, u, m)) >= REPORTS_TO_HIDE) {
				const { doc, meta } = await loadDoc(env, u, true)
				const e = doc.l.find(x => x.m === m)
				if (e && !e.x) {
					e.x = 1
					await saveDoc(env, u, doc, { o: meta.o })
				}
			}
			return json({ v: WIRE, ok: true })
		}

		case 'POST /v1/remove': {
			const s = await readSession(env, req)
			await limit(env.RL_WRITE, s.u)
			const { u, m } = await body<{ u: string; m: string }>(req)
			if (!isSnowflake(u) || !isSnowflake(m))
				throw new HttpError(400, 'invalid')
			const { doc, meta } = await loadDoc(env, u, true)
			const at = doc.l.findIndex(x => x.m === m)
			if (at < 0) return json({ v: WIRE, ok: true })
			if (doc.l[at]!.a !== s.u) throw new HttpError(403, 'not_yours')
			doc.l.splice(at, 1)
			await saveDoc(env, u, doc, { o: meta.o })
			return json({ v: WIRE, ok: true })
		}
	}

	const user = path.match(/^\/v1\/u\/(\d{15,20})$/)
	if (user && req.method === 'GET') {
		const s = await readSession(env, req)
		await limit(env.RL_READ, s.u)
		const uid = user[1]!
		const own = uid === s.u
		const [{ doc, meta }, idx] = await Promise.all([
			loadDoc(env, uid, own),
			getIndex(env, ctx),
		])
		const l = visible(doc, idx, uid, own)
		const etag = `"${hashId(`${meta.r}.${idx.optoutTag}.${own ? 1 : 0}`, idx.seed)}"`
		if (req.headers.get('if-none-match') === etag)
			return new Response(null, { status: 304, headers: { etag } })
		return hidden({ v: WIRE, u: uid, r: meta.r, n: l.length, l }, etag)
	}

	throw new HttpError(404, 'not_found')
}

export default {
	async fetch(req, env, ctx) {
		try {
			return await route(req, env, ctx)
		} catch (e) {
			if (e instanceof HttpError)
				return json({ v: WIRE, error: e.code }, e.status)
			console.error(e)
			return json({ v: WIRE, error: 'server' }, 500)
		}
	},
} satisfies ExportedHandler<Env>
