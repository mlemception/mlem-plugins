import { cleanEmbeds, LIMITS } from '../shared/wire'
import { ApiError, call, describe } from './api'
import { refreshIndex, setOwnIndex } from './data'
import {
	assetIcon,
	buzz,
	displayName,
	me,
	smooth,
	stores,
	toast,
} from './discord'
import { RepostIcon } from './icon'
import { account, connected, saveAccount } from './store'
import type { AddOp, Entry, FileRef, Op, SyncBody } from '../shared/wire'

const SENDABLE_TYPES = new Set([0, 19, 20, 23])

const anonAuthors = new Map<string, string>()

let onConnected: (() => void) | undefined
export const takePending = () => {
	const f = onConnected
	onConnected = undefined
	return f
}

export function repostable(msg: any) {
	if (!msg?.id || !msg.channel_id || !msg.author?.id) return false
	if (msg.state && msg.state !== 'SENT') return false
	if (msg.type !== undefined && !SENDABLE_TYPES.has(msg.type)) return false
	return !!(
		msg.content?.trim() ||
		msg.attachments?.length ||
		msg.stickerItems?.length ||
		msg.embeds?.length
	)
}

const pic = (x: any): [string, number, number] | undefined => {
	const url = x?.proxyURL ?? x?.proxy_url ?? x?.url
	return url
		? [String(url), Number(x.width) || 0, Number(x.height) || 0]
		: undefined
}

function embedOf(x: any) {
	const k = String(x?.type ?? 'rich')
	const color =
		typeof x?.color === 'string'
			? Number.parseInt(x.color.replace('#', ''), 16)
			: x?.color
	const image = pic(x?.image)
	const media = image ?? pic(x?.thumbnail)
	return {
		k,
		u: x?.url,
		ti: x?.rawTitle ?? x?.title,
		d: x?.rawDescription ?? x?.description,
		p: x?.provider?.name,
		au: x?.author?.name,
		c: Number.isInteger(color) ? color : undefined,
		m: media,
		big: image || ['image', 'gifv', 'video'].includes(k) ? 1 : undefined,
		v: pic(x?.video),
	}
}

export const isReposted = (m: string) => account().mine.some(e => e.m === m)

export function snapshot(msg: any, anon: boolean): AddOp {
	const ch = stores.ChannelStore?.getChannel?.(msg.channel_id)
	const files: FileRef[] = (msg.attachments ?? [])
		.slice(0, LIMITS.files)
		.map((a: any) => [
			String(a.id),
			String(a.filename ?? 'file'),
			String(a.content_type ?? a.contentType ?? ''),
			Number(a.width) || 0,
			Number(a.height) || 0,
		])
	const stickers = (msg.stickerItems ?? msg.sticker_items ?? [])
		.slice(0, LIMITS.stickers)
		.map((s: any) => String(s.id))
	const op: AddOp = { o: 'add', m: msg.id, c: msg.channel_id, a: msg.author.id }
	if (ch?.guild_id) op.g = ch.guild_id
	if (anon) op.p = 1
	const t = String(msg.content ?? '').slice(0, LIMITS.text)
	if (t.trim()) op.t = t
	if (files.length) op.f = files
	if (stickers.length) op.s = stickers
	const embeds = cleanEmbeds((msg.embeds ?? []).map(embedOf))
	if (embeds) op.e = embeds
	return op
}

function toEntry(op: AddOp): Entry {
	const { o, a, ...rest } = op
	return { ...rest, ...(op.p ? {} : { a }), at: Math.floor(Date.now() / 1000) }
}

export function repost(msg: any, anon: boolean, connect: () => void) {
	if (!connected()) {
		onConnected = () => repost(msg, anon, connect)
		connect()
		return
	}
	const op = snapshot(msg, anon)
	const a = account()
	const stored: Op = anon ? { ...op, a: undefined } : op
	if (anon) anonAuthors.set(op.m, op.a!)
	saveAccount({
		mine: [toEntry(op), ...a.mine.filter(e => e.m !== op.m)],
		queue: [...a.queue.filter(q => q.m !== op.m || inFlight.has(q)), stored],
	})
	buzz('IMPACT_LIGHT')
	toast(anon ? 'Reposted anonymously' : 'Reposted to your profile', RepostIcon)
	schedule()
}

export function unrepost(m: string, quiet = false) {
	smooth()
	const a = account()
	const unsent = a.queue.some(
		q => q.m === m && q.o === 'add' && !inFlight.has(q),
	)
	const keep = a.queue.filter(q => q.m !== m || inFlight.has(q))
	saveAccount({
		mine: a.mine.filter(e => e.m !== m),
		queue: unsent ? keep : [...keep, { o: 'del', m }],
	})
	anonAuthors.delete(m)
	if (!quiet) toast('Repost removed', assetIcon('TrashIcon'))
	schedule()
}

export function hideAuthor(m: string) {
	const a = account()
	saveAccount({
		mine: a.mine.map(e => {
			if (e.m !== m) return e
			const { a: _, ...rest } = e
			return { ...rest, p: 1 as const }
		}),
		queue: [...a.queue, { o: 'priv', m }],
	})
	toast('Author hidden', assetIcon('EyeSlashIcon'))
	schedule()
}

const nameOf = (id?: string) => {
	const u = id && stores.UserStore?.getUser?.(id)
	return u ? displayName(u) : 'This person'
}

const inFlight = new Set<Op>()
let timer: ReturnType<typeof setTimeout> | undefined
let backoff = 0

export function schedule(delay = 450) {
	if (timer) clearTimeout(timer)
	timer = setTimeout(flush, delay)
}

const WHY: Record<string, string> = {
	optout: "doesn't allow reposts of their messages",
	invalid: "Couldn't repost that message",
	limit: "You've hit the repost limit. Remove a few to add more.",
}

async function flush() {
	timer = undefined
	const uid = me()
	if (!uid || inFlight.size || !connected(uid)) return
	const batch = account(uid).queue.slice(0, LIMITS.ops)
	if (!batch.length) return
	for (const op of batch) inFlight.add(op)
	const ops = batch.map(op =>
		op.o === 'add' && op.p && !op.a && anonAuthors.has(op.m)
			? { ...op, a: anonAuthors.get(op.m) }
			: op,
	)
	try {
		const r = await call<SyncBody>('/v1/me/sync', {
			method: 'POST',
			body: { ops },
		})
		const res = r.body!
		backoff = 0
		const now = account(uid)
		const failed = new Map(
			res.res.filter(x => !x.ok && x.err !== 'missing').map(x => [x.m, x.err!]),
		)
		for (const op of batch)
			if (op.o === 'add' && !failed.has(op.m)) anonAuthors.delete(op.m)
		saveAccount(
			{
				queue: now.queue.filter(q => !inFlight.has(q)),
				mine: now.mine.filter(e => !failed.has(e.m)),
				rev: res.r,
			},
			uid,
		)
		setOwnIndex(res.r, res.n)
		if ([...failed.values()].includes('optout')) refreshIndex(true)
		for (const [m, err] of failed) {
			const op = batch.find(o => o.m === m && o.o === 'add') as
				| AddOp
				| undefined
			const who = op?.a ?? anonAuthors.get(m)
			anonAuthors.delete(m)
			buzz('NOTIFICATION_ERROR')
			if (err === 'optout')
				toast(`${nameOf(who)} ${WHY.optout}`, assetIcon('CircleErrorIcon'))
			else toast(WHY[err] ?? WHY.invalid!, assetIcon('CircleErrorIcon'))
		}
	} catch (e) {
		const err = e instanceof ApiError ? e : new ApiError(0, 'network')
		if (err.status === 429 && err.code === 'daily') {
			const now = account(uid)
			const dropped = new Set(batch.filter(o => o.o === 'add').map(o => o.m))
			saveAccount(
				{
					queue: now.queue.filter(q => !inFlight.has(q)),
					mine: now.mine.filter(e => !dropped.has(e.m)),
				},
				uid,
			)
			toast(describe(err), assetIcon('ClockIcon'))
		} else if (err.status === 400) {
			saveAccount(
				{ queue: account(uid).queue.filter(q => !inFlight.has(q)) },
				uid,
			)
		} else if (err.status !== 401) {
			backoff = Math.min(backoff ? backoff * 2 : 2000, 120_000)
			inFlight.clear()
			schedule(backoff)
			return
		}
	} finally {
		inFlight.clear()
	}
	if (account(uid).queue.length) schedule(0)
}

export const flushSoon = () => schedule(0)
