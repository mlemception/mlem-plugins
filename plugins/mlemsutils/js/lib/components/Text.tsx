import { Design } from '@valenced/discord/design'
import { useEffect, useReducer } from 'react'
import { Text as RNText } from 'react-native'
import { byProps, resolveSemanticColor, semanticColors } from '../common'
import type { PropsWithChildren, ReactNode } from 'react'
import type { TextProps } from 'react-native'

export function TrailingText({ children }: PropsWithChildren) {
	return (
		<Text variant="text-md/medium" color="TEXT_MUTED">
			{children}
		</Text>
	)
}

export default function Text({
	variant,
	lineClamp,
	color,
	align,
	style,
	onPress,
	getChildren,
	children,
	liveUpdate,
	ellipsis,
}: PropsWithChildren<{
	variant?: string
	color?: string
	getChildren?: () => ReactNode | undefined
	liveUpdate?: boolean
	lineClamp?: TextProps['numberOfLines']
	align?: 'left' | 'right' | 'center'
	style?: TextProps['style']
	onPress?: TextProps['onPress']
	ellipsis?: TextProps['ellipsizeMode']
}>) {
	const ctx = byProps('useThemeContext').useThemeContext()
	const [, forceUpdate] = useReducer(x => ~x, 0)

	useEffect(() => {
		if (!liveUpdate) return
		const nextSecond = () => Date.now() - new Date().setMilliseconds(1000)

		let timeout = setTimeout(function update() {
			forceUpdate()
			timeout = setTimeout(update, nextSecond())
		}, nextSecond())

		return () => clearTimeout(timeout)
	}, [])

	return (
		<RNText
			style={[
				variant && (Design.TextStyleSheet as any)[variant],
				color
					? { color: resolveSemanticColor(semanticColors[color], ctx?.theme) }
					: {},
				align && { textAlign: align },
				style ?? {},
			]}
			numberOfLines={lineClamp}
			onPress={onPress}
			ellipsizeMode={ellipsis}
		>
			{getChildren?.() ?? children}
		</RNText>
	)
}
