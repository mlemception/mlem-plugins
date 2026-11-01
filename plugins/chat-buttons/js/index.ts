import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { after, instead } from '@valenced/patcher'
import { createElement } from 'react'
import { Hold, Row, setButton, skips, swapRow } from './bar'
import { Settings } from './manage'
import { defaults, setStorage } from './store'
import type { Options } from './store'

const path = 'modules/chat_input/native'

export default plugin<{ jsonStorage: Options }>({
	jsonStorage: { default: defaults },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage }) {
		setStorage(jsonStorage)
		jsonStorage.get()

		cleanup(
			getModuleWithImportedPath<any>(
				`${path}/action_buttons/ChatInputActionButton.tsx`,
				mod => {
					setButton(mod.default)
					cleanup(
						instead(mod.default, 'type', ([p], real) =>
							skips(p)
								? createElement(real, p)
								: createElement(Hold, { ...p, real }),
						),
					)
				},
			),
			getModuleWithImportedPath<any>(
				`${path}/action_buttons/ChatInputRightActions.tsx`,
				mod => {
					cleanup(
						after(mod.default, 'type', res => ({
							...res,
							type: Row,
							props: { ...res.props, as: res.type },
						})),
					)
				},
			),
			getModuleWithImportedPath<any>(`${path}/ChatInput.tsx`, mod => {
				cleanup(after(mod.default, 'type', swapRow))
			}),
		)
	},
})
