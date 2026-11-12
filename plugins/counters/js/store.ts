import { useSyncExternalStore } from 'react'
import type { PluginApi } from '@valenced/plugins/types'

export interface Options {
	servers: boolean
	online: boolean
	scale: number
}

export const defaults: Options = {
	servers: true,
	online: true,
	scale: 1,
}

export type Storage = PluginApi<{ jsonStorage: Options }>['jsonStorage']

export let storage: Storage

let version = 0
const listeners = new Set<() => void>()

export const bump = () => {
	version++
	for (const l of listeners) l()
}

export const ver = () => version

export function setStorage(s: Storage) {
	storage = s
	s.get().then(bump)
	return s.subscribe(bump)
}

export const listen = (l: () => void) => {
	listeners.add(l)
	return () => {
		listeners.delete(l)
	}
}

export const opts = (): Options => {
	const o = { ...defaults, ...storage?.cache }
	o.scale = Math.min(1.5, Math.max(0.5, Number(o.scale) || 1))
	return o
}

export function useOptions(): Options {
	useSyncExternalStore(listen, ver)
	return opts()
}
