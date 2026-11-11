import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { after, before } from '@valenced/patcher'
import {
	cloneElement,
	createElement,
	isValidElement,
	useSyncExternalStore,
} from 'react'
import { connect } from './auth'
import {
	authorOptedOut,
	hasReposts,
	onIndex,
	refreshIndex,
	refreshList,
	UNKNOWN_RECHECK,
} from './data'
import { assetIcon, me } from './discord'
import { RepostIcon } from './icon'
import { RepostsPage } from './page'
import { isReposted, repost, repostable, unrepost } from './sync'

type Cleanup = () => void

const nameOf = (t: any) =>
	typeof t === 'string'
		? t
		: (t?.displayName ?? t?.name ?? t?.type?.name ?? t?.render?.name)

const kids = (el: any): any[] => {
	const c = el?.props?.children
	return Array.isArray(c) ? c : c == null ? [] : [c]
}

function findAll(node: any, name: string, out: any[] = [], depth = 0) {
	if (!node || depth > 10) return out
	if (Array.isArray(node)) {
		for (const n of node) findAll(n, name, out, depth)
		return out
	}
	if (!isValidElement(node)) return out
	if (nameOf(node.type) === name) out.push(node)
	return findAll((node.props as any).children, name, out, depth + 1)
}

function replace(node: any, target: any, next: any, depth = 0): any {
	if (node === target) return next
	if (!isValidElement(node) || depth > 10) return node
	const list = kids(node)
	let changed = false
	const mapped = list.map(k => {
		const r = replace(k, target, next, depth + 1)
		if (r !== k) changed = true
		return r
	})
	return changed ? cloneElement(node, undefined, ...mapped) : node
}

const iconName = (row: any) =>
	nameOf(row?.props?.icon?.props?.IconComponent) ?? ''

function rowsFor(Row: any, msg: any) {
	const close = () => ActionSheetActionCreators.hideActionSheet()
	const icon = (C: any) =>
		createElement(Row.Icon ?? 'View', { IconComponent: C })
	if (isReposted(msg.id))
		return [
			createElement(Row, {
				key: 'reposts-undo',
				label: 'Remove Repost',
				icon: icon(RepostIcon),
				onPress: () => {
					close()
					unrepost(msg.id)
				},
			}),
		]
	if (authorOptedOut(msg.author.id))
		return [
			createElement(Row, {
				key: 'reposts-off',
				label: 'Repost',
				subLabel: "They've turned off reposts",
				icon: icon(RepostIcon),
				disabled: true,
				onPress: () => {},
			}),
		]
	return [
		createElement(Row, {
			key: 'reposts-repost',
			label: 'Repost',
			icon: icon(RepostIcon),
			onPress: () => {
				close()
				repost(msg, false, connect)
			},
		}),
		createElement(Row, {
			key: 'reposts-anon',
			label: 'Repost Anonymously',
			icon: icon(assetIcon('EyeSlashIcon')),
			onPress: () => {
				close()
				repost(msg, true, connect)
			},
		}),
	]
}

function inject(tree: any, msg: any) {
	const groups = findAll(tree, 'ActionSheetRowGroup')
	if (!groups.length) return tree
	let group = groups[0]
	let at = -1
	for (const g of groups) {
		const rows = kids(g)
		const i = rows.findIndex(r => /Forward/i.test(iconName(r)))
		const j = i >= 0 ? i : rows.findIndex(r => /Reply/i.test(iconName(r)))
		if (j >= 0) {
			group = g
			at = j
			break
		}
	}
	const rows = kids(group)
	const Row = rows.find(r => isValidElement(r))?.type
	if (!Row) return tree
	const extra = rowsFor(Row, msg)
	const next = [...rows]
	next.splice(at >= 0 ? at + 1 : next.length, 0, ...extra)
	return replace(tree, group, cloneElement(group, undefined, ...next))
}

const wrapped = new WeakMap<any, any>()

function wrapSheet(Sheet: any) {
	let W = wrapped.get(Sheet)
	if (!W) {
		W = (props: any) => {
			const tree = Sheet(props)
			try {
				const msg = props?.message
				return msg && repostable(msg) ? inject(tree, msg) : tree
			} catch {
				return tree
			}
		}
		W.displayName = Sheet.displayName ?? Sheet.name
		wrapped.set(Sheet, W)
	}
	return W
}

export function patchMessageSheet(): Cleanup {
	return before(ActionSheetActionCreators as any, 'openLazy', (args: any[]) => {
		const [lazy, key] = args
		if (key !== 'MessageLongPressActionSheet' || !lazy?.then) return args
		refreshIndex(false, 60_000)
		args[0] = lazy.then((mod: any) =>
			typeof mod?.default === 'function'
				? { ...mod, default: wrapSheet(mod.default) }
				: mod,
		)
		return args
	})
}

let viewing: string | undefined
const PROFILE = 'modules/user_profile/native/UserProfileContent.tsx'
const PAGES = 'modules/user_profile/native/UserProfileTabPages.tsx'

export function patchProfile(cleanup: (...c: Cleanup[]) => void) {
	cleanup(
		getModuleWithImportedPath<any>(PROFILE, mod => {
			const target = mod?.default?.type ? mod.default : mod
			const key = mod?.default?.type ? 'type' : 'default'
			cleanup(
				before(target, key, (args: any[]) => {
					viewing = args[0]?.user?.id
					try {
						const uid = viewing
						if (uid && uid !== me()) {
							if (hasReposts(uid)) {
								refreshIndex()
								refreshList(uid)
							} else refreshIndex(false, UNKNOWN_RECHECK)
						}
					} catch {}
					return args
				}),
				after(target, key, (res: any) => {
					viewing = undefined
					return res
				}),
			)
		}),
		getModuleWithImportedPath<any>(PAGES, mod => {
			if (typeof mod?.useMeasuredTabItems !== 'function') return
			cleanup(
				before(mod, 'useMeasuredTabItems', (args: any[]) => {
					const items = args[0]
					const uid = viewing ?? me()
					const show = useSyncExternalStore(
						onIndex,
						() => !!uid && hasReposts(uid),
					)
					try {
						if (!show || !uid || !Array.isArray(items)) return args
						const ids = items.map((x: any) => x?.id)
						if (!ids.includes('main') || ids.includes('reposts')) return args
						const page = createElement(RepostsPage, { key: 'reposts', uid })
						return [
							[...items, { id: 'reposts', label: 'Reposts', page }],
							...args.slice(1),
						]
					} catch {
						return args
					}
				}),
			)
		}),
	)
}
