import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { isValidElement } from 'react'
import { Image } from 'react-native'
import icon from './icon.png'
import type { PluginApi } from '@valenced/plugins/types'
import type { ReactNode } from 'react'
import type { Options } from './index'

const MathIcon = ({ style }: any) => (
	<Image source={{ uri: icon }} style={[{ width: 24, height: 24 }, style]} />
)

const MathOffIcon = ({ style }: any) => (
	<MathIcon style={[style, { opacity: 0.35 }]} />
)

let Button: any

export const watchButton = () =>
	getModuleWithImportedPath<any>(
		'modules/chat_input/native/action_buttons/ChatInputActionButton.tsx',
		mod => {
			Button = mod.default
		},
	)

export function MathButton({
	api,
}: {
	api: PluginApi<{ jsonStorage: Options }>
}) {
	const { jsonStorage } = api
	const s = jsonStorage.use()
	if (!s?.button || !Button) return null

	return (
		<Button
			accessibilityLabel="Math"
			active={s.enabled}
			IconComponent={s.enabled ? MathIcon : MathOffIcon}
			onPress={() => jsonStorage.set({ enabled: !s.enabled })}
		/>
	)
}

const hasExpr = (x: any) =>
	isValidElement(x) && !!(x.props as any).onPressExpression

const isRight = (x: any) => {
	if (!isValidElement(x)) return false
	const c = (x.props as any).children
	if (hasExpr(c)) return true
	if (!isValidElement(c)) return false
	const kids = (c.props as any).children
	return Array.isArray(kids) ? kids.some(hasExpr) : hasExpr(kids)
}

export function addButton(node: ReactNode, button: ReactNode): ReactNode {
	if (!isValidElement(node)) return node

	const { children } = node.props as any
	const list = Array.isArray(children) ? children : [children]

	const at = list.findIndex(isRight)
	if (at !== -1) {
		const next = [...list]
		next.splice(at, 0, button)
		return { ...node, props: { ...(node.props as any), children: next } }
	}

	for (const [i, child] of list.entries()) {
		const patched = addButton(child, button)
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
