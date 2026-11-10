import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import type { Game } from './store'

export interface App extends Game {
	aliases: string[]
	themes: string[]
	key: string
}

const DETECTABLE = 'https://discord.com/api/v10/applications/detectable'

let http: any
export function api() {
	if (!http) [http] = lookupModule(withProps<any>('HTTP', 'getAPIBaseURL'))
	return http
}

let list: App[] | null = null
let loading: Promise<App[]> | null = null

const norm = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()

export function exeOf(executables: any[] | undefined, name: string) {
	const ex = executables ?? []
	const pick =
		ex.find(e => e.os === 'win32' && !e.is_launcher) ??
		ex.find(e => e.os === 'win32') ??
		ex[0]
	return (pick?.name?.replace(/^>/, '') ?? `${name}.exe`).replace(
		/^.*[\\/]/,
		'',
	)
}

export const loaded = () => list

export function loadGames(): Promise<App[]> {
	if (list) return Promise.resolve(list)
	loading ??= fetch(DETECTABLE)
		.then(r => {
			if (!r.ok) throw new Error(`Discord said ${r.status}`)
			return r.json()
		})
		.then((raw: any[]) => {
			list = raw
				.filter(a => a?.id && a?.name)
				.map(a => ({
					id: String(a.id),
					name: String(a.name),
					exe: exeOf(a.executables, a.name),
					icon: a.icon_hash ?? undefined,
					aliases: Array.isArray(a.aliases) ? a.aliases : [],
					themes: Array.isArray(a.themes) ? a.themes : [],
					key: norm(a.name),
				}))
			for (const a of list) if (a.icon) icons.set(a.id, a.icon)
			return list
		})
		.catch(e => {
			loading = null
			throw e
		})
	return loading
}

export function search(apps: App[], q: string, max = 40): App[] {
	const n = norm(q)
	if (n.length < 2) return []
	const words = n.split(' ')
	const scored: [number, App][] = []
	for (const a of apps) {
		let s = 0
		if (a.key === n) s = 100
		else if (a.key.startsWith(n)) s = 80
		else if (a.key.includes(` ${n}`)) s = 60
		else if (a.key.includes(n)) s = 40
		else if (words.length > 1 && words.every(w => a.key.includes(w))) s = 30
		else if (a.aliases.some(x => norm(x).includes(n))) s = 20
		if (s) scored.push([s - Math.min(a.key.length, 60) / 100, a])
	}
	return scored
		.sort((x, y) => y[0] - x[0] || x[1].name.localeCompare(y[1].name))
		.slice(0, max)
		.map(x => x[1])
}

export function shuffle(apps: App[], count: number): App[] {
	const pool = apps.filter(a => a.icon)
	const src = pool.length >= count ? pool : apps
	const out: App[] = []
	const seen = new Set<number>()
	while (out.length < Math.min(count, src.length)) {
		const i = Math.floor(Math.random() * src.length)
		if (seen.has(i)) continue
		seen.add(i)
		out.push(src[i])
	}
	return out
}

const icons = new Map<string, string | null>()
const waiting = new Set<string>()
let batch: Set<string> | null = null
const iconListeners = new Set<() => void>()

export const onIcons = (l: () => void) => {
	iconListeners.add(l)
	return () => {
		iconListeners.delete(l)
	}
}

export function iconHash(id: string): string | null | undefined {
	return icons.get(id)
}

export function iconUrl(id: string, hash?: string | null, size = 64) {
	const h = hash ?? icons.get(id)
	return h
		? `https://cdn.discordapp.com/app-icons/${id}/${h}.png?size=${size}`
		: undefined
}

export function wantIcon(id: string) {
	if (icons.has(id) || waiting.has(id)) return
	waiting.add(id)
	if (batch) {
		batch.add(id)
		return
	}
	batch = new Set([id])
	setTimeout(async () => {
		const ids = [...(batch ?? [])]
		batch = null
		try {
			const res = await api().HTTP.get({
				url: '/games',
				query: { game_ids: ids },
			})
			for (const g of res.body ?? [])
				icons.set(String(g.id), g.icon_hash ?? null)
		} catch {}
		for (const id of ids) {
			waiting.delete(id)
			if (!icons.has(id)) icons.set(id, null)
		}
		for (const l of iconListeners) l()
	}, 60)
}

export async function fetchIcon(id: string): Promise<string | null> {
	if (icons.get(id)) return icons.get(id)!
	try {
		const res = await api().HTTP.get({
			url: '/games',
			query: { game_ids: [id] },
		})
		const g = (res.body ?? []).find((x: any) => String(x.id) === id)
		const h = g?.icon_hash ?? null
		icons.set(id, h)
		return h
	} catch {
		return null
	}
}

const images = new Map<string, string>()

export async function activityImage(id: string, hash?: string | null) {
	const url = iconUrl(id, hash ?? (await fetchIcon(id)), 512)
	if (!url) return
	const known = images.get(url)
	if (known) return known
	try {
		const res = await api().HTTP.post({
			url: `/applications/${id}/external-assets`,
			body: { urls: [url] },
		})
		const path = res.body?.[0]?.external_asset_path
		if (!path) return
		const img = `mp:${path}`
		images.set(url, img)
		return img
	} catch {}
}
