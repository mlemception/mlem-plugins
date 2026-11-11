import { getAssetIdByName } from '@valenced/assets'
import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { Animated, Easing, Image, View } from 'react-native'
import type { ComponentType } from 'react'

const asset =
	(name: string) =>
	({ style }: any) => (
		<Image
			source={getAssetIdByName(name)}
			style={[{ width: 24, height: 24 }, style]}
		/>
	)

export const MenuIcon = asset('GridSquareIcon')
export const EmojiIcon = asset('ReactionIcon')
export const EditIcon = asset('PencilIcon')
export const MoreIcon = asset('MoreHorizontalIcon')

const box = {
	width: 24,
	height: 24,
	alignItems: 'center',
	justifyContent: 'center',
} as const

const tints = new WeakMap<object, ComponentType<any>>()

export function tint(Icon: ComponentType<any>) {
	let Tinted = tints.get(Icon)
	if (!Tinted) {
		Tinted = () => {
			const t = (Tokens as any).default ?? Tokens
			const tintColor = (Design as any).useToken(
				t.colors.INTERACTIVE_ICON_DEFAULT,
			)
			return (
				<View pointerEvents="none" style={box}>
					<Icon style={{ width: 20, height: 20, tintColor }} />
				</View>
			)
		}
		tints.set(Icon, Tinted)
	}
	return Tinted
}

const Pop = Animated.createAnimatedComponent(View)
const popIn = Easing.bezier(0.34, 1.4, 0.64, 1)
const popOut = Easing.bezier(0.4, 0, 1, 1)

export function Dot({ on }: { on: boolean }) {
	const t = (Tokens as any).default ?? Tokens
	const fill = (Design as any).useToken(t.colors.TEXT_BRAND)
	const [v] = useState(() => new Animated.Value(on ? 1 : 0))

	useEffect(() => {
		Animated.timing(v, {
			toValue: on ? 1 : 0,
			duration: on ? 260 : 140,
			easing: on ? popIn : popOut,
			useNativeDriver: true,
		}).start()
	}, [on])

	return (
		<Pop
			pointerEvents="none"
			style={{
				position: 'absolute',
				top: -5,
				right: -5,
				width: 8,
				height: 8,
				borderRadius: 4,
				backgroundColor: fill,
				opacity: v,
				transform: [{ scale: v }],
			}}
		/>
	)
}
