import { http, stores } from './discord'
import { cache, touchCache } from './store'
import type { Entry } from '../shared/wire'
import type { Check } from './store'

const HOUR = 3_600_000
const KEEP: Record<Check, number> = {
	ok: 24 * HOUR,
	edited: 24 * HOUR,
	mismatch: 12 * HOUR,
	unknown: 3 * HOUR,
	deleted: 30 * 24 * HOUR,
}
const GAP = 400

const key = (e: Entry) => `${e.c}:${e.m}`
const norm = (s?: string) => (s ?? '').replace(/\r\n/g, '\n').trim()

export function checkOf(e: Entry): Check | undefined {
	const hit = cache.checks[key(e)]
	if (hit && Date.now() - hit[1] < KEEP[hit[0]]) return hit[0]
}

export function compare(e: Entry, msg: any): Check {
	const author = msg.author?.id
	if (e.a && author && e.a !== author) return 'mismatch'
	const ids = new Set((msg.attachments ?? []).map((a: any) => String(a.id)))
	const filesOk = (e.f ?? []).every(f => ids.has(f[0]))
	const edited = !!(msg.edited_timestamp ?? msg.editedTimestamp)
	if (norm(e.t) === norm(msg.content) && filesOk) return 'ok'
	return edited ? 'edited' : 'mismatch'
}

const queue: Entry[] = []
const queued = new Set<string>()
let running = false

export function verify(e: Entry) {
	const k = key(e)
	if (checkOf(e) || queued.has(k)) return
	const local = stores.MessageStore?.getMessage?.(e.c, e.m)
	if (local) return done(k, compare(e, local))
	if (!stores.ChannelStore?.getChannel?.(e.c)) return done(k, 'unknown')
	queued.add(k)
	queue.push(e)
	if (!running) pump()
}

function done(k: string, c: Check) {
	cache.checks[k] = [c, Date.now()]
	touchCache()
}

async function pump() {
	running = true
	while (queue.length) {
		const e = queue.shift()!
		const k = key(e)
		try {
			done(k, await lookup(e))
		} catch {}
		queued.delete(k)
		await new Promise(r => setTimeout(r, GAP))
	}
	running = false
}

async function lookup(e: Entry): Promise<Check> {
	const h = http()
	if (!h) return 'unknown'
	try {
		const r = await h.get({
			url: `/channels/${e.c}/messages`,
			query: { around: e.m, limit: 1 },
		})
		const msg = (r.body as any[] | undefined)?.find(x => x.id === e.m)
		return msg ? compare(e, msg) : 'deleted'
	} catch (err: any) {
		const code = err?.body?.code
		if (err?.status === 404 && code === 10008) return 'deleted'
		return 'unknown'
	}
}

export const CHECK_TEXT: Record<Check, [title: string, body: string]> = {
	ok: ['Verified', 'This matches the original message, which you can see.'],
	edited: [
		'Edited since',
		'The original message was edited after it was reposted.',
	],
	deleted: ['Original deleted', 'The original message has been deleted.'],
	mismatch: [
		"Doesn't match",
		"This doesn't match the original message. It may have been changed before it was reposted.",
	],
	unknown: [
		'Unverified',
		"You can't see the original message, so this repost can't be checked.",
	],
}
