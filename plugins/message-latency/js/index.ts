import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { after } from '@valenced/patcher'
import { check, defaults } from './latency'
import { Settings } from './settings'
import type { Options } from './latency'

export default plugin<{ jsonStorage: Options }>({
	jsonStorage: { default: defaults },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage }) {
		let s = defaults

		cleanup(
			jsonStorage.subscribe(() => {
				s = { ...defaults, ...jsonStorage.cache }
			}),
			getModuleWithImportedPath<any>(
				'modules/messages/native/renderer/RowGenerator.tsx',
				mod => {
					cleanup(
						after(mod.default.prototype, 'generate', (row: any) => {
							try {
								if (row?.message) check(row.message, s)
							} catch {}
							return row
						}),
					)
				},
			),
		)

		jsonStorage.get().then(v => {
			s = { ...defaults, ...v }
		})
	},
})
