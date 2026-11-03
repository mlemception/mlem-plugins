import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { after, HookPriority, instead } from '@valenced/patcher'
import { afterJSX } from '@valenced/react/jsx-runtime'
import { createElement } from 'react'
import {
	forced,
	Hold,
	markOwn,
	Popup,
	Row,
	setButton,
	setMenu,
	skips,
	swapRow,
} from './bar'
import { Settings } from './manage'
import { Sheet, setHaptics } from './menu'
import { defaults, setStorage } from './store'
import type { Options } from './store'

const path = 'modules/chat_input/native'
const menu = 'design/components/ContextMenu/native'

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
						instead(
							mod.default,
							'type',
							([p], real) =>
								skips(p)
									? createElement(real, p)
									: createElement(Hold, { ...p, real }),
							{ priority: HookPriority.HIGHEST },
						),
					)
				},
			),
			getModuleWithImportedPath<any>(
				`${path}/action_buttons/ChatInputActions.tsx`,
				mod => {
					cleanup(after(mod.default, 'type', markOwn))
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
			getModuleWithImportedPath<any>(`${menu}/ContextMenu.native.tsx`, mod => {
				setMenu(mod.ContextMenu)
				cleanup(
					afterJSX(
						mod.ContextMenu,
						el => el && ({ ...el, type: Popup } as any),
					),
				)
			}),
			getModuleWithImportedPath<any>(
				`${menu}/ContextMenuPopout.native.tsx`,
				mod => {
					cleanup(
						instead(mod, 'ContextMenuPopout', ([p], real) =>
							p.menu.items[0]?.bar ? createElement(Sheet, p) : real(p),
						),
					)
				},
			),
			getModuleWithImportedPath<any>(
				'modules/haptics/HapticUtils.native.tsx',
				setHaptics,
			),
			getModuleWithImportedPath<any>(
				'modules/a11y/native/useIsScreenReaderEnabled.native.tsx',
				mod => {
					cleanup(
						instead(
							mod,
							'getIsScreenReaderEnabled',
							(args, real) => forced.on || real(...args),
						),
					)
				},
			),
		)
	},
})
