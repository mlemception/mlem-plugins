import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after, before } from '@valenced/patcher'
import { createElement } from 'react'
import { addButton, MathButton, watchButton } from './button'
import { Settings } from './settings'
import { solve } from './solve'

export interface Options {
	enabled: boolean
	button: boolean
}

const defaults: Options = {
	enabled: true,
	button: true,
}

export default plugin<{ jsonStorage: Options }>({
	jsonStorage: { default: defaults },
	SettingsComponent: Settings,

	start(api) {
		const { cleanup, jsonStorage } = api
		let s = defaults

		cleanup(
			jsonStorage.subscribe(() => {
				s = { ...defaults, ...jsonStorage.cache }
			}),
			getModules(
				withProps<any>('sendMessage', 'revealMessage'),
				mod => {
					cleanup(
						before(mod, 'sendMessage', args => {
							const msg = args[1]
							if (s.enabled && msg?.content)
								args[1] = { ...msg, content: solve(msg.content) }
							return args
						}),
					)
				},
				{ max: 1 },
			),
			watchButton(),
			getModuleWithImportedPath<any>(
				'modules/chat_input/native/ChatInput.tsx',
				mod => {
					cleanup(
						after(mod.default, 'type', res =>
							addButton(
								res,
								createElement(MathButton, { key: 'math', api: api as any }),
							),
						),
					)
				},
			),
		)

		jsonStorage.get().then(v => {
			s = { ...defaults, ...v }
		})
	},
})
