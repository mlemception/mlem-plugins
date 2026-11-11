import { getJsonStorage, pluginStoragePathFor } from '@valenced/json-storage'
import { useSyncExternalStore } from 'react'
import { me } from './discord'
import type { PluginApi } from '@valenced/plugins/types'
import type { Entry, IndexBody, ListBody, Op } from '../shared/wire'

export const PLUGIN_ID = 'mlemception.reposts'

export interface Account {
	token?: string
	exp?: number
	mine: Entry[]
	rev?: string
	pulled?: number
	queue: Op[]
	optout: boolean
}

export interface Saved {
	accounts: Record<string, Account>
	hidden: string[]
	api?: string
}

export const defaults: Saved = { accounts: {}, hidden: [] }
const blank = (): Account => ({ mine: [], queue: [], optout: false })

export type Check = 'ok' | 'edited' | 'deleted' | 'mismatch' | 'unknown'

export interface Cached {
	v: 1
	index?: { at: number; etag?: string; body: IndexBody }
	lists: Record<string, { at: number; etag?: string; body: ListBody }>
	checks: Record<string, [Check, number]>
	urls: Record<string, [url: string | null, until: number]>
}

const emptyCache = (): Cached => ({ v: 1, lists: {}, checks: {}, urls: {} })

export type Storage = PluginApi<{ jsonStorage: Saved }>['jsonStorage']

let storage: Storage | undefined
let cacheFile: ReturnType<typeof getJsonStorage<Cached>> | undefined
export let saved: Saved = defaults
export let cache: Cached = emptyCache()

export const live = {
	loading: new Set<string>(),
	failed: new Map<string, string>(),
	outdated: false,
	connecting: false,
}

let version = 0
const listeners = new Set<() => void>()

export function bump() {
	version++
	for (const l of listeners) l()
}

const listen = (l: () => void) => {
	listeners.add(l)
	return () => {
		listeners.delete(l)
	}
}

export function useVersion() {
	return useSyncExternalStore(listen, () => version)
}

export function save(v: Partial<Saved>) {
	saved = { ...saved, ...v }
	bump()
	storage?.set(saved, true).catch(() => {})
}

let cacheTimer: ReturnType<typeof setTimeout> | undefined

export function touchCache(now = false) {
	bump()
	if (cacheTimer) clearTimeout(cacheTimer)
	const write = () => {
		cacheTimer = undefined
		prune()
		cacheFile?.set(cache, true).catch(() => {})
	}
	if (now) write()
	else cacheTimer = setTimeout(write, 2000)
}

const MAX_LISTS = 40
const MAX_CHECKS = 2000

function prune() {
	const lists = Object.entries(cache.lists)
	if (lists.length > MAX_LISTS) {
		lists.sort((a, b) => b[1].at - a[1].at)
		cache.lists = Object.fromEntries(lists.slice(0, MAX_LISTS))
	}
	const checks = Object.entries(cache.checks)
	if (checks.length > MAX_CHECKS) {
		checks.sort((a, b) => b[1][1] - a[1][1])
		cache.checks = Object.fromEntries(checks.slice(0, MAX_CHECKS))
	}
	const now = Date.now()
	for (const [k, [, until]] of Object.entries(cache.urls))
		if (until < now) delete cache.urls[k]
}

export async function init(s: Storage) {
	storage = s
	saved = { ...defaults, ...(await s.get()) }
	try {
		cacheFile = getJsonStorage<Cached>(
			pluginStoragePathFor(PLUGIN_ID, 'cache.json'),
			{
				default: emptyCache(),
			},
		)
		const c = await cacheFile.get()
		cache = c?.v === 1 ? { ...emptyCache(), ...c } : emptyCache()
	} catch {
		cache = emptyCache()
	}
	bump()
}

export function account(uid = me()): Account {
	return (uid && saved.accounts[uid]) || blank()
}

export function saveAccount(v: Partial<Account>, uid = me()) {
	if (!uid) return
	save({ accounts: { ...saved.accounts, [uid]: { ...account(uid), ...v } } })
}

export function wipeAccount(uid = me()) {
	if (!uid) return
	const { [uid]: _, ...rest } = saved.accounts
	save({ accounts: rest })
	cache = emptyCache()
	live.loading.clear()
	live.failed.clear()
	touchCache(true)
}

export function connected(uid = me()) {
	const a = account(uid)
	return !!a.token && (a.exp ?? 0) > Date.now()
}
