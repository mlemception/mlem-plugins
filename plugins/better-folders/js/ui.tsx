import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { ReactNativeSafeAreaContext as SafeArea } from '@valenced/externals/react-native-safe-area-context'
import {
	createElement,
	Fragment,
	useEffect,
	useMemo,
	useRef,
	useSyncExternalStore,
} from 'react'
import { Dimensions, ScrollView, StyleSheet, View } from 'react-native'
import { buzz, gh, menus, rea, timing, ui, worklet } from './discord'
import {
	begin,
	DragLayer,
	dragging,
	end,
	InSidebar,
	move,
	moveNode,
	scroller,
	sideRefs,
	useDragging,
} from './drag'
import { icon } from './icon'
import { closeAll, homeItem, prog, useDisplay } from './state'
import { useOptions } from './store'
import type { Group } from './state'

const railWidth = () => {
	try {
		return ui.wrapSize?.() ?? 72
	} catch {
		return 72
	}
}

const usesDrawer = () => {
	try {
		return !!ui.drawer?.()
	} catch {
		return false
	}
}

export function Home({ real, p }: { real: any; p: any }) {
	const w = railWidth()
	const drawer = usesDrawer()
	useEffect(() => {
		if (drawer) return
		homeItem(true)
		return () => homeItem(false)
	}, [drawer])
	return (
		<>
			{createElement(real, p)}
			{!drawer && <Sidebar w={w} />}
			{!drawer && <DragLayer />}
		</>
	)
}

export function Panel(p: any) {
	const R = rea()
	const w = railWidth()
	const drawer = usesDrawer()
	const base = (StyleSheet.flatten(p.style)?.left as number) ?? w
	const progress = prog()
	const shift = R.useAnimatedStyle(
		worklet(
			'function bfPanel(){const{p,b,w,off}=this.__closure;return{left:off?b:b+p.value*w};}',
			{ p: progress, b: base, w, off: drawer },
			() => ({ left: drawer ? base : base + progress.value * w }),
		),
	)
	return createElement(R.default.View, { ...p, style: [p.style, shift] })
}

function Sidebar({ w }: { w: number }) {
	const R = rea()
	const o = useOptions()
	const list = useDisplay()
	const progress = prog()
	const top = SafeArea.useSafeAreaInsets().top
	const look = R.useAnimatedStyle(
		worklet(
			'function bfSide(){const{p,w}=this.__closure;const v=p.value;return{opacity:0.35+0.65*v,transform:[{translateX:(v-1)*w*0.22}]};}',
			{ p: progress, w },
			() => ({
				opacity: 0.35 + 0.65 * progress.value,
				transform: [{ translateX: (progress.value - 1) * w * 0.22 }],
			}),
		),
	)

	const seen = useRef(0)
	const fade = seen.current > 0
	seen.current = list.length
	const AView = R.default.View
	const many = list.length > 1
	const header = o.header === 'always' || (o.header === 'many' && many)

	const body = (
		<AView
			style={[
				{ position: 'absolute', top: 0, bottom: 0, left: w, width: w },
				look,
			]}
			pointerEvents={list.length ? 'auto' : 'none'}
		>
			<ScrollView
				ref={(v: any) => {
					scroller.ref = v
				}}
				onScroll={(e: any) => {
					scroller.y = e.nativeEvent.contentOffset.y
				}}
				scrollEventThrottle={16}
				showsVerticalScrollIndicator={false}
				contentContainerStyle={{ paddingTop: top, paddingBottom: 96 }}
				overScrollMode="never"
			>
				{list.map((g, i) => (
					<Folder
						key={g.id}
						g={g}
						header={header}
						names={o.names}
						first={i === 0}
						w={w}
						R={R}
						fade={fade}
					/>
				))}
			</ScrollView>
		</AView>
	)

	return (
		<InSidebar.Provider value>
			{o.swipe ? <Swipe w={w}>{body}</Swipe> : body}
		</InSidebar.Provider>
	)
}

function Swipe({ w, children }: { w: number; children: any }) {
	const G = gh()
	const R = rea()
	const progress = prog()
	const start = useRef(1)
	const gesture = useMemo(() => {
		if (!G?.Gesture) return null
		return G.Gesture.Pan()
			.runOnJS(true)
			.activeOffsetX([-14, 9999])
			.failOffsetY([-12, 12])
			.onStart(() => {
				start.current = progress.value
			})
			.onUpdate((e: any) => {
				const dx = Math.min(0, e.translationX)
				progress.value = Math.max(0, start.current + dx / w)
			})
			.onEnd((e: any) => {
				const shut = e.translationX < -w * 0.4 || e.velocityX < -600
				if (shut) closeAll()
				else progress.value = R.withTiming(1, timing(true))
			})
	}, [G, w])
	if (!gesture) return children
	return <G.GestureDetector gesture={gesture}>{children}</G.GestureDetector>
}

function Folder({
	g,
	header,
	names,
	first,
	w,
	R,
	fade,
}: {
	g: Group
	header: boolean
	names: boolean
	first: boolean
	w: number
	R: any
	fade: boolean
}) {
	const Guild = ui.Guild
	const F = ui.Folder
	const Text = (Design as any).Text
	const AView = R.default.View
	const enter = useMemo(
		() =>
			fade ? R.FadeIn?.duration(170).easing(timing(true).easing) : undefined,
		[],
	)
	const leave = useMemo(() => R.FadeOut?.duration(110), [])
	const bg = useFolderColor(g.color)
	const label = header && names && !!g.name && Text
	const lifted = useDragging() === g.id
	return (
		<AView
			entering={enter}
			exiting={leave}
			style={{
				width: w,
				alignItems: 'center',
				marginTop: first ? 0 : GAP,
				paddingTop: GAP / 2,
				paddingBottom: GAP / 2,
			}}
		>
			<View
				pointerEvents="none"
				style={{
					position: 'absolute',
					top: 0,
					bottom: 0,
					left: (w - BG) / 2,
					width: BG,
					borderRadius: 16,
					backgroundColor: bg,
				}}
			/>
			{header && F && (
				<Hold w={w} folder={g}>
					<View style={{ height: HEAD, width: w, overflow: 'hidden' }}>
						<View style={{ marginTop: (HEAD - ROW) / 2 }}>
							<SideFolder
								id={g.id}
								expanded
								name={g.name}
								color={g.color ?? undefined}
								childNodes={g.node.children}
							/>
						</View>
					</View>
				</Hold>
			)}
			{label && (
				<Text
					variant="text-xxs/semibold"
					color="text-muted"
					numberOfLines={1}
					style={{
						opacity: lifted ? 0 : 1,
						maxWidth: BG - 6,
						marginTop: -3,
						marginBottom: 3,
						textAlign: 'center',
					}}
				>
					{g.name}
				</Text>
			)}
			{Guild &&
				g.guildIds.map(id => (
					<Hold key={id} w={w} guildId={id}>
						{createElement(Guild, { guildId: id })}
					</Hold>
				))}
		</AView>
	)
}

const ICON = 48
const ROW = 60
const HEAD = 32
const GAP = 12
const BG = 56

const hex = (n: number) =>
	`#${(n >>> 0).toString(16).padStart(6, '0').slice(-6)}`

function useFolderColor(color?: number | null) {
	const D = Design as any
	const t = (Tokens as any).default ?? Tokens
	const base = D.useToken?.(t.colors.GUILD_FOLDER_BACKGROUND)
	const alpha = D.useToken?.(t.modules?.mobile?.GUILD_FOLDER_COLOR_OPACITY)
	if (color == null) return base
	const a = Math.round((typeof alpha === 'number' ? alpha : 0.15) * 255)
	return hex(color) + a.toString(16).padStart(2, '0')
}

function Hold({
	w,
	guildId,
	folder,
	children,
}: {
	w: number
	guildId?: string
	folder?: Group
	children: any
}) {
	const G = gh()
	const { menu } = menus()
	const state = menu?.useContextMenuState?.()
	const ref = useRef<View>(null)
	const dragId = guildId ?? folder?.id
	useEffect(
		() => () => {
			if (dragId != null && dragging()) end(false)
		},
		[dragId],
	)
	const gesture = useMemo(() => {
		if (!G?.Gesture || !state) return null
		let items: any[] = []
		let start = { x: 0, y: 0 }
		let pulling = false
		const close = (cancel?: boolean) => {
			const i = state.activeIndex.get()
			state.activeIndex.set(-1)
			menus().menu.hideContextMenu()
			if (!cancel) items[i]?.action?.()
		}
		const show = () => {
			const { menu: m, guildItems, folderItems } = menus()
			let title: string | undefined
			let key = ''
			try {
				if (folder) {
					items = folderItems?.getGuildFolderMenuItems?.(folder.id) ?? []
					title = folder.name ?? undefined
					key = String(folder.id)
				} else if (guildId) {
					const guild = S.GuildStore.getGuild(guildId)
					items = [
						...(guildItems?.(
							guildId,
							S.SortedGuildStore.getGuildsTree().version,
						) ?? []),
					]
					const parent =
						S.SortedGuildStore.getGuildsTree().getNode(guildId)?.parentId
					if (parent != null)
						items.push({
							IconComponent: icon('DoorExitIcon'),
							label: 'Remove from folder',
							action: () => moveNode(guildId, parent, true),
						})
					title = guild?.name
					key = guildId
				}
			} catch {}
			if (!items?.length) return
			ref.current?.measureInWindow((x, y, ww, hh) => {
				const top = y + (hh - ICON) / 2
				const left = x + (ww - ICON) / 2
				const { height } = Dimensions.get('window')
				const below = top < height * 0.65
				m.resetContextMenuState?.(state)
				buzz('IMPACT_MEDIUM')
				m.showContextMenu({
					key,
					title,
					items,
					x: left + ICON + 12,
					y: below ? top : height - top - ICON,
					positionX: 'left',
					positionY: below ? 'below' : 'above',
					width: ICON,
					height: ICON,
					state,
					dividerIndexes: [],
					keyboardShouldPersistTaps: 'never',
					requestClose: close,
					onClose: () => {},
				})
			})
		}
		return G.Gesture.Pan()
			.runOnJS(true)
			.activateAfterLongPress(500)
			.onStart((e: any) => {
				start = { x: e.absoluteX, y: e.absoluteY }
				pulling = false
				show()
			})
			.onUpdate((e: any) => {
				if (dragId == null) return
				if (!pulling) {
					const dx = e.absoluteX - start.x
					const dy = e.absoluteY - start.y
					if (dx * dx + dy * dy < 100) return
					pulling = true
					try {
						menus().menu.hideContextMenu()
					} catch {}
					begin(dragId, e.absoluteX, e.absoluteY)
					return
				}
				move(e.absoluteX, e.absoluteY)
			})
			.onEnd(() => {
				if (pulling) end(true)
			})
			.onFinalize((_: any, ok: boolean) => {
				if (pulling && dragging()) end(!!ok)
				pulling = false
			})
	}, [G, state, guildId, folder?.id])
	const body = (
		<View
			ref={v => {
				;(ref as any).current = v
				if (!guildId) return
				if (v) sideRefs.set(guildId, v)
				else sideRefs.delete(guildId)
			}}
			collapsable={false}
			style={{
				width: w,
				alignItems: 'center',
			}}
		>
			{children}
		</View>
	)
	if (!gesture) return body
	return <G.GestureDetector gesture={gesture}>{body}</G.GestureDetector>
}

function SideFolder(p: any) {
	ui.side = true
	try {
		return ui.Folder.type(p)
	} finally {
		ui.side = false
	}
}

const S: any = new Proxy({}, { get: (_, k) => (Stores as any)[k] })

function folderState(id: number) {
	const f = S.SortedGuildStore.getGuildFolderById?.(id)
	const ids: string[] = f?.guildIds ?? []
	const all = S.GuildReadStateStore.getMutableGuildStates?.() ?? {}
	const sel = S.SelectedGuildStore.getGuildId()
	let unread = false
	let high = 0
	let low = 0
	for (const g of ids) {
		const st = all[g]
		if (!st) continue
		unread ||= !!st.unread
		high += st.highImportanceMentionCount ?? 0
		low += st.lowImportanceMentionCount ?? 0
	}
	return `${unread ? 1 : 0}|${high}|${low}|${sel && ids.includes(sel) ? 1 : 0}`
}

function useFolderState(id: number) {
	const sub = useMemo(
		() => (cb: () => void) => {
			const stores = [
				S.GuildReadStateStore,
				S.SelectedGuildStore,
				S.SortedGuildStore,
			]
			for (const s of stores) s.addChangeListener(cb)
			return () => {
				for (const s of stores) s.removeChangeListener(cb)
			}
		},
		[],
	)
	const [u, h, l, sel] = useSyncExternalStore(sub, () => folderState(id))
		.split('|')
		.map(Number)
	return { unread: !!u, high: h, low: l, selected: !!sel }
}

export function RailFolder({ as, folderId, native, ...p }: any) {
	const st = useFolderState(folderId)
	const mentions = st.high + st.low
	const b =
		ui.badge?.({
			mentionCount: mentions,
			isMentionLowImportance: st.high === 0 && st.low > 0,
		}) ?? {}
	if (native) return createElement(as, p)
	return createElement(as, {
		...p,
		selected: st.selected,
		unread: st.unread && !st.selected,
		externalChildren: createElement(
			Fragment,
			null,
			p.externalChildren,
			b.badge,
		),
		cutouts: b.cutouts,
	})
}
