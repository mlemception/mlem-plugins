import { useSyncExternalStore } from 'react'
import type { PluginApi } from '@valenced/plugins/types'

export interface Game {
	id: string
	name: string
	exe: string
	icon?: string | null
}

export interface Queued extends Game {
	minutes: number
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
