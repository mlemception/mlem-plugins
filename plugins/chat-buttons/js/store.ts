import { useSyncExternalStore } from 'react'
import type { ComponentType, RefObject } from 'react'

export interface Options {
	names: Record<string, string>
	kept: Record<string, boolean>
	seen: Record<string, string>
}

export interface Entry {
	id: string
	label: string
	Icon?: ComponentType<any>
	on?: boolean
	press: () => void
}

export const defaults: Options = { names: {}, kept: {}, seen: {} }

export let storage: any

export const setStorage = (v: any) => {
	storage = v
}

const live = new Map<string, RefObject<Entry>>()
const icons = new Map<string, ComponentType<any>>()
const subs = new Set<() => void>()
let version = 0

const bump = () => {
	version++
	for (const sub of subs) sub()
}

const subscribe = (sub: () => void) => {
	subs.add(sub)
	return () => {
		subs.delete(sub)
	}
}

export const useLive = () => {
	useSyncExternalStore(subscribe, () => version)
	return [...live.values()].map(x => x.current)
}

export const iconFor = (id: string) => icons.get(id)

export function track(ref: RefObject<Entry>) {
	const { id, label, Icon } = ref.current
	live.set(id, ref)
	if (Icon) icons.set(id, Icon)
	if (storage?.cache?.seen?.[id] !== label)
		storage?.set({ seen: { [id]: label } })
	bump()

	return () => {
		if (live.get(id) !== ref) return
		live.delete(id)
		bump()
	}
}

export function refresh({ id, Icon }: Entry) {
	if (Icon) icons.set(id, Icon)
	bump()
}

export const press = (id: string) => live.get(id)?.current.press()

export const reset = () => {
	live.clear()
	icons.clear()
}
