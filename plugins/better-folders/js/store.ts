import { useSyncExternalStore } from 'react'
import type { PluginApi } from '@valenced/plugins/types'

export type RailLook = 'icons' | 'folder'
export type Header = 'always' | 'never' | 'many'

export interface Options {
	sidebar: boolean
	animate: boolean
	rail: RailLook
	header: Header
	names: boolean
	oneOpen: boolean
	closeOnPick: boolean
	closeOutside: boolean
	closeOnHome: boolean
	followGuild: boolean
	swipe: boolean
}

export const defaults: Options = {
	sidebar: true,
	animate: true,
	rail: 'icons',
	header: 'always',
	names: true,
	oneOpen: true,
	closeOnPick: false,
	closeOutside: false,
	closeOnHome: false,
	followGuild: false,
	swipe: true,
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

export const listen = (l: () => void) => {
	listeners.add(l)
	return () => {
		listeners.delete(l)
	}
}

export const opts = (): Options => ({ ...defaults, ...storage?.cache })

export function useOptions(): Options {
	useSyncExternalStore(listen, () => version)
	return opts()
}
