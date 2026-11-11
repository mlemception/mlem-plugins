import { AppState } from 'react-native'
import { refreshSession } from './auth'
import { pullMine, refreshIndex } from './data'
import { me } from './discord'
import { patchMessageSheet, patchProfile } from './hooks'
import { dropFooters } from './media'
import { Settings } from './settings'
import { connected, defaults, init } from './store'
import { flushSoon } from './sync'
import type { Saved } from './store'

function warm() {
	if (!me() || !connected()) return
	refreshIndex()
	flushSoon()
	pullMine()
}

export default plugin<{ jsonStorage: Saved }>({
	jsonStorage: { default: defaults },
	SettingsComponent: Settings,

	async start({ cleanup, jsonStorage }) {
		await init(jsonStorage)

		cleanup(patchMessageSheet(), dropFooters)
		patchProfile(cleanup)

		const first = setTimeout(() => {
			warm()
			if (connected()) refreshSession()
		}, 5000)
		const sub = AppState.addEventListener('change', s => {
			if (s === 'active') warm()
		})
		cleanup(
			() => clearTimeout(first),
			() => sub.remove(),
		)
	},
})
