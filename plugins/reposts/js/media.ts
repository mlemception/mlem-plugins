import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { getModuleDependencies } from '@valenced/modules/metro'
import { instead } from '@valenced/patcher'
import { Linking } from 'react-native'
import { snowflakeTime } from '../shared/wire'
import { buzz, byProps, http, stores } from './discord'
import { cache, touchCache } from './store'
import type { Entry, FileRef } from '../shared/wire'

const CDN = 'https://cdn.discordapp.com/attachments'
const BATCH = 50
const GONE_FOR = 6 * 3_600_000
const MARGIN = 10 * 60_000

const want = new Map<string, string>()
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

export const baseUrl = (e: Entry, f: FileRef) => `${CDN}/${e.c}/${f[0]}/${f[1]}`

export function signed(e: Entry, f: FileRef): string | null | undefined {
	const hit = cache.urls[f[0]]
	if (hit && hit[1] > Date.now()) return hit[0]
	want.set(baseUrl(e, f), f[0])
	if (!timer) timer = setTimeout(refresh, 60)
	return hit?.[0] === null ? null : undefined
}

export function thumb(url: string, w: number, h: number) {
	const u = url.replace(
		'https://cdn.discordapp.com/',
		'https://media.discordapp.net/',
	)
	return `${u}${u.includes('?') ? '&' : '?'}width=${Math.round(w)}&height=${Math.round(h)}`
}

export const isImage = (f: FileRef) =>
	/^image\/(png|jpe?g|webp|gif)/.test(f[2]) ||
	/\.(png|jpe?g|webp|gif)$/i.test(f[1])
export const isVideo = (f: FileRef) =>
	/^video\//.test(f[2]) || /\.(mp4|mov|webm)$/i.test(f[1])

export function onUrls(l: () => void) {
	listeners.add(l)
	return () => {
		listeners.delete(l)
	}
}

async function refresh() {
	timer = undefined
	const h = http()
	const batch = [...want].slice(0, BATCH)
	for (const [u] of batch) want.delete(u)
	if (!h || !batch.length) return
	try {
		const r = await h.post({
			url: '/attachments/refresh-urls',
			body: { attachment_urls: batch.map(([u]) => u) },
		})
		const got = new Map<string, string>()
		for (const x of (r.body as any)?.refreshed_urls ?? [])
			if (x?.original && x.refreshed)
				got.set(String(x.original).split('?')[0]!, x.refreshed)
		const now = Date.now()
		for (const [u, id] of batch) {
			const s = got.get(u)
			if (!s) {
				cache.urls[id] = [null, now + GONE_FOR]
				continue
			}
			const ex = Number.parseInt(s.match(/[?&]ex=([0-9a-f]+)/)?.[1] ?? '', 16)
			cache.urls[id] = [
				s,
				Number.isFinite(ex) ? ex * 1000 - MARGIN : now + 3_600_000,
			]
		}
		touchCache()
		for (const l of listeners) l()
	} catch {
		for (const [u, id] of batch) want.set(u, id)
		if (!timer) timer = setTimeout(refresh, 15_000)
	}
	if (want.size) if (!timer) timer = setTimeout(refresh, 60)
}

export interface ViewItem {
	key: string
	kind: 'image' | 'video' | 'gifv'
	thumb: string
	full: string
	video?: string
	link?: string
	w: number
	h: number
	type?: string
	accessory: 'attachment' | 'embed'
}

interface Viewer {
	sheet: any
	sources: any
}

let viewer: Viewer | null | undefined

const moduleId = (...p: [string, ...string[]]) =>
	lookupModule(withProps<any>(...p))[1] as number | undefined

function load(ids: number[], ok: (e: any) => boolean) {
	for (const m of ids) {
		try {
			const e = __r(m)
			if (ok(e)) return e
		} catch {}
	}
}

function mediaViewer() {
	if (viewer !== undefined) return viewer
	viewer = null
	try {
		const sheets = moduleId('openLazy', 'hideActionSheet')
		const lazy = moduleId('pushLazy')
		if (sheets === undefined || lazy === undefined) return
		const dist = (m: number) => Math.abs(getModuleDependencies(m)!.length - 15)
		const picks: number[] = []
		for (let m = 0; m < 80_000; m++) {
			const deps = getModuleDependencies(m)
			if (
				deps &&
				deps.length < 30 &&
				deps.includes(sheets) &&
				deps.includes(lazy)
			)
				picks.push(m)
		}
		picks.sort((a, b) => dist(a) - dist(b))
		let opener: number | undefined
		for (const m of picks) {
			try {
				if (typeof __r(m)?.openMediaModal === 'function') {
					opener = m
					break
				}
			} catch {}
		}
		if (opener === undefined) return
		const deps = getModuleDependencies(opener) ?? []
		const sources = load(
			deps,
			e => typeof e?.setMediaViewerSources === 'function',
		)
		const sheet = load(
			deps
				.filter(d => {
					const dd = getModuleDependencies(d)
					return dd && dd.length < 15 && dd.includes(sheets)
				})
				.sort(
					(a, b) =>
						getModuleDependencies(a)!.length - getModuleDependencies(b)!.length,
				),
			e => typeof e?.default === 'function',
		)
		if (sources && sheet) viewer = { sheet, sources }
	} catch {}
	return viewer
}

export function openNative(
	entry: Entry,
	items: ViewItem[],
	index: number,
	origin?: any,
) {
	const v = mediaViewer()
	const it = items[index]
	if (!it) return
	const fallback = () => Linking.openURL(it.link ?? it.full).catch(() => {})
	if (!v) return fallback()
	const where = footer(entry)
	const sources = items.map((x, i) => ({
		uri: x.thumb,
		mediaIndex: i,
		width: x.w || 1,
		height: x.h || 1,
		accessoryType: x.accessory,
		sourceURI: x.full,
		shareURI: x.link ?? x.full,
		...(x.kind === 'image'
			? {}
			: {
					videoURI: x.video ?? x.full,
					contentType: x.type ?? 'video/mp4',
					isGIFV: x.kind === 'gifv',
					thumbnail: { uri: x.thumb, width: x.w || 1, height: x.h || 1 },
				}),
		...where,
	}))
	const open = (originLayout?: object) => {
		try {
			v.sources.setMediaViewerSources({ sources })
			ActionSheetActionCreators.openLazy(
				Promise.resolve(v.sheet) as any,
				'media-modal-key',
				{
					initialIndex: index,
					originLayout,
					shareable: true,
					disableDownload: false,
					onCloseCallback: () => {},
				},
				'stack' as any,
			)
		} catch {
			fallback()
		}
	}
	buzz('IMPACT_LIGHT')
	if (typeof origin?.measureInWindow !== 'function') return open()
	origin.measureInWindow(
		(x: number, y: number, width: number, height: number) =>
			open(width ? { x, y, width, height, resizeMode: 'fill' } : undefined),
	)
}

const fakeMessages = new Map<string, any>()
const fakeChannels = new Map<string, any>()
const unpatches: (() => void)[] = []
const KEEP = 40

function serve() {
	if (unpatches.length) return
	const preview = stores.MessagePreviewStore
	const channels = stores.ChannelStore
	if (!preview?.getMessage || !channels?.getChannel) return
	unpatches.push(
		instead(
			preview,
			'getMessage',
			(a: any[], real: any) => real(...a) ?? fakeMessages.get(a[0]),
		),
		instead(
			channels,
			'getChannel',
			(a: any[], real: any) =>
				real(...a) ?? (fakeChannels.size ? fakeChannels.get(a[0]) : undefined),
		),
	)
}

export function dropFooters() {
	for (const u of unpatches.splice(0)) u()
	fakeMessages.clear()
	fakeChannels.clear()
}

function remember(map: Map<string, any>, k: string, v: any) {
	map.delete(k)
	map.set(k, v)
	if (map.size > KEEP) map.delete(map.keys().next().value!)
}

function footer(e: Entry) {
	if (e.p || !e.a) return {}
	const known = !!stores.ChannelStore?.getChannel?.(e.c)
	if (known && stores.MessageStore?.getMessage?.(e.c, e.m))
		return { messageId: e.m, channelId: e.c, guildId: e.g ?? null }
	try {
		const channelId = known ? e.c : e.m
		const u = stores.UserStore?.getUser?.(e.a)
		const msg = byProps(
			'createMessageRecord',
			'updateMessageRecord',
		)?.createMessageRecord?.({
			id: e.m,
			channel_id: channelId,
			type: 0,
			content: e.t ?? '',
			timestamp: new Date(snowflakeTime(e.m)).toISOString(),
			edited_timestamp: null,
			author: {
				id: e.a,
				username: u?.username ?? 'Unknown User',
				global_name: u?.globalName ?? null,
				avatar: u?.avatar ?? null,
				discriminator: u?.discriminator ?? '0',
			},
			attachments: [],
			embeds: [],
			mentions: [],
			mention_roles: [],
			pinned: false,
			mention_everyone: false,
			tts: false,
			flags: 0,
		})
		if (msg?.id !== e.m) return {}
		if (!known) {
			const ch = byProps(
				'createChannelRecordFromServer',
			)?.createChannelRecordFromServer?.({
				id: channelId,
				type: 0,
				guild_id: e.m,
				name: 'unknown',
				permission_overwrites: [],
			})
			if (ch?.id !== channelId) return {}
			remember(fakeChannels, channelId, ch)
		}
		remember(fakeMessages, e.m, msg)
		serve()
		return {
			messageId: e.m,
			channelId,
			guildId: known ? (e.g ?? null) : e.m,
		}
	} catch {
		return {}
	}
}
