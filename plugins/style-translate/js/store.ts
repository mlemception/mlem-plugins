import { useSyncExternalStore } from 'react'
import { findStyle } from './styles'
import type { PluginApi } from '@valenced/plugins/types'
import type { Custom, Saved, Style } from './styles'

export type Send = 'auto' | 'review'
export type Scope = 'chat' | 'all'
export type Original = 'off' | 'small' | 'spoiler'
export type Ai = 'free' | 'own'

export interface Options {
	style: string
	on: Record<string, string>
	scope: Scope
	send: Send
	original: Original
	chip: boolean
	ahead: boolean
	button: boolean
	favs: string[]
	recent: string[]
	customs: Custom[]
	saved: Saved[]
	ai: Ai
	aiUrl: string
	aiKey: string
	aiModel: string
}

export const defaults: Options = {
	style: 'pirate',
	on: {},
	scope: 'chat',
	send: 'auto',
	original: 'off',
	chip: true,
	ahead: true,
	button: true,
	favs: [],
	recent: [],
	customs: [],
	saved: [],
	ai: 'free',
	aiUrl: 'https://api.openai.com/v1',
	aiKey: '',
	aiModel: 'gpt-4o-mini',
}

export type Storage = PluginApi<{ jsonStorage: Options }>['jsonStorage']

export let storage: Storage | undefined

let version = 0
const listeners = new Set<() => void>()

export function bump() {
	version++
	for (const l of listeners) l()
}

export function setStorage(s: Storage) {
	storage = s
	s.get().then(bump)
	return s.subscribe(bump)
}

const listen = (l: () => void) => {
	listeners.add(l)
	return () => {
		listeners.delete(l)
	}
}

export const options = (): Options => ({ ...defaults, ...storage?.cache })

export function save(v: Partial<Options>) {
	const p = storage?.set({ ...options(), ...v } as any, true)
	bump()
	return p
}

export function useOptions(): Options {
	useSyncExternalStore(listen, () => version)
	return options()
}

export function useTick() {
	return useSyncExternalStore(listen, () => version)
}

export const styleOf = (id: string | undefined, o = options()) =>
	findStyle(id, o.customs, o.saved)

const key = (channelId: string | undefined, o: Options) =>
	o.scope === 'all' ? '*' : channelId

export function activeFor(channelId: string | undefined, o = options()) {
	const k = key(channelId, o)
	return k ? styleOf(o.on[k], o) : undefined
}

export function setActive(channelId: string | undefined, id: string | null) {
	const o = options()
	const k = key(channelId, o)
	if (!k) return
	const on: Record<string, string> = { ...o.on, [k]: id ?? '' }
	for (const x of Object.keys(on)) if (!on[x]) delete on[x]
	save(id ? { on, ...touched(id) } : { on })
}

const touched = (id: string) => ({
	style: id,
	recent: [id, ...options().recent.filter(x => x !== id)].slice(0, 8),
})

export const touch = (id: string) => save(touched(id))

export function toggleFav(id: string) {
	const o = options()
	const has = o.favs.includes(id)
	save({ favs: has ? o.favs.filter(x => x !== id) : [...o.favs, id] })
	return !has
}

export type Phase = 'work' | 'review' | 'fail'

export interface Job {
	id: number
	channelId: string
	style: Style
	phase: Phase
	original: string
	error?: string
	args?: any[]
	real?: (...a: any[]) => any
	abort?: AbortController
}

const jobs = new Map<string, Job>()
let jobId = 0

export const jobFor = (channelId?: string) =>
	channelId ? jobs.get(channelId) : undefined

export function putJob(j: Omit<Job, 'id'> & { id?: number }) {
	const job = { ...j, id: j.id ?? ++jobId } as Job
	jobs.set(job.channelId, job)
	bump()
	return job
}

export function dropJob(channelId: string, id?: number) {
	const j = jobs.get(channelId)
	if (!j || (id !== undefined && j.id !== id)) return
	j.abort?.abort()
	jobs.delete(channelId)
	bump()
}
