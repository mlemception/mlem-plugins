import { lookupModule } from '@valenced/modules/finders'
import { withName, withProps } from '@valenced/modules/finders/filters'

export const ui: {
	Guild?: any
	Folder?: any
	panels?: any
	wrapSize?: () => number
	drawer?: () => boolean
	side?: boolean
	dnd?: any
	FolderBG?: any
	gestureId?: number
	badge?: (o: { mentionCount: number; isMentionLowImportance: boolean }) => any
} = {}

let R: any
let GH: any
let menu: any
let haptics: any
let guildItems: any
let folderItems: any

export const menus = () => {
	if (!menu)
		[menu] = lookupModule(
			withProps<any>(
				'showContextMenu',
				'useContextMenuState',
				'hideContextMenu',
			),
		)
	if (!haptics)
		[haptics] = lookupModule(
			withProps<any>('triggerHapticFeedback', 'HapticFeedbackTypes'),
		)
	if (!guildItems)
		[guildItems] = lookupModule(withName<any>('getGuildsBarGuildMenuItems'))
	if (!folderItems)
		[folderItems] = lookupModule(withProps<any>('getGuildFolderMenuItems'))
	return { menu, haptics, guildItems, folderItems }
}

export function buzz(kind: 'IMPACT_LIGHT' | 'IMPACT_MEDIUM') {
	try {
		const h = menus().haptics
		h?.triggerHapticFeedback(h.HapticFeedbackTypes[kind])
	} catch {}
}

export const rea = () => {
	if (!R)
		[R] = lookupModule(
			withProps<any>('useAnimatedStyle', 'withTiming', 'makeMutable'),
		)
	return R
}

export const gh = () => {
	if (!GH) [GH] = lookupModule(withProps<any>('GestureDetector', 'Gesture'))
	return GH
}

const hash = (s: string) => {
	let h = 5381
	for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) % 2147483647
	return 9000000000000 + h
}

export function worklet<T extends (...a: any[]) => any>(
	code: string,
	closure: Record<string, unknown>,
	js: T,
): T {
	const f = js as any
	f.__closure = closure
	f.__workletHash = hash(code)
	f.__initData = { code }
	return js
}

export function timing(open: boolean) {
	const c = ui.panels?.ANDROID_PANELS_ANIMATION_CONFIG
	const t = open ? c?.nonSwipeSidePanelOpen : c?.nonSwipeSidePanelClose
	return t ?? { duration: open ? 250 : 200 }
}
