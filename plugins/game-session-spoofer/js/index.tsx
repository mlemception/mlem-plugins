import TableRowAssetIcon from '@valenced/components/TableRowAssetIcon'
import {
	addSettingsItemToSection,
	onSettingsModulesLoaded,
	refreshSettings,
	registerSettingsItem,
} from '@valenced/discord/modules/settings'
import { Page, trailing } from './page'
import { init } from './session'
import { defaults, hasStorage, setStorage, useData } from './store'
import type { PluginApi } from '@valenced/plugins/types'
import type { Data } from './store'

const ROUTE = 'MLEM_GAME_SESSION'

function Settings({ api }: { api: PluginApi<{ jsonStorage: Data }> }) {
	if (!hasStorage()) setStorage(api.jsonStorage)
	const ready = api.jsonStorage.use()
	useData()
	if (!ready) return null
	return <Page />
}

export default plugin<{ jsonStorage: Data }>({
	jsonStorage: { default: defaults },
	SettingsComponent: Settings,

	async start({ cleanup, jsonStorage }) {
		cleanup(setStorage(jsonStorage))
		await jsonStorage.get()

		cleanup(
			init(),
			onSettingsModulesLoaded(() => {
				cleanup(
					registerSettingsItem(ROUTE, {
						parent: null,
						type: 'route',
						IconComponent: () => (
							<TableRowAssetIcon name="GameControllerIcon" />
						),
						useTitle: () => 'Game Session',
						useTrailing: trailing,
						screen: { route: ROUTE, getComponent: () => Page },
					} as any),
				)
				try {
					cleanup(addSettingsItemToSection('VALENCED', ROUTE), refreshSettings)
					refreshSettings()
				} catch {}
			}),
		)
	},
})
