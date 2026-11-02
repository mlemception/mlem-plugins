import { Settings } from './settings'
import { watchViewer } from './viewer'

export default plugin({
	start({ cleanup }) {
		watchViewer(cleanup)
	},
	SettingsComponent: Settings,
})
