import { Settings } from './settings'
import { setFallback } from './speed'
import { watchViewer } from './viewer'

export interface Options {
	speed: number
}

const defaults: Options = { speed: 1 }

export default plugin<{ jsonStorage: Options }>({
	jsonStorage: { default: defaults },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage }) {
		cleanup(
			jsonStorage.subscribe(() => {
				setFallback({ ...defaults, ...jsonStorage.cache }.speed)
			}),
		)
		jsonStorage.get().then(v => {
			setFallback({ ...defaults, ...v }.speed)
		})
		watchViewer(cleanup)
	},
})
