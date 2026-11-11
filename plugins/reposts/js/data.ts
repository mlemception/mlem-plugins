import { hashId } from '../shared/wire'
import { call, describe } from './api'
import { me } from './discord'
import {
	account,
	bump,
	cache,
	connected,
	live,
	saveAccount,
	touchCache,
} from './store'
import type { Entry } from '../shared/wire'

const INDEX_FRESH = 5 * 60_000
const LIST_FRESH = 2 * 60_000
const MINE_FRESH = 5 * 60_000

let indexing: Promise<void> | undefined
const indexListeners = new Set<() => void>()

export function onIndex(l: () => void) {
	indexListeners.add(l)
	return () => {
		indexListeners.delete(l)
	}
}

export function refreshIndex(force = false, maxAge = INDEX_FRESH) {
	if (!connected()) return Promise.resolve()
	const c = cache.index
	if (!force && c && Date.now() - c.at < maxAge) return Promise.resolve()
	indexing ??= call<any>('/v1/index', { etag: c?.etag })
		.then(r => {
			if (r.status === 304 && cache.index) cache.index.at = Date.now()
			else if (r.body?.u) {
				cache.index = { at: Date.now(), etag: r.etag, body: r.body }
				for (const l of indexListeners) l()
			}
			touchCache()
		})
		.catch(() => {})
		.finally(() => {
			indexing = undefined
		})
	return indexing
}

export function indexEntry(uid: string) {
	const b = cache.index?.body
	return b ? b.u[hashId(uid, b.s)] : undefined
}

export function authorOptedOut(uid: string) {
	const b = cache.index?.body
	return !!b?.o?.includes(hashId(uid, b.s))
}

export const UNKNOWN_RECHECK = 30_000

export function hasReposts(uid: string) {
	if (uid === me()) return true
	if (!connected()) return false
	const e = indexEntry(uid)
	if (e) return e[1] > 0
	return (cache.lists[uid]?.body.n ?? 0) > 0
}

export function countFor(uid: string) {
	if (uid === me()) return account().mine.filter(e => !e.x).length
	return cache.lists[uid]?.body.n ?? indexEntry(uid)?.[1] ?? 0
}

export function listFor(uid: string): Entry[] | undefined {
	if (uid === me())
		return connected() || account().mine.length ? account().mine : undefined
	return cache.lists[uid]?.body.l
}

const lists = new Map<string, Promise<void>>()

export function refreshList(uid: string, force = false): Promise<void> {
	if (uid === me()) return pullMine(force)
	if (!connected()) return Promise.resolve()
	const c = cache.lists[uid]
	const idx = indexEntry(uid)
	const stale =
		force ||
		!c ||
		(idx && idx[0] !== c.body.r) ||
		Date.now() - c.at > LIST_FRESH
	if (!stale) return Promise.resolve()
	let p = lists.get(uid)
	if (p) return p
	live.loading.add(uid)
	bump()
	p = call<any>(`/v1/u/${uid}`, { etag: c?.etag })
		.then(r => {
			if (r.status === 304 && c) c.at = Date.now()
			else if (r.body?.l)
				cache.lists[uid] = { at: Date.now(), etag: r.etag, body: r.body }
			live.failed.delete(uid)
		})
		.catch(e => {
			live.failed.set(uid, describe(e))
		})
		.finally(() => {
			lists.delete(uid)
			live.loading.delete(uid)
			touchCache()
		})
	lists.set(uid, p)
	return p
}

let pulling: Promise<void> | undefined

export function pullMine(force = false): Promise<void> {
	const uid = me()
	if (!uid || !connected(uid)) return Promise.resolve()
	const a = account(uid)
	if (!force && a.pulled && Date.now() - a.pulled < MINE_FRESH)
		return Promise.resolve()
	if (a.queue.length) return Promise.resolve()
	pulling ??= call<any>(`/v1/u/${uid}`)
		.then(r => {
			const now = account(uid)
			if (!r.body?.l || now.queue.length) return
			saveAccount({ mine: r.body.l, rev: r.body.r, pulled: Date.now() }, uid)
			live.failed.delete(uid)
		})
		.catch(e => {
			live.failed.set(uid, describe(e))
			bump()
		})
		.finally(() => {
			pulling = undefined
		})
	return pulling
}

export function setOwnIndex(rev: string, n: number) {
	const b = cache.index?.body
	const uid = me()
	if (!b || !uid) return
	const h = hashId(uid, b.s)
	if (n > 0) b.u[h] = [rev, n]
	else delete b.u[h]
	touchCache()
}
