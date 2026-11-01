import { getAssets } from '@valenced/assets'
import { AlertActionCreators } from '@valenced/discord/actions'
import { FormSwitch } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { insteadJSX } from '@valenced/react/jsx-runtime'
import { createElement } from 'react'
import { Switch } from 'react-native'
import NerdEmoji from '../../../assets/MiniMod/NerdEmoji.png'
import { byProps, showToast } from '../../lib/common'
import { Module, ModuleCategory } from '../../stuff/Module'
import { M3AlertButton, M3AlertModal } from './components/M3Dialog'
import M3Snackbar from './components/M3Snackbar'
import M3Switch from './components/M3Switch'
import SwitchHost, { setSwitchResolver } from './components/SwitchHost'
import TestAlert from './components/TestAlert'

export default new Module({
	id: 'better-components',
	label: 'Better Components',
	meta: {
		sublabel:
			'Gives Discord a glow up by changing some of its core components to Material Design (or Tabs V2) alternatives',
		category: ModuleCategory.Useful,
		icon: 'BicycleIcon',
		thumbnail: { uri: NerdEmoji },
	},
	settings: {
		switch: {
			label: 'Switch',
			subLabel(value) {
				return value === 'Default'
					? 'Does not modify switches'
					: value === 'Tabs v2'
						? 'Replaces switches with Tabs v2 switches'
						: 'Makes switches look like Material UI switches'
			},
			type: 'choose',
			choices: ['Default', 'M3', 'Tabs v2'],
			default: 'M3',
			icon: 'TicketIcon',
		},
		switch_xicon: {
			label: 'Switch X Icon',
			subLabel: 'Show an "X" icon on disabled switches',
			type: 'toggle',
			default: false,
			icon: 'TicketIcon',
			predicate() {
				return (this.storage.options as any).switch === 'M3'
			},
		},
		switch_toast: {
			label: 'Test Switch',
			type: 'toggle',
			default: false,
			icon: 'BugIcon',
		},
		toast: {
			label: 'Toast',
			subLabel(value) {
				return value === 'Default'
					? 'Does not modify toasts'
					: 'Makes toasts look like Material UI snackbars'
			},
			type: 'choose',
			choices: ['Default', 'M3'],
			default: 'M3',
			icon: 'TicketIcon',
		},
		toast_position: {
			label: 'Toast Position',
			subLabel(value) {
				return `Toasts will show up on the ${value.toLowerCase()}`
			},
			type: 'choose',
			choices: ['Top', 'Bottom'],
			default: 'Top',
			icon: 'TicketIcon',
			predicate() {
				return (this.storage.options as any).toast === 'M3'
			},
		},
		toast_color: {
			label: 'Toast Color',
			type: 'choose',
			choices: ['Inverted', 'Normal'],
			default: 'Inverted',
			icon: 'TicketIcon',
			predicate() {
				return (this.storage.options as any).toast === 'M3'
			},
		},
		test_toast: {
			label: 'Test Toast',
			type: 'button',
			action() {
				const list = [...getAssets()].filter(
					x => 'id' in x && ['png', 'svg'].includes(x.type),
				) as any[]
				const item = list[Math.floor(Math.random() * list.length)]
				showToast(item.name, item.id)
			},
			icon: 'BugIcon',
		},
		alert: {
			label: 'Alert',
			subLabel(value) {
				return value === 'Default'
					? 'Does not modify alerts'
					: 'Makes alerts look like Material UI alerts'
			},
			type: 'choose',
			choices: ['Default', 'M3'],
			default: 'M3',
			icon: 'TicketIcon',
		},
		test_alert: {
			label: 'Test Alert',
			type: 'button',
			action() {
				AlertActionCreators.openAlert(
					'mlemsutils-test-alert',
					createElement(TestAlert),
				)
			},
			icon: 'BugIcon',
		},
	},
	handlers: {
		onStart() {
			const options = this.storage.options
			const loaded = (props: [string, ...string[]], cb: (mod: any) => void) => {
				const mod = byProps(...props)
				if (mod) cb(mod)
				else
					this.patches.add(getModules(withProps<any>(...props), cb, { max: 1 }))
			}
			const replace = (
				target: any,
				cb: (props: any, type: any, jsx: any, key: any) => any,
			) =>
				this.patches.add(
					insteadJSX(target, ([type, props, key], jsx) =>
						cb(props, type, jsx, key),
					),
				)

			const ready = (cb: (design: any) => void) =>
				loaded(['useSharedValue', 'withTiming'], () =>
					loaded(['useThemeContext'], () =>
						loaded(
							['FormSwitch', 'AlertModal', 'AlertActionButton', 'Toast'],
							cb,
						),
					),
				)

			ready(design => {
				Reflect.has(FormSwitch, 'name')

				const host = (props: any, type: any, jsx: any, key: any) =>
					jsx(SwitchHost, { ...props, component: type, jsx }, key)

				setSwitchResolver((type, props, jsx) =>
					options.switch === 'M3'
						? jsx(M3Switch, {
								...props,
								showIcons: options.switch_xicon,
								tall: type === Switch,
							})
						: options.switch === 'Tabs v2' && type === Switch
							? jsx(design.FormSwitch, props)
							: jsx(type, props),
				)
				this.patches.add(() => setSwitchResolver())
				replace(Switch, host)
				replace(design.FormSwitch, host)

				if (options.toast !== 'Default') {
					replace(design.Toast, (props, _, jsx, key) =>
						jsx(
							M3Snackbar,
							{
								...props,
								isOnBottom: options.toast_position === 'Bottom',
								inverted: options.toast_color !== 'Inverted',
							},
							key,
						),
					)
				}

				if (options.alert !== 'Default') {
					replace(design.AlertModal, (props, type, jsx, key) =>
						jsx(M3AlertModal, { ...props, render: type }, key),
					)
					replace(design.AlertActionButton, (props, type, jsx, key) =>
						jsx(M3AlertButton, { ...props, render: type }, key),
					)
				}
			})

			if (options.toast !== 'Default') {
				loaded(['useToastContainer'], mod => {
					this.patches.add(
						after(mod, 'useToastContainer', (res: any) =>
							res && options.toast_position === 'Bottom'
								? { ...res, position: 'bottom' }
								: res,
						),
					)
				})
			}
		},
		onStop() {},
	},
})
