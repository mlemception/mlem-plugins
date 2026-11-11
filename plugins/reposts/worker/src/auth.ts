import { isSnowflake } from '../../shared/wire'
import { HttpError } from './env'
import type { Env, Session } from './env'

const DAY = 86_400_000
export const SESSION_TTL = 60 * DAY
const REFRESH_WHEN = 14 * DAY
const DISCORD = 'https://discord.com/api/v10'

const enc = new TextEncoder()

const b64url = (buf: ArrayBuffer | Uint8Array) =>
	btoa(String.fromCharCode(...new Uint8Array(buf)))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '')

const unb64url = (s: string) =>
	Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c =>
		c.charCodeAt(0),
	)

let keyCache: { raw: string; key: CryptoKey } | undefined

async function hmacKey(env: Env) {
	if (keyCache?.raw === env.SESSION_KEY) return keyCache.key
	if (!env.SESSION_KEY || env.SESSION_KEY.length < 32)
		throw new HttpError(500, 'misconfigured')
	const key = await crypto.subtle.importKey(
		'raw',
		enc.encode(env.SESSION_KEY),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign', 'verify'],
	)
	keyCache = { raw: env.SESSION_KEY, key }
	return key
}

export async function signSession(env: Env, uid: string, gen: number) {
	const s: Session = { u: uid, g: gen, e: Date.now() + SESSION_TTL }
	const body = b64url(enc.encode(JSON.stringify(s)))
	const sig = await crypto.subtle.sign(
		'HMAC',
		await hmacKey(env),
		enc.encode(body),
	)
	return { token: `${body}.${b64url(sig)}`, exp: s.e }
}

export async function readSession(env: Env, req: Request): Promise<Session> {
	const h = req.headers.get('authorization') ?? ''
	const token = h.startsWith('Bearer ') ? h.slice(7) : ''
	const [body, sig] = token.split('.')
	if (!body || !sig) throw new HttpError(401, 'auth')
	let ok = false
	try {
		ok = await crypto.subtle.verify(
			'HMAC',
			await hmacKey(env),
			unb64url(sig),
			enc.encode(body),
		)
	} catch {}
	if (!ok) throw new HttpError(401, 'auth')
	let s: Session
	try {
		s = JSON.parse(new TextDecoder().decode(unb64url(body)))
	} catch {
		throw new HttpError(401, 'auth')
	}
	if (!isSnowflake(s.u) || typeof s.g !== 'number' || !(s.e > Date.now()))
		throw new HttpError(401, 'auth')
	return s
}

export const needsRefresh = (s: Session) => s.e - Date.now() < REFRESH_WHEN

const form = (o: Record<string, string>) => new URLSearchParams(o).toString()

function basic(env: Env) {
	return `Basic ${btoa(`${env.DISCORD_CLIENT_ID}:${env.DISCORD_CLIENT_SECRET}`)}`
}

export const callbackUrl = (env: Env) =>
	`${env.PUBLIC_URL.replace(/\/$/, '')}/v1/auth/callback`

export async function identify(env: Env, code: string): Promise<string> {
	if (env.DEV_LOGIN === 'yes' && /^dev:\d{15,20}$/.test(code))
		return code.slice(4)
	if (typeof code !== 'string' || !/^[\w-]{10,100}$/.test(code))
		throw new HttpError(400, 'invalid')
	const tok = await fetch(`${DISCORD}/oauth2/token`, {
		method: 'POST',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			authorization: basic(env),
		},
		body: form({
			grant_type: 'authorization_code',
			code,
			redirect_uri: callbackUrl(env),
		}),
	})
	if (!tok.ok) throw new HttpError(400, 'code')
	const { access_token } = (await tok.json()) as { access_token?: string }
	if (!access_token) throw new HttpError(400, 'code')
	try {
		const me = await fetch(`${DISCORD}/users/@me`, {
			headers: { authorization: `Bearer ${access_token}` },
		})
		if (!me.ok) throw new HttpError(502, 'discord')
		const { id } = (await me.json()) as { id?: string }
		if (!isSnowflake(id)) throw new HttpError(502, 'discord')
		return id
	} finally {
		await fetch(`${DISCORD}/oauth2/token/revoke`, {
			method: 'POST',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				authorization: basic(env),
			},
			body: form({ token: access_token, token_type_hint: 'access_token' }),
		}).catch(() => {})
	}
}

export function authorizeUrl(env: Env, state: string) {
	const q = new URLSearchParams({
		response_type: 'code',
		client_id: env.DISCORD_CLIENT_ID,
		scope: 'identify',
		redirect_uri: callbackUrl(env),
		state,
		prompt: 'none',
	})
	return `https://discord.com/oauth2/authorize?${q}`
}
