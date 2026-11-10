import { useSyncExternalStore } from 'react'
import type { PluginApi } from '@valenced/plugins/types'

export type Host = 'catbox' | 'litterbox'
export type Expiry = '1h' | '12h' | '24h' | '72h'
export type Paste = 'link' | 'hidden' | 'dot'

export interface Options {
	host: Host
	expiry: Expiry
	userhash: string
	paste: Paste
}

export const defaults: Options = {
	host: 'catbox',
	expiry: '72h',
	userhash: '',
	paste: 'link',
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

export const options = (): Options => ({ ...defaults, ...storage?.cache })

export function useOptions(): Options {
	useSyncExternalStore(listen, () => version)
	return options()
}
