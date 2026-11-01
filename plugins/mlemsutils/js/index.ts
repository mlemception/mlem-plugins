import { registerSettingsItem } from '@valenced/discord/modules/settings'
import { ModulePage } from './components/pages/ModulePage'
import { ModuleRoute } from './components/pages/route'
import { Settings } from './components/Settings'
import modules from './modules'
import { bindStorage, vstorage } from './storage'
import devtools from './stuff/devtools'
import type { MlemStorage } from './storage'

export default plugin<{ jsonStorage: MlemStorage }>({
	jsonStorage: { default: { modules: {} } },
	SettingsComponent: Settings,

	async start({ cleanup, jsonStorage }) {
		bindStorage(jsonStorage)
		cleanup(
			registerSettingsItem(ModuleRoute, {
				parent: 'mlemception.mlemsutils',
				type: 'route',
				useTitle: () => "mlem's utils",
				screen: { route: ModuleRoute, getComponent: () => ModulePage },
			} as any),
			devtools(),
			() => {
				for (const x of modules) x.storage.enabled && x.stop()
			},
		)

		const data = await jsonStorage.get()
		vstorage.modules = data?.modules ?? {}
		for (const x of modules) x.storage.enabled && x.start()
	},
})
