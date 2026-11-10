import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { cloneElement, createElement, isValidElement } from 'react'
import { Settings } from './settings'
import { Status } from './status'
import { defaults, setStorage } from './store'
import { bypass, hold, setMessages, split } from './upload'
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

function withStatus(res: any, channelId?: string) {
	const el = createElement(Status, { key: 'catbox', channelId })
	return insert(res, el) ?? res
}

export default plugin<{ jsonStorage: Options }>({
	jsonStorage: { default: defaults },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage }) {
		cleanup(setStorage(jsonStorage))

		cleanup(
			getModules(
				withProps<any>('sendMessage', 'fetchMessages'),
				mod => {
					setMessages(mod)
					cleanup(
						instead(mod, 'sendMessage', (args: any[], real: any) => {
							const [id, msg, promise, opts, ...rest] = args
							if (bypass.has(msg)) return real(...args)
							const ups = opts?.attachmentsToUpload
							if (!Array.isArray(ups) || !ups.length) return real(...args)
							return split(id, ups).then(({ catbox, keep }) => {
								if (!catbox.length) return real(...args)
								hold(
									id,
									[
										id,
										msg,
										promise,
										{
											...opts,
											attachmentsToUpload: keep.length ? keep : undefined,
										},
										...rest,
									],
									catbox,
								)
							})
						}),
					)
				},
				{ max: 1 },
			),
			getModuleWithImportedPath<any>(
				'modules/chat_input/native/ChatInput.tsx',
				mod => {
					cleanup(
						instead(mod.default, 'type', (args: any[], real: any) => {
							const p = args[0]
							return withStatus(real(...args), p?.channel?.id ?? p?.channelId)
						}),
					)
				},
			),
		)
	},
})
