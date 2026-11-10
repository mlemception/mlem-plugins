import { useSyncExternalStore } from 'react'
import type { PluginApi } from '@valenced/plugins/types'

export type Mode = 'nameplate' | 'image' | 'none'

export interface Options {
	mode: Mode
	url: string
	fade: boolean
}

export const defaults: Options = {
	mode: 'nameplate',
	url: '',
	fade: true,
}

export type Storage = PluginApi<{ jsonStorage: Options }>['jsonStorage']

export let storage: Storage

let version = 0
const listeners = new Set<() => void>()

const bump = () => {
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

export function useOptions(): Options {
	useSyncExternalStore(listen, () => version)
	return { ...defaults, ...storage?.cache }
}
