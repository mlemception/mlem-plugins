import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores } from '@valenced/discord/flux'
import { instead } from '@valenced/patcher'
import { useSyncExternalStore } from 'react'
import { loadRail, rea, timing } from './discord'
import { listen, opts } from './store'

const S: any = new Proxy({}, { get: (_, k) => (Stores as any)[k] })
const D: any = new Proxy({}, { get: (_, k) => (Dispatcher as any)[k] })

export interface Group {
	id: number
	name: string | null
	color?: number | null
	node: any
	guildIds: string[]
}

let rail = 0
let home = 0
let custom = false
let railOff: ReturnType<typeof setTimeout> | undefined

const nudge = () => setTimeout(() => S.ExpandedGuildFolderStore.emitChange?.())

function railCheck() {
	if (railOff) {
		clearTimeout(railOff)
		railOff = undefined
	}
	if (rail > 0) {
		const was = custom
		custom = false
		if (was) nudge()
		setTimeout(() => refresh(true))
		return
	}
	railOff = setTimeout(() => {
		railOff = undefined
		const next = home > 0
		if (next) loadRail()
		if (next !== custom) {
			custom = next
			nudge()
		}
		refresh(true)
	}, 400)
}

export function railItem(on: boolean) {
	const was = rail > 0
	rail += on ? 1 : -1
	if (rail > 0 !== was) railCheck()
}

export function homeItem(on: boolean) {
	home += on ? 1 : -1
	if (rail <= 0) railCheck()
}

let realExp = () => S.ExpandedGuildFolderStore.getExpandedFolders()

export function hideOpen() {
	const store = S.ExpandedGuildFolderStore
	const proto = Object.getPrototypeOf(store)
	const real = proto.getExpandedFolders
	realExp = () => real.call(store)
	return instead(proto, 'getExpandedFolders', (args: any[], orig: any) => {
		const set = orig.apply(store, args)
		if (!custom || !shown.length || !(set instanceof Set)) return set
		const out = new Set(set)
		for (const g of shown) out.delete(g.id)
		return out
	})
}

let progress: any

export const prog = () => {
	if (!progress) progress = rea().makeMutable(0)
	return progress
}

let shown: Group[] = []
let display: Group[] = []
let ver = 0
let closing: ReturnType<typeof setTimeout> | undefined
const recent: number[] = []
const subs = new Set<() => void>()

const emit = () => {
	ver++
	for (const s of subs) s()
}

export const bump = () => setTimeout(emit)

const sub = (l: () => void) => {
	subs.add(l)
	return () => {
		subs.delete(l)
	}
}

export const useDisplay = () => {
	useSyncExternalStore(sub, () => ver)
	return display
}

export const isShown = (id: number) => shown.some(g => g.id === id)

const touch = (id: number) => {
	const i = recent.indexOf(id)
	if (i >= 0) recent.splice(i, 1)
	recent.unshift(id)
}

function compute(): Group[] {
	const o = opts()
	if (!o.sidebar || (rail <= 0 && !custom)) return []
	const exp = realExp()
	let out: Group[] = []
	for (const n of S.SortedGuildStore.getFastListGuildFolders() ?? []) {
		if (n?.type !== 'folder' || !exp.has(n.id) || !n.children?.length) continue
		const f = S.SortedGuildStore.getGuildFolderById?.(n.id)
		out.push({
			id: n.id,
			name: f?.folderName ?? n.name ?? null,
			color: f?.folderColor ?? n.color,
			node: n,
			guildIds: n.children.map((c: any) => c.id),
		})
	}
	if (o.oneOpen && out.length > 1) {
		const rank = (g: Group) => {
			const i = recent.indexOf(g.id)
			return i < 0 ? 1e9 : i
		}
		out = [out.reduce((a, b) => (rank(b) < rank(a) ? b : a))]
	}
	return out
}

const key = (l: Group[]) =>
	l.map(g => `${g.id}:${g.name}:${g.color}:${g.guildIds.join()}`).join('|')

let turn = 0

function animate(open: boolean, instant: boolean) {
	const to = open ? 1 : 0
	if (instant || !opts().animate) prog().value = to
	else prog().value = rea().withTiming(to, timing(open))
}

export function refresh(instant = false) {
	const next = compute()
	if (key(next) === key(shown)) return
	const wasOpen = shown.length > 0
	shown = next
	if (custom) nudge()
	const open = shown.length > 0
	if (closing) {
		clearTimeout(closing)
		closing = undefined
	}
	const mounted = display.length > 0
	if (open) display = shown
	if (open !== wasOpen) {
		const run = ++turn
		if (open && !mounted && !instant && opts().animate) {
			emit()
			requestAnimationFrame(() =>
				requestAnimationFrame(() => {
					if (run === turn) animate(true, false)
				}),
			)
			return
		}
		animate(open, instant)
		if (!open) {
			if (instant || !opts().animate) display = []
			else
				closing = setTimeout(() => {
					closing = undefined
					if (!shown.length) {
						display = []
						emit()
					}
				}, timing(false).duration + 40)
		}
	}
	emit()
}

const setExpanded = (folderId: number, expanded: boolean) =>
	D.dispatch({ type: 'SET_GUILD_FOLDER_EXPANDED', folderId, expanded })

export function closeAll() {
	for (const id of [...realExp()]) setExpanded(id, false)
}

const folderOf = (guildId?: string | null) =>
	guildId
		? S.SortedGuildStore.getGuildFolders().find(
				(f: any) => f.folderId && f.guildIds?.includes(guildId),
			)
		: undefined

let lastGuild: string | null | undefined

function onSelect(p: any) {
	const o = opts()
	if (p.guildId === lastGuild) return
	const prev = lastGuild
	lastGuild = p.guildId
	const f = folderOf(p.guildId)
	setTimeout(() => {
		if (f) {
			const open = S.ExpandedGuildFolderStore.isFolderExpanded(f.folderId)
			if (o.followGuild && !open) {
				touch(f.folderId)
				setExpanded(f.folderId, true)
			} else if (o.closeOnPick && open && prev !== undefined) {
				setExpanded(f.folderId, false)
			}
		} else if (p.guildId ? o.closeOutside : o.closeOnHome && prev) {
			closeAll()
		}
	})
}

function onToggle(p: any) {
	if (S.ExpandedGuildFolderStore.isFolderExpanded(p.folderId)) touch(p.folderId)
	const o = opts()
	if (!o.oneOpen) return
	const exp = [...realExp()]
	if (exp.length < 2) return
	const keep = recent.find(id => exp.includes(id)) ?? p.folderId
	setTimeout(() => {
		for (const id of exp) if (id !== keep) setExpanded(id, false)
	})
}

export function init() {
	lastGuild = S.SelectedGuildStore?.getGuildId?.()
	const change = () => refresh()
	S.ExpandedGuildFolderStore.addChangeListener(change)
	S.SortedGuildStore.addChangeListener(change)
	const unOpts = listen(change)
	const onToggleSet = (p: any) => onToggle(p)
	D.subscribe('TOGGLE_GUILD_FOLDER_EXPAND', onToggleSet)
	D.subscribe('SET_GUILD_FOLDER_EXPANDED', onToggleSet)
	D.subscribe('CHANNEL_SELECT', onSelect)
	refresh(true)
	return () => {
		S.ExpandedGuildFolderStore.removeChangeListener(change)
		S.SortedGuildStore.removeChangeListener(change)
		unOpts()
		D.unsubscribe('TOGGLE_GUILD_FOLDER_EXPAND', onToggleSet)
		D.unsubscribe('SET_GUILD_FOLDER_EXPANDED', onToggleSet)
		D.unsubscribe('CHANNEL_SELECT', onSelect)
		if (closing) clearTimeout(closing)
		if (railOff) clearTimeout(railOff)
		if (custom) {
			custom = false
			nudge()
		}
		shown = []
		display = []
		if (progress) progress.value = 0
		emit()
	}
}
