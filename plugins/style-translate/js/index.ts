import { Stores } from '@valenced/discord/flux'
import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { cloneElement, createElement, isValidElement } from 'react'
import { addButton, StyleButton, watchButton } from './button'
import { Chip } from './chip'
import { draftOf } from './common'
import { restyle } from './engine'
import { onSend, settle } from './send'
import { Settings } from './settings'
import { activeFor, defaults, options, setStorage } from './store'
import type { ReactElement } from 'react'
import type { Options } from './store'

const nameOf = (t: any) =>
	typeof t === 'string'
		? t
		: (t?.displayName ?? t?.name ?? t?.type?.name ?? t?.render?.name)

function insert(node: any, el: ReactElement, depth = 0): any {
	if (!isValidElement(node) || depth > 8) return
	const kids = (node.props as any).children
	const list: any[] = Array.isArray(kids) ? kids : [kids]
	const at = list.findIndex(
		k => isValidElement(k) && nameOf(k.type) === 'ChatInputImageCarousel',
	)
	if (at >= 0) {
		const next = [...list]
		next.splice(at + 1, 0, el)
		return cloneElement(node, undefined, ...next)
	}
	for (const [i, k] of list.entries()) {
		const hit = insert(k, el, depth + 1)
		if (!hit) continue
		const next = [...list]
		next[i] = hit
		return cloneElement(node, undefined, ...next)
	}
}

let timer: any
let lastAhead = ''

function ahead() {
	const S = Stores as any
	const channelId = S.SelectedChannelStore?.getChannelId?.()
	if (!channelId) return
	const draft = draftOf(channelId)
	settle(channelId, draft)
	clearTimeout(timer)
	const o = options()
	if (!o.ahead || !draft.trim()) return
	const style = activeFor(channelId, o)
	if (!style || style.kind === 'fx') return
	if (style.kind === 'ai' && !(o.ai === 'own' && o.aiKey)) return
	timer = setTimeout(() => {
		const k = `${style.id}\0${draft}`
		if (k === lastAhead || draftOf(channelId) !== draft) return
		lastAhead = k
		restyle(style, draft).catch(() => {})
	}, 900)
}

export default plugin<{ jsonStorage: Options }>({
	jsonStorage: { default: defaults },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage }) {
		cleanup(setStorage(jsonStorage))

		const drafts = (Stores as any).DraftStore
		drafts?.addChangeListener?.(ahead)
		cleanup(() => {
			drafts?.removeChangeListener?.(ahead)
			clearTimeout(timer)
		})

		cleanup(
			getModules(
				withProps<any>('sendMessage', 'fetchMessages'),
				mod => {
					cleanup(
						instead(mod, 'sendMessage', (args: any[], real: any) =>
							onSend(args, real),
						),
					)
				},
				{ max: 1 },
			),
			watchButton(),
			getModuleWithImportedPath<any>(
				'modules/chat_input/native/ChatInput.tsx',
				mod => {
					cleanup(
						instead(mod.default, 'type', (args: any[], real: any) => {
							const p = args[0]
							const channelId = p?.channel?.id ?? p?.channelId
							let res = real(...args)
							res = addButton(
								res,
								createElement(StyleButton, {
									key: 'styletranslate',
									channelId,
								}),
							)
							return (
								insert(
									res,
									createElement(Chip, {
										key: 'styletranslate-chip',
										channelId,
									}),
								) ?? res
							)
						}),
					)
				},
			),
		)
	},
})
