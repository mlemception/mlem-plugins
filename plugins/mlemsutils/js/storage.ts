import type { JsonStorage } from '@valenced/json-storage'

export interface MlemStorage {
	modules: Record<string, { enabled: boolean; options: Record<string, any> }>
}

export const vstorage: MlemStorage = { modules: {} }

let store: JsonStorage<MlemStorage> | undefined

export function bindStorage(s: JsonStorage<MlemStorage>) {
	store = s
}

export function saveStorage() {
	store?.set({ modules: vstorage.modules }, true as any)
}
