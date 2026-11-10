import { transforms } from './local'
import { options } from './store'
import type { Style } from './styles'

const SITE = 'https://anythingtranslate.com'
const UA =
	'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36'

export class Oops extends Error {}

let nonce: { v: string; at: number } | undefined
let nonceLoad: Promise<string> | undefined

async function getNonce(fresh = false) {
	if (!fresh && nonce && Date.now() - nonce.at < 6 * 3600e3) return nonce.v
	if (!fresh && nonceLoad) return nonceLoad
	nonceLoad = (async () => {
		const res = await fetch(`${SITE}/translators/pirate-translator/`, {
			headers: { 'User-Agent': UA },
		})
		const html = await res.text()
		const m =
			html.match(/name="translator_nonce"\s+value="([a-f0-9]+)"/) ??
			html.match(/"translator_nonce"\s*:\s*"([a-f0-9]+)"/)
		if (!m) throw new Oops("Couldn't reach AnythingTranslate")
		nonce = { v: m[1], at: Date.now() }
		return m[1]
	})()
	try {
		return await nonceLoad
	} finally {
		nonceLoad = undefined
	}
}

function why(data: any): string {
	const m =
		typeof data === 'string'
			? data
			: (data?.message ?? data?.error ?? data?.data?.message)
	if (typeof m === 'string' && m.trim())
		return m
			.replace(/<[^>]+>/g, '')
			.trim()
			.slice(0, 140)
	return 'AnythingTranslate said no'
}

async function ajax(
	post: number,
	text: string,
	signal?: AbortSignal,
	extra?: Record<string, string>,
) {
	const send = async (fresh: boolean) => {
		const form = new FormData()
		form.append('action', 'do_translation')
		form.append('translator_nonce', await getNonce(fresh))
		form.append('post_id', String(post))
		form.append('to_translate', text)
		form.append('translation_model', 'newest')
		form.append('is_language_swapped', '0')
		for (const [k, v] of Object.entries(extra ?? {})) form.append(k, v)
		const res = await fetch(`${SITE}/wp-admin/admin-ajax.php`, {
			method: 'POST',
			body: form,
			headers: { 'User-Agent': UA, Referer: `${SITE}/` },
			signal,
		})
		const raw = await res.text()
		let json: any
		try {
			json = JSON.parse(raw)
		} catch {}
		return { res, raw, json }
	}
	let r = await send(false)
	if (
		!r.json &&
		(r.res.status === 403 || r.raw.trim() === '-1' || r.raw.trim() === '0')
	)
		r = await send(true)
	if (!r.json) {
		if (r.res.status === 429)
			throw new Oops('Too many restyles, slow down a bit')
		throw new Oops(`AnythingTranslate is having a moment (${r.res.status})`)
	}
	if (!r.json.success) throw new Oops(why(r.json.data))
	return r.json.data
}

async function anything(post: number, text: string, signal?: AbortSignal) {
	const data = await ajax(post, text, signal)
	if (!data?.token) return String(data?.answer ?? '')
	try {
		const res = await fetch(data.url, {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'User-Agent': UA },
			body: JSON.stringify({ token: data.token }),
			signal,
		})
		if (!res.ok) throw new Error(String(res.status))
		const out = await res.json()
		if (!out || out.error || typeof out.message !== 'string')
			throw new Error('empty')
		return out.message as string
	} catch (e) {
		if (signal?.aborted) throw e
		const again = await ajax(post, text, signal, { paid_token: data.token })
		return String(again?.answer ?? '')
	}
}

const rules = (prompt: string) =>
	`Rewrite the user's message in this style: ${prompt.trim()}\n\nKeep the meaning and roughly the length. Keep names, numbers and anything in square brackets exactly as they are. Reply with only the rewritten message, no quotes, no notes.`

let freeBusyUntil = 0

async function ai(prompt: string, text: string, signal?: AbortSignal) {
	const o = options()
	const own = o.ai === 'own' && o.aiKey.trim()
	if (!own && Date.now() < freeBusyUntil) {
		const s = Math.ceil((freeBusyUntil - Date.now()) / 1000)
		throw new Oops(`Free AI needs a breather, try again in ${s}s`)
	}
	const url = own
		? `${o.aiUrl.trim().replace(/\/+$/, '')}/chat/completions`
		: 'https://text.pollinations.ai/openai'
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...(own ? { authorization: `Bearer ${o.aiKey.trim()}` } : {}),
		},
		body: JSON.stringify({
			model: own ? o.aiModel.trim() || 'gpt-4o-mini' : 'openai',
			messages: [
				{ role: 'system', content: rules(prompt) },
				{ role: 'user', content: text },
			],
		}),
		signal,
	})
	const raw = await res.text()
	let json: any
	try {
		json = JSON.parse(raw)
	} catch {}
	if (!res.ok || !json) {
		if (!own && (res.status === 429 || /limit/i.test(raw))) {
			freeBusyUntil = Date.now() + 45e3
			throw new Oops('Free AI allows one restyle every 45s')
		}
		throw new Oops(
			json?.error?.message?.slice(0, 140) ??
				`AI request failed (${res.status})`,
		)
	}
	if (!own) freeBusyUntil = Date.now() + 8e3
	const out = json.choices?.[0]?.message?.content
	if (typeof out !== 'string' || !out.trim())
		throw new Oops('AI sent back nothing')
	return out
}

const keep =
	/```[\s\S]*?```|`[^`\n]+`|<a?:\w+:\d+>|<(?:@[!&]?|#|\/[\w -]+:)\d+>|<t:-?\d+(?::\w)?>|<id:\w+>|https?:\/\/[^\s<>]+|(?<=^|\s):[a-zA-Z][\w~+-]*:(?=$|\s)|@(?:everyone|here)\b/g

export function split(text: string) {
	const out: { text: string; keep: boolean }[] = []
	let last = 0
	for (const m of text.matchAll(keep)) {
		const i = m.index ?? 0
		if (i > last) out.push({ text: text.slice(last, i), keep: false })
		out.push({ text: m[0], keep: true })
		last = i + m[0].length
	}
	if (last < text.length) out.push({ text: text.slice(last), keep: false })
	return out
}

function tidy(out: string, input: string) {
	let s = out.replace(/\r\n/g, '\n').trim()
	const q = /^(["“'])([\s\S]*)(["”'])$/.exec(s)
	if (q && !/^["“']/.test(input.trim())) s = q[2].trim()
	const flat = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
	const echo = /^([\s\S]+?)\s*(?:→|->|=>|:)\s*([\s\S]+)$/.exec(s)
	if (echo && flat(echo[1]) === flat(input)) s = echo[2].trim()
	return s
}

async function one(style: Style, text: string, signal?: AbortSignal) {
	if (style.kind === 'fx') return transforms[style.fx!]?.(text) ?? text
	const lead = /^\s*/.exec(text)![0]
	const tail = /\s*$/.exec(text)![0]
	const core = text.trim()
	if (!/[\p{L}\p{N}]/u.test(core)) return text
	const out =
		style.kind === 'ai'
			? await ai(style.prompt ?? style.name, core, signal)
			: await anything(style.post!, core, signal)
	const t = tidy(out, core)
	if (!t) throw new Oops('Came back empty, try another style')
	return lead + t + tail
}

async function whole(
	style: Style,
	parts: { text: string; keep: boolean }[],
	text: string,
) {
	const kept = parts.filter(p => p.keep)
	if (!kept.length) return one(style, text)
	if (kept.length > 12 || /\[\d+\]/.test(text)) return
	if (!parts.some(p => !p.keep && /[\p{L}\p{N}]/u.test(p.text))) return text
	let n = 0
	const marked = parts.map(p => (p.keep ? `[${++n}]` : p.text)).join('')
	const out = await one(style, marked)
	const seen: string[] = out.match(/\[\d+\]/g) ?? []
	const ok =
		seen.length === kept.length &&
		kept.every((_, i) => seen.includes(`[${i + 1}]`))
	if (!ok) return
	return out.replace(/\[(\d+)\]/g, (m, i) => kept[+i - 1]?.text ?? m)
}

const cache = new Map<string, string>()
const flying = new Map<string, Promise<string>>()

export const cached = (style: Style, text: string) =>
	cache.get(`${style.id}\0${text}`)

export function restyle(style: Style, text: string, signal?: AbortSignal) {
	const k = `${style.id}\0${text}`
	const hit = cache.get(k)
	if (hit !== undefined) return Promise.resolve(hit)
	if (style.kind !== 'fx') {
		const f = flying.get(k)
		if (f) return withSignal(f, signal)
	}
	const run = (async () => {
		const parts = split(text)
		const out =
			(style.kind !== 'fx' && (await whole(style, parts, text))) ||
			(
				await Promise.all(
					parts.map(p => (p.keep ? p.text : one(style, p.text))),
				)
			).join('')
		if (style.kind !== 'fx' || style.fx !== 'zalgo') {
			cache.set(k, out)
			if (cache.size > 150) cache.delete(cache.keys().next().value!)
		}
		return out
	})()
	if (style.kind === 'fx') return run
	flying.set(k, run)
	run.then(
		() => flying.delete(k),
		() => flying.delete(k),
	)
	return withSignal(run, signal)
}

function withSignal<T>(p: Promise<T>, signal?: AbortSignal) {
	if (!signal) return p
	return new Promise<T>((resolve, reject) => {
		if (signal.aborted) return reject(new Oops('Cancelled'))
		signal.addEventListener('abort', () => reject(new Oops('Cancelled')))
		p.then(resolve, reject)
	})
}

export const message = (e: any) =>
	e instanceof Oops
		? e.message
		: /network|failed to fetch/i.test(String(e?.message))
			? 'No connection'
			: String(e?.message ?? e).slice(0, 140) || 'Something went wrong'

export interface Hit {
	post: number
	name: string
}

const decode = (s: string) =>
	s
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
		.replace(/&#x([\da-f]+);/gi, (_, n) =>
			String.fromCodePoint(parseInt(n, 16)),
		)
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#039;|&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')

export async function search(q: string, signal?: AbortSignal): Promise<Hit[]> {
	const url = `${SITE}/wp-json/wp/v2/at_translator?search=${encodeURIComponent(q)}&search_columns=post_title&per_page=60&_fields=id,title`
	const res = await fetch(url, { headers: { 'User-Agent': UA }, signal })
	if (!res.ok) throw new Oops(`Search failed (${res.status})`)
	const list: any[] = await res.json()
	const want = q.toLowerCase().trim()
	const hits = list
		.map(x => ({
			post: x.id as number,
			name: decode(String(x.title?.rendered ?? ''))
				.replace(/\s*translator\s*$/i, '')
				.trim(),
		}))
		.filter(h => h.name)
	const score = (h: Hit) => {
		const n = h.name.toLowerCase()
		if (n === want) return 0
		if (n.startsWith(want)) return 1 + n.length / 100
		if (n.split(/\s+/).includes(want)) return 2 + n.length / 100
		return 3 + n.length / 100
	}
	const seen = new Set<string>()
	return hits
		.sort((a, b) => score(a) - score(b))
		.filter(h => {
			const k = h.name
				.toLowerCase()
				.split(/[\s(]+/)
				.slice(0, 2)
				.join(' ')
			if (seen.has(k)) return false
			seen.add(k)
			return true
		})
		.slice(0, 18)
}
