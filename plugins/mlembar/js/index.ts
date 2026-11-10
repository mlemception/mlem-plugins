import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { instead } from '@valenced/patcher'
import { createElement } from 'react'
import { Background, Bell, Nameplate } from './bar'
import { Settings } from './settings'
import { defaults, setStorage } from './store'
import type { ComponentType } from 'react'
import type { Options } from './store'

const path = 'modules/main_tabs_v2/native/you_bar'

function find(mod: any, name: string): [any, string] | undefined {
	const all = [mod?.default, ...Object.values(mod ?? {})]
	const named = (f: any) => typeof f === 'function' && f.name === name
	for (const x of all) {
		if (!x) continue
		if (named(x.type)) return [x, 'type']
		if (named(x.render)) return [x, 'render']
	}
	for (const [k, v] of Object.entries(mod ?? {})) if (named(v)) return [mod, k]
	for (const x of all) {
		if (typeof x?.type === 'function') return [x, 'type']
		if (typeof x?.render === 'function') return [x, 'render']
	}
}

export default plugin<{ jsonStorage: Options }>({
	jsonStorage: { default: defaults },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage }) {
		cleanup(setStorage(jsonStorage))

		const hook = (name: string, wrap: ComponentType<any>) =>
			getModuleWithImportedPath<any>(`${path}/${name}.tsx`, mod => {
				const at = find(mod, name)
				if (!at) return
				const [parent, key] = at
				cleanup(
					instead(parent, key, (args: any[], real: any) =>
						createElement(wrap, { p: args[0], real }),
					),
				)
			})

		cleanup(
			hook('YouBarBackground', Background),
			hook('YouBarNameplate', Nameplate),
			hook('YouBarNotificationsButton', Bell),
		)
	},
})
