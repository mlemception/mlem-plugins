import { getAssetIdByName } from '@valenced/assets'
import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { Image, View } from 'react-native'
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

const state = (on: boolean) => () => {
	const { FormSwitch } = Design as any
	return (
		<View pointerEvents="none">
			<FormSwitch value={on} onValueChange={() => {}} />
		</View>
	)
}

export const On = state(true)
export const Off = state(false)

const tints = new WeakMap<object, ComponentType<any>>()

export function tint(Icon: ComponentType<any>) {
	let Tinted = tints.get(Icon)
	if (!Tinted) {
		Tinted = () => {
			const t = (Tokens as any).default ?? Tokens
			const tintColor = (Design as any).useToken(
				t.colors.INTERACTIVE_ICON_DEFAULT,
			)
			return <Icon style={{ width: 16, height: 16, tintColor }} />
		}
		tints.set(Icon, Tinted)
	}
	return Tinted
}
