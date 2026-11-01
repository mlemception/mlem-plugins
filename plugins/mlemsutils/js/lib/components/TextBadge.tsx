import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { makeStyles, Reanimated, semanticColors } from '../common'
import Text from './Text'
import type { PropsWithChildren } from 'react'
import type { ViewStyle } from 'react-native'

const makeUseStyles = (kind: string) =>
	makeStyles(() => ({
		main: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'center',
			borderRadius: 2147483647,
			paddingHorizontal: 6,
			paddingVertical: 3,
			backgroundColor: semanticColors[`${kind}_BACKGROUND_DEFAULT`],
			marginTop: 3,
			overflow: 'hidden',
		},
		shiner: {
			position: 'absolute',
			width: 7,
			height: 80,
			backgroundColor: '#fff4',
		},
		text: {
			color: semanticColors[`${kind}_TEXT_DEFAULT`],
			textTransform: 'uppercase',
		},
	}))

const hooks = {
	primary: makeUseStyles('CONTROL_PRIMARY'),
	destructive: makeUseStyles('CONTROL_CRITICAL_PRIMARY'),
}

export default function TextBadge({
	style,
	variant,
	children,
	shiny,
}: PropsWithChildren<{
	style?: ViewStyle
	variant: 'primary' | 'destructive'
	shiny?: boolean
}>) {
	const [width, setWidth] = useState(0)
	const styles = hooks[variant]()

	const shinyTranslate = Reanimated.useSharedValue(0)
	const randomness = useRef(1500 + Math.floor(Math.random() * 696)).current

	useEffect(() => {
		if (width !== 0 && shiny) {
			shinyTranslate.value = Reanimated.withRepeat(
				Reanimated.withSequence(
					Reanimated.withTiming(-width, { duration: 0 }),
					Reanimated.withDelay(
						randomness,
						Reanimated.withTiming(width, {
							duration: 800,
							easing: Reanimated.Easing.inOut(Reanimated.Easing.cubic),
						}),
					),
				),
				0,
			)
		} else shinyTranslate.value = 500
	}, [shiny, width])

	return (
		<View
			style={[styles.main, style]}
			onLayout={e => setWidth(e.nativeEvent.layout.width * 0.5 + 4)}
		>
			{shiny && width !== 0 && (
				<Reanimated.default.View
					style={[
						styles.shiner,
						{
							transform: [{ rotate: '-22deg' }, { translateX: shinyTranslate }],
						},
					]}
				/>
			)}
			<Text variant="text-xxs/bold" align="center" style={styles.text}>
				{children}
			</Text>
		</View>
	)
}
