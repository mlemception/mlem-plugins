import { useSyncExternalStore } from 'react'
import type { PluginApi } from '@valenced/plugins/types'

export interface Game {
	id: string
	name: string
	exe: string
	icon?: string | null
}

export interface Rich {
	details?: string
	state?: string
	party?: [number, number] | null
	small?: { url: string; text: string } | null
	buttons?: { label: string; url: string }[]
	display?: 0 | 1 | 2
}

export interface Queued extends Game {
	minutes: number
	rich?: Rich
}

export interface Credit {
	gameSession: string
	creditedUntil: number
	launched: boolean
	finished: boolean
}

export interface Stored {
	game: Game
	start: number
	endsAt: number
	credit?: Credit
	image?: string
	rich?: Rich
	smallImage?: string
}

export interface Data {
	credit: boolean
	creditAck: boolean
	creditDay: string
	creditToday: number
	showEnd: boolean
	art: boolean
	session: Stored | null
	queue: Queued[]
	recent: Game[]
	creditedMs: number
	duration: string
	rich: Record<string, Rich>
}

export const defaults: Data = {
	credit: false,
	creditAck: false,
	creditDay: '',
	creditToday: 0,
	showEnd: false,
	art: true,
	session: null,
	queue: [],
	recent: [],
	creditedMs: 0,
	duration: '1h',
	rich: {},
}

export type Storage = PluginApi<{ jsonStorage: Data }>['jsonStorage']

let storage: Storage | undefined
let version = 0
const listeners = new Set<() => void>()

export function bump() {
	version++
	for (const l of listeners) l()
}

export function setStorage(s: Storage) {
	storage = s
	return s.subscribe(bump)
}

export const hasStorage = () => !!storage

export const data = (): Data => ({ ...defaults, ...storage?.cache })

export function save(v: Partial<Data>) {
	const p = storage?.set({ ...data(), ...v } as any, true)
	bump()
	return p
}

const listen = (l: () => void) => {
	listeners.add(l)
	return () => {
		listeners.delete(l)
	}
}

export function useData(): Data {
	useSyncExternalStore(listen, () => version)
	return data()
}

export function remember(g: Game) {
	const recent = [
		{ id: g.id, name: g.name, exe: g.exe, icon: g.icon ?? null },
		...data().recent.filter(x => x.id !== g.id),
	].slice(0, 8)
	save({ recent })
}

export const hasRich = (r?: Rich | null) =>
	!!r &&
	!!(
		r.details?.trim() ||
		r.state?.trim() ||
		r.party ||
		r.small?.url ||
		r.buttons?.length
	)

export function rememberRich(id: string, r: Rich) {
	const rich = { ...data().rich }
	delete rich[id]
	if (hasRich(r)) rich[id] = r
	const keys = Object.keys(rich)
	for (const k of keys.slice(0, Math.max(0, keys.length - 20))) delete rich[k]
	save({ rich })
}
