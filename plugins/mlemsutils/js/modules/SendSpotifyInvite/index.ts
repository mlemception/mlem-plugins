import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { after } from '@valenced/patcher'
import { createElement, isValidElement } from 'react'
import { Module, ModuleCategory } from '../../stuff/Module'
import InviteButton from './components/InviteButton'
import dark from './dark.png'
import light from './light.png'
import type { ReactNode } from 'react'

const isAction = (x: any) =>
	isValidElement(x) && !!(x.props as any).accessibilityLabel

function addButton(node: ReactNode): ReactNode {
	if (!isValidElement(node)) return node

	const { children } = node.props as any
	if (Array.isArray(children) && children.some(isAction)) {
		return {
			...node,
			props: {
				...(node.props as any),
				children: [
					...children,
					createElement(InviteButton, { key: 'spotify-invite' }),
				],
			},
		}
	}

	const list = Array.isArray(children) ? children : [children]
	for (const [i, child] of list.entries()) {
		const patched = addButton(child)
		if (patched === child) continue

		const next = [...list]
		next[i] = patched
		return {
			...node,
			props: {
				...(node.props as any),
				children: Array.isArray(children) ? next : patched,
			},
		}
	}

	return node
}

export default new Module({
	id: 'send-spotify-invite',
	label: 'Send Spotify invite',
	meta: {
		sublabel:
			'Adds a button in the chat attachment menu to invite the channel to listen along to spotify',
		category: ModuleCategory.Useful,
		icon: 'img_account_sync_spotify_white',
		thumbnail: { dark: { uri: dark }, light: { uri: light } },
	},
	handlers: {
		onStart() {
			this.patches.add(
				getModuleWithImportedPath<any>(
					'modules/media_keyboard/native/components/MediaKeyboardBottomSheetActions.tsx',
					mod => {
						if (!mod?.default?.type) return
						this.patches.add(after(mod.default, 'type', addButton))
					},
				),
			)
		},
		onStop() {},
	},
})
