import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { createElement, useRef, useSyncExternalStore } from 'react'
import { View } from 'react-native'
import { menus, rea, ui, worklet } from './discord'

const S: any = new Proxy({}, { get: (_, k) => (Stores as any)[k] })

type State =
	| 'before'
	| 'after'
	| 'self'
	| 'convert-before'
	| 'convert-after'
	| 'drop-into'

interface Row {
	node: any
	x: number
	y: number
	w: number
	h: number
	side: boolean
}

export const railRefs = new Map<string, View>()
export const sideRefs = new Map<string, View>()
export const scroller: { ref: any; y: number } = { ref: null, y: 0 }

let drag: {
	node: any
	ox: number
	oy: number
	rows: Row[]
	size: number
	over?: { node: any; state: State }
	x: number
	y: number
	scroll0: number
	box?: { y: number; h: number; x: number; w: number }
	timer?: ReturnType<typeof setInterval>
} | null = null

let starting = false
let sv: any
let ver = 0
let current: any = null
const subs = new Set<() => void>()
const emit = () => {
	ver++
	for (const s of subs) s()
}
const sub = (l: () => void) => {
	subs.add(l)
	return () => {
		subs.delete(l)
	}
}

export const useDragging = () => {
	useSyncExternalStore(sub, () => ver)
	return current
}

let layer: View | null = null

const box = (v?: View | null) =>
	new Promise<{ x: number; y: number; w: number; h: number } | null>(res => {
		if (!v) return res(null)
		try {
			v.measureInWindow((x, y, w, h) => res(w || h ? { x, y, w, h } : null))
		} catch {
			res(null)
		}
	})

const tree = () => S.SortedGuildStore.getGuildsTree()
const nodeOf = (id: string | number) =>
	tree().getNode(id) ?? tree().getNode(Number(id))

async function measure() {
	const out: Row[] = []
	const jobs: Promise<void>[] = []
	for (const [id, v] of railRefs) {
		const n = nodeOf(id)
		if (!n || n.parentId != null) continue
		const node = n.type === 'folder' ? { ...n, expanded: false } : n
		jobs.push(
			box(v).then(b => {
				if (b) out.push({ node, ...b, side: false })
			}),
		)
	}
	for (const [id, v] of sideRefs) {
		const n = nodeOf(id)
		if (!n) continue
		jobs.push(
			box(v).then(b => {
				if (b) out.push({ node: n, ...b, side: true })
			}),
		)
	}
	await Promise.all(jobs)
	return out
}

function haptic(kind: string) {
	try {
		const h = menus().haptics
		h?.triggerHapticFeedback(h.HapticFeedbackTypes[kind])
	} catch {}
}

const dnd = () => ui.dnd?.getState?.()

const cell = (n: any) => ({
	recyclerKey: `bf-${n.id}`,
	layoutStart: 0,
	layoutSize: 60,
})

function setSpecs(v: Record<string, unknown>) {
	try {
		dnd()?.setStateShallow?.(v)
	} catch {}
}

export function stateFor(D: any, O: any, p: number): State | undefined {
	if (O.id === D.id) return 'self'
	const s: State = p < 0.5 ? 'before' : 'after'
	if (D.type === 'folder') {
		if (s === 'after') {
			if (O.type === 'folder') {
				if (O.expanded) return
			} else if (O.parentId != null) {
				const parent = nodeOf(O.parentId)
				const last = parent?.children?.[parent.children.length - 1]
				if (last && last.id !== O.id) return
			}
		}
		if (s === 'before' && O.type !== 'folder' && O.parentId != null) return
		return s
	}
	if (p > 0.35 && p < 0.65) {
		if (O.type === 'guild' && O.parentId == null)
			return s === 'before' ? 'convert-before' : 'convert-after'
		if (O.type === 'folder' && !O.expanded) return 'drop-into'
	}
	return s
}

let saver: any

function findSaver() {
	if (saver) return saver
	;[saver] = lookupModule(withProps<any>('saveGuildFolders'))
	if (saver) return saver
	const metro = valenced.modules.metro
	const id = ui.gestureId
	if (id == null) return
	const deps = metro.getModuleDependencies(id) ?? []
	for (const d of deps) {
		try {
			const ex = metro.isModuleInitialized(d)
				? metro.getInitializedModuleExports(d)
				: null
			if (ex?.saveGuildFolders) return (saver = ex)
		} catch {}
	}
	for (const d of deps) {
		if (metro.isModuleInitialized(d)) continue
		if ((metro.getModuleDependencies(d) ?? []).length > 16) continue
		try {
			const ex = __r(d)
			if (ex?.saveGuildFolders) return (saver = ex)
		} catch {}
	}
}

export function persist() {
	try {
		findSaver()?.saveGuildFolders?.(
			S.SortedGuildStore.getCompatibleGuildFolders(),
		)
	} catch {}
}

export function moveNode(
	sourceId: string | number,
	targetId: string | number,
	below: boolean,
	combine = false,
) {
	if (sourceId === targetId) return
	;(Dispatcher as any).dispatch({
		type: 'GUILD_MOVE_BY_ID',
		sourceId,
		targetId,
		moveToBelow: below,
		combine,
	})
	persist()
}

export async function begin(id: string | number, x: number, y: number) {
	if (drag || starting) return
	const node = nodeOf(id)
	if (!node || !sv) return
	starting = true
	const [o, rows, sbox] = await Promise.all([
		box(layer),
		measure(),
		box(scroller.ref),
	])
	starting = false
	if (!o || abort) {
		abort = false
		return
	}
	const self = rows.find(r => r.node.id === node.id)
	drag = {
		node,
		ox: o.x,
		oy: o.y,
		rows,
		size: self?.h ?? 60,
		x: pending?.x ?? x,
		y: pending?.y ?? y,
		scroll0: scroller.y,
		box: sbox ?? undefined,
	}
	pending = null
	current = node.id
	emit()
	haptic('DRAG_AND_DROP_START')
	try {
		dnd()?.dragDropInProgress?.set?.(true)
	} catch {}
	setSpecs({
		dragSpecs: { node, item: cell(node), itemSize: drag.size },
		overSpecs: undefined,
		dropSpecs: undefined,
	})
	sv.show.value = rea().withSpring(1, SPRING)
	drag.timer = setInterval(edge, 16)
	move(drag.x, drag.y)
	if (ended) {
		const drop = ended.drop
		ended = null
		end(drop)
	}
}

const SPRING = { mass: 0.5, damping: 15, stiffness: 120 }
let pending: { x: number; y: number } | null = null
let ended: { drop: boolean } | null = null
let abort = false

function edge() {
	if (!drag?.box || !scroller.ref) return
	const { box: b, x, y } = drag
	if (x < b.x - 8 || x > b.x + b.w + 8) return
	const zone = 56
	let d = 0
	if (y < b.y + zone) d = -Math.ceil(((b.y + zone - y) / zone) * 10)
	else if (y > b.y + b.h - zone)
		d = Math.ceil(((y - (b.y + b.h - zone)) / zone) * 10)
	if (!d) return
	const next = Math.max(0, scroller.y + d)
	if (next === scroller.y) return
	scroller.ref.scrollTo?.({ y: next, animated: false })
	scroller.y = next
	hover(x, y)
}

function hover(x: number, y: number) {
	if (!drag) return
	const shift = scroller.y - drag.scroll0
	const sideRows = drag.rows.filter(r => r.side)
	const sideLeft = sideRows.length
		? Math.min(...sideRows.map(r => r.x))
		: Number.POSITIVE_INFINITY
	const inSide = x >= sideLeft - 4
	const list = drag.rows.filter(r => r.side === inSide)
	let over: { node: any; state: State } | undefined
	if (list.length && x <= sideLeft + 96) {
		let best: Row | undefined
		let dist = Number.POSITIVE_INFINITY
		for (const r of list) {
			const top = r.side ? r.y - shift : r.y
			const d = y < top ? top - y : y > top + r.h ? y - (top + r.h) : 0
			if (d < dist) {
				dist = d
				best = r
			}
		}
		if (best && dist < 80) {
			const top = best.side ? best.y - shift : best.y
			const p = Math.min(1, Math.max(0, (y - top) / best.h))
			const st = stateFor(drag.node, best.node, p)
			if (st && st !== 'self') over = { node: best.node, state: st }
		}
	}
	const prev = drag.over
	if (prev?.node.id === over?.node.id && prev?.state === over?.state) return
	drag.over = over
	if (over) haptic('DRAG_AND_DROP_MOVE')
	setSpecs({
		overSpecs: over
			? { node: over.node, item: cell(over.node), state: over.state }
			: undefined,
	})
	const shrink =
		over &&
		(over.state === 'drop-into' ||
			over.state === 'convert-before' ||
			over.state === 'convert-after')
	sv.small.value = rea().withSpring(shrink ? 1 : 0, SPRING)
}

export function move(x: number, y: number) {
	if (!drag) {
		if (starting) pending = { x, y }
		return
	}
	drag.x = x
	drag.y = y
	sv.px.value = x - drag.ox
	sv.py.value = y - drag.oy
	hover(x, y)
}

export function cancelStart() {
	if (starting) abort = true
}

export function end(drop: boolean) {
	if (!drag && starting) {
		ended = { drop }
		return true
	}
	const d = drag
	drag = null
	current = null
	emit()
	if (d?.timer) clearInterval(d.timer)
	if (sv) {
		sv.show.value = 0
		sv.small.value = 0
	}
	try {
		dnd()?.dragDropInProgress?.set?.(false)
	} catch {}
	if (!d) return false
	const o = d.over
	if (drop && o) {
		const D = d.node
		const O = o.node
		let below = o.state === 'after'
		const combine =
			o.state === 'convert-before' ||
			o.state === 'convert-after' ||
			o.state === 'drop-into'
		let target: string | number = O.id
		if (D.type === 'folder' && O.type !== 'folder' && O.parentId != null)
			target = O.parentId
		else if (O.type === 'folder' && O.expanded && below) {
			below = false
			target = O.children?.[0]?.id ?? O.id
		}
		try {
			moveNode(D.id, target, below, combine)
		} catch {}
		haptic('DRAG_AND_DROP_END')
	}
	setSpecs({
		dragSpecs: undefined,
		overSpecs: undefined,
		dropSpecs: undefined,
	})
	return true
}

export const dragging = () => drag != null || starting

export function DragLayer() {
	const R = rea()
	const id = useDragging()
	const last = useRef<any>(null)
	if (id != null) last.current = nodeOf(id) ?? last.current
	const px = R.useSharedValue(0)
	const py = R.useSharedValue(0)
	const show = R.useSharedValue(0)
	const small = R.useSharedValue(0)
	sv = { px, py, show, small }
	const ghost = R.useAnimatedStyle(
		worklet(
			'function bfGhost(){const{px,py,s,m}=this.__closure;const k=1-0.67*m.value;return{opacity:s.value,transform:[{translateX:px.value-36+10*m.value},{translateY:py.value-30-10*m.value},{scale:k}]};}',
			{ px, py, s: show, m: small },
			() => ({
				opacity: show.value,
				transform: [
					{ translateX: px.value - 36 + 10 * small.value },
					{ translateY: py.value - 30 - 10 * small.value },
					{ scale: 1 - 0.67 * small.value },
				],
			}),
		),
	)
	const AView = R.default.View
	const n = last.current
	let preview: any = null
	if (n?.type === 'folder' && ui.Folder) {
		const f = S.SortedGuildStore.getGuildFolderById?.(n.id)
		preview = createElement(ui.Folder, {
			id: n.id,
			expanded: false,
			name: f?.folderName ?? n.name,
			color: f?.folderColor ?? n.color,
			childNodes: n.children,
			isDragPreview: true,
			hideExpandedChildren: true,
		})
	} else if (n && ui.Guild) {
		preview = createElement(ui.Guild, { guildId: n.id, isDragPreview: true })
	}
	return (
		<View
			ref={v => {
				layer = v
			}}
			collapsable={false}
			pointerEvents="none"
			style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
		>
			<AView
				style={[
					{ position: 'absolute', left: 0, top: 0, width: 72, height: 60 },
					ghost,
				]}
			>
				{preview}
			</AView>
		</View>
	)
}

export function Probe({ id }: { id: string }) {
	return (
		<View
			ref={v => {
				if (v) railRefs.set(id, v)
				else railRefs.delete(id)
			}}
			collapsable={false}
			pointerEvents="none"
			style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
		/>
	)
}
