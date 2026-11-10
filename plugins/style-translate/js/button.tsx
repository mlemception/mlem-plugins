import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { isValidElement } from 'react'
import { Pressable, View } from 'react-native'
import { colors, icon, toast, useToken } from './common'
import { openSheet } from './sheet'
import { activeFor, options, setActive, styleOf, useOptions } from './store'
import type { ReactNode } from 'react'

let Button: any

export const watchButton = () =>
	getModuleWithImportedPath<any>(
		'modules/chat_input/native/action_buttons/ChatInputActionButton.tsx',
		mod => {
			Button = mod.default
		},
	)

const Sparkle = icon('PencilSparkleIcon')

function SparkleOn(props: any) {
	const color = useToken(colors().TEXT_BRAND)
	return (
		<Sparkle
			{...props}
			color={color}
			style={[props.style, { tintColor: color }]}
		/>
	)
}

export function quickToggle(channelId?: string) {
	if (!channelId) return
	const on = activeFor(channelId)
	if (on) {
		setActive(channelId, null)
		toast(`${on.name} off`)
		return
	}
	const s = styleOf(options().style) ?? styleOf('pirate')!
	setActive(channelId, s.id)
	toast(`${s.name} on`)
}

export function StyleButton({ channelId }: { channelId?: string }) {
	const o = useOptions()
	if (!o.button || !Button || !channelId) return null
	const on = activeFor(channelId, o)
	const open = () => openSheet(channelId)
	const hold = () => quickToggle(channelId)
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={
				on ? `Style Translate, ${on.name} on` : 'Style Translate'
			}
			accessibilityHint="Hold to turn your last style on or off"
			accessibilityState={{ checked: !!on }}
			onPress={open}
			onLongPress={hold}
			delayLongPress={400}
			hitSlop={6}
			style={({ pressed }) => ({
				alignSelf: 'center',
				opacity: pressed ? 0.6 : 1,
			})}
		>
			<View
				pointerEvents="none"
				accessible={false}
				importantForAccessibility="no-hide-descendants"
			>
				<Button
					accessibilityLabel="Style Translate"
					active={!!on}
					IconComponent={on ? SparkleOn : Sparkle}
					onPress={open}
					onLongPress={hold}
				/>
			</View>
		</Pressable>
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
