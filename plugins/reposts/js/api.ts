import { deobfuscate, WIRE } from '../shared/wire'
import { API_URL } from './config'
import { me } from './discord'
import { account, bump, live, saveAccount, saved } from './store'

export class ApiError extends Error {
	constructor(
		public status: number,
		public code: string,
	) {
		super(code)
	}
}

export const base = () => (saved.api || API_URL).replace(/\/$/, '')

interface Options {
	method?: string
	body?: unknown
	etag?: string
	auth?: boolean
	timeout?: number
}

export interface Reply<T> {
	status: number
	body?: T
	etag?: string
}

export async function call<T>(
	path: string,
	o: Options = {},
): Promise<Reply<T>> {
	const uid = me()
	const headers: Record<string, string> = { 'x-reposts-wire': String(WIRE) }
	if (o.auth !== false) {
		const token = account(uid).token
		if (!token) throw new ApiError(401, 'auth')
		headers.authorization = `Bearer ${token}`
	}
	if (o.body !== undefined) headers['content-type'] = 'application/json'
	if (o.etag) headers['if-none-match'] = o.etag

	const ctl = new AbortController()
	const timer = setTimeout(() => ctl.abort(), o.timeout ?? 12_000)
	let res: Response
	try {
		res = await fetch(base() + path, {
			method: o.method ?? 'GET',
			headers,
			body: o.body === undefined ? undefined : JSON.stringify(o.body),
			signal: ctl.signal,
		})
	} catch {
		throw new ApiError(0, 'network')
	} finally {
		clearTimeout(timer)
	}

	const etag = res.headers.get('etag') ?? undefined
	if (res.status === 304) return { status: 304, etag }

	const text = await res.text().catch(() => '')
	let body: any
	try {
		body = text.startsWith('r')
			? deobfuscate(text)
			: text
				? JSON.parse(text)
				: undefined
	} catch {
		throw new ApiError(res.status || 0, 'garbled')
	}

	if (!res.ok) {
		const code = typeof body?.error === 'string' ? body.error : 'server'
		if (res.status === 401 && uid && o.auth !== false && account(uid).token)
			saveAccount({ token: undefined, exp: undefined }, uid)
		if (res.status === 426) {
			live.outdated = true
			bump()
		}
		throw new ApiError(res.status, code)
	}
	if (body && typeof body.v === 'number' && body.v > WIRE) {
		live.outdated = true
		bump()
	}
	return { status: res.status, body, etag }
}

export function describe(e: unknown) {
	const err = e instanceof ApiError ? e : new ApiError(0, 'unknown')
	if (err.code === 'network')
		return "Couldn't reach Reposts. Check your connection."
	if (err.status === 429 && err.code === 'daily')
		return "That's a lot of reposting for one day. Try again tomorrow."
	if (err.status === 429) return 'Slow down a little and try again.'
	if (err.status === 401)
		return 'Your Reposts login expired. Connect again in settings.'
	if (err.status === 426) return 'Reposts needs an update.'
	if (err.status >= 500) return 'Reposts is having trouble right now.'
	return 'Something went wrong.'
}
