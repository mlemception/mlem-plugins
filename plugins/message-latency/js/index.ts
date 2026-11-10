import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { after } from '@valenced/patcher'
import { barsIcon } from './icon'
import { colorsFor, defaults, latencyData, tooltip } from './latency'
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
								const m = row?.message
								const d = m && latencyData(m, s)
								if (d)
									m.roleIcon = {
										source: barsIcon(colorsFor(d.fill)),
										name: tooltip(d),
										alt: d.delta ?? 'Old Discord Android client',
										size: 16,
									}
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
