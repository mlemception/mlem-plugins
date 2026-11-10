import { Stores } from '@valenced/discord/flux'
import { getModuleWithImportedPath as byPath } from '@valenced/discord/utils/modules/finders'
import { lookupModule } from '@valenced/modules/finders'
import { withName, withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { beforeJSX, insteadJSX } from '@valenced/react/jsx-runtime'
import { createElement, Fragment } from 'react'
import { View } from 'react-native'
import { rea, ui } from './discord'
import { Probe } from './drag'
import { Settings } from './settings'
import { init, isShown, refresh, setRealList } from './state'
import { defaults, listen, opts, setStorage } from './store'
import { Home, Panel, RailFolder } from './ui'
import type { Options } from './store'

const S: any = new Proxy({}, { get: (_, k) => (Stores as any)[k] })
const bar = 'modules/guilds_bar/native'

function patchRail() {
	const store = S.SortedGuildStore
	const proto = Object.getPrototypeOf(store)
	const real = proto.getFastListGuildFolders
	setRealList(() => real.call(store))
	const cache = new WeakMap<object, any[]>()
	return instead(proto, 'getFastListGuildFolders', (args: any[], orig: any) => {
		const list = orig.apply(store, args)
		if (!Array.isArray(list) || !opts().sidebar) return list
		let out = cache.get(list)
		if (!out) {
			out = list.map(n =>
				n?.type === 'folder' && n.expanded && n.children?.length
					? { ...n, expanded: false, bfOpen: true }
					: n,
			)
			cache.set(list, out)
		}
		return out
	})
}

export default plugin<{ jsonStorage: Options }>({
	jsonStorage: { default: defaults },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage }) {
		cleanup(setStorage(jsonStorage))

		const [drawer] = lookupModule(
			withProps<any>('useIsHomeDrawerEnabled', 'HomeDrawerStateContext'),
		)
		ui.drawer = drawer?.useIsHomeDrawerEnabled

		cleanup(
			patchRail(),
			init(),
			listen(() => S.SortedGuildStore.emitChange?.()),
			byPath<any>('modules/panels/native/PanelsConfig.tsx', mod => {
				ui.panels = mod
			}),
			byPath<any>(`${bar}/GuildsBarDnDStore.tsx`, mod => {
				ui.dnd = mod.default
			}),
			byPath<any>(`${bar}/hooks/useGuildsBarGesture.tsx`, () => {
				ui.gestureId = lookupModule(withName<any>('useGuildsBarGesture'))[1]
			}),
			byPath<any>(`${bar}/GuildsBarGuild.tsx`, mod => {
				ui.Guild = mod.default
			}),
			byPath<any>(`${bar}/GuildsBarGuildFolder.tsx`, mod => {
				ui.Folder = mod.default
				ui.FolderBG = mod.GuildsBarGuildFolderBG
				cleanup(
					beforeJSX(mod.default, args => {
						const p = args[1] as any
						if (!p || p.isDragPreview) return args
						const o = opts()
						const open = o.sidebar && isShown(p.id)
						const icon = o.rail === 'folder' && !p.expanded
						if (!open && !icon) return args
						return [
							args[0],
							{ ...p, expanded: true, bfLook: open ? 'open' : 'icon' },
							args[2],
						] as any
					}),
				)
			}),
			byPath<any>(`${bar}/GuildsBarAnimatedItemWrapper.tsx`, mod => {
				cleanup(
					beforeJSX(mod.default, args => {
						const p = args[1] as any
						if (!p || p.isDragPreview) return args
						const o = opts()
						if (ui.side)
							return [
								args[0],
								{ ...p, selected: false, externalChildren: null },
								args[2],
							] as any
						if (p.id == null) return args
						const id = String(p.id)
						const folder = p.expanded
							? S.SortedGuildStore.getGuildFolderById?.(Number(id))
							: undefined
						if (!o.sidebar) {
							if (!folder || o.rail !== 'folder') return args
							if (S.ExpandedGuildFolderStore.isFolderExpanded(folder.folderId))
								return [
									RailFolder,
									{
										...p,
										as: args[0],
										folderId: folder.folderId,
										native: true,
									},
									args[2],
								] as any
						}
						const ext = folder
							? createElement(ui.FolderBG, {
									color: folder.folderColor ?? undefined,
									folderId: folder.folderId,
									totalItems: 0,
								})
							: p.externalChildren
						const q = {
							...p,
							externalChildren: o.sidebar
								? createElement(
										Fragment,
										null,
										ext,
										createElement(Probe, { id }),
									)
								: ext,
						}
						if (!folder) return [args[0], q, args[2]] as any
						if (isShown(folder.folderId))
							return [args[0], { ...q, selected: false }, args[2]] as any
						return [
							RailFolder,
							{ ...q, as: args[0], folderId: folder.folderId },
							args[2],
						] as any
					}),
				)
			}),
			byPath<any>(
				'modules/main_tabs_v2/native/tabs/guilds/HomePanelContent.tsx',
				mod => {
					ui.wrapSize = mod.useGuildWrapperSize
					cleanup(
						instead(mod.HomePanelContent, 'type', (args: any[], real: any) =>
							createElement(Home, { real, p: args[0] }),
						),
					)
				},
			),
		)

		const panel = (args: any[], jsx: any) => {
			const p = args[1] as any
			if (p?.nativeID === 'messages-parent-view') return jsx(Panel, p, args[2])
			return jsx(...args)
		}
		cleanup(insteadJSX(View, panel as any))
		const AV = rea()?.default?.View
		if (AV && AV !== View) cleanup(insteadJSX(AV, panel as any))

		jsonStorage.get().then(() => refresh())
	},
})
