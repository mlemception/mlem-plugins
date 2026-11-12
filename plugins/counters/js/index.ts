import { Stores } from '@valenced/discord/flux'
import { getModules, lookupModule } from '@valenced/modules/finders'
import { withName, withProps } from '@valenced/modules/finders/filters'
import { beforeJSX } from '@valenced/react/jsx-runtime'
import { createElement } from 'react'
import { View } from 'react-native'
import { blockHeight, Counters, hasBlock } from './counters'
import { Settings } from './settings'
import { defaults, listen, setStorage, ver } from './store'
import type { Options } from './store'

function refreshRail() {
	try {
		const store = (Stores as any).SortedGuildStore
		const tree = store?.getGuildsTree?.()
		if (typeof tree?.version !== 'number') return
		tree.version++
		store.emitChange()
	} catch {}
}

let SEPARATOR = 6
const RAIL = 'guilds-bar-fast-list'

function Row({ row }: { row: any }) {
	return createElement(View, null, createElement(Counters), row)
}

let failed = false

type Fns = { itemSize: any; renderItem: any }
const cache = new WeakMap<object, { v: number; fns: Fns }>()

function wrap(itemSize: any, renderItem: any): Fns {
	const v = ver()
	const hit = cache.get(itemSize)
	if (hit && hit.v === v && hit.fns.renderItem.orig === renderItem)
		return hit.fns
	const fns: Fns = {
		itemSize(section: number, row: number) {
			const size = itemSize(section, row)
			return section === SEPARATOR && !failed ? size + blockHeight() : size
		},
		renderItem: Object.assign(
			(section: number, row: number) => {
				const el = renderItem(section, row)
				if (section !== SEPARATOR || failed || !hasBlock()) return el
				return createElement(Row, { row: el })
			},
			{ orig: renderItem },
		),
	}
	cache.set(itemSize, { v, fns })
	return fns
}

export default plugin<{ jsonStorage: Options }>({
	jsonStorage: { default: defaults },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage }) {
		const report = (e: unknown) => this.reportError(e)
		failed = false
		cleanup(setStorage(jsonStorage))

		const [consts] = lookupModule(
			withProps<any>('FastListRenderSections', 'GUILD_LIST_WIDTH'),
		)
		if (typeof consts?.FastListRenderSections?.SEPARATOR === 'number')
			SEPARATOR = consts.FastListRenderSections.SEPARATOR

		const unpatches: (() => unknown)[] = []
		let stopped = false

		const unsub = getModules(withName<any>('FastList'), FastList => {
			if (stopped || typeof FastList !== 'function') return
			unpatches.push(
				beforeJSX(FastList, (args: any) => {
					const props = args[1]
					if (props?.nativeID !== RAIL || failed) return args
					try {
						if (typeof props.itemSize !== 'function') return args
						const fns = wrap(props.itemSize, props.renderItem)
						const h = Math.round(blockHeight() * 10)
						return [args[0], { ...props, ...fns }, `counters-${h}`]
					} catch (e) {
						failed = true
						report(e)
						return args
					}
				}),
			)
			refreshRail()
		})

		cleanup(listen(refreshRail), () => {
			stopped = true
			unsub()
			for (const u of unpatches.splice(0)) u()
			refreshRail()
		})
	},
})
