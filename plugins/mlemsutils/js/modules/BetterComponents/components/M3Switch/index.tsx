import { createContext, useContext, useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { byProps, icon, Reanimated } from '../../../../lib/common'
import { getStyles, layoutStyles } from './styles'
import type { PropsWithChildren } from 'react'
import type { ColorStyles, IconColorStyles, LayoutStyles } from './styles'

let AnimatedPressable: any
const getPressable = () =>
	(AnimatedPressable ??= Reanimated.default.createAnimatedComponent(Pressable))

const emphasizedDecelerate = () => Reanimated.Easing.bezier(0.05, 0.7, 0.1, 1)
const emphasizedAccelerate = () => Reanimated.Easing.bezier(0.3, 0, 0.8, 0.15)

const SwitchStateContext = createContext({
	value: false,
	disabled: false,
	isPressing: false,
	showIcons: false,
})

function Track({
	onValueChange,
	setIsPressing,
	style,
	children,
}: PropsWithChildren<{
	onValueChange?: (value: boolean) => void
	setIsPressing: (value: boolean) => void
	style: any
}>) {
	const { value, disabled } = useContext(SwitchStateContext)
	const { enabledStyles, disabledStyles } = getStyles()

	const colors = (
		value
			? disabled
				? disabledStyles.trackOn
				: enabledStyles.trackOn
			: disabled
				? disabledStyles.trackOff
				: enabledStyles.trackOff
	) as ColorStyles

	const backgroundColor = Reanimated.useSharedValue(colors.backgroundColor)
	const borderColor = Reanimated.useSharedValue(colors.borderColor)
	const opacity = Reanimated.useSharedValue(colors.opacity ?? 1)

	useEffect(() => {
		const config = {
			duration: 100,
			easing: emphasizedAccelerate(),
			reduceMotion: Reanimated.ReduceMotion.Never,
		}

		backgroundColor.value = Reanimated.withTiming(
			colors.backgroundColor,
			config,
		)
		borderColor.value = Reanimated.withTiming(colors.borderColor!, config)
		opacity.value = Reanimated.withTiming(colors.opacity ?? 1, config)
	}, [value, disabled, colors])

	const Pressed = getPressable()

	return (
		<Pressed
			style={[
				layoutStyles.track,
				{
					backgroundColor: backgroundColor.value,
					borderColor: borderColor.value,
					opacity: opacity.value,
				},
				{ backgroundColor, borderColor, opacity },
				style,
			]}
			onPress={() => !disabled && onValueChange?.(!value)}
			onFocus={() => setIsPressing(true)}
			onBlur={() => setIsPressing(false)}
			onHoverIn={() => setIsPressing(true)}
			onHoverOut={() => setIsPressing(false)}
			onPressIn={() => setIsPressing(true)}
			onPressOut={() => setIsPressing(false)}
			hitSlop={8}
			accessibilityRole="switch"
			accessibilityState={{ checked: value, disabled }}
			key="track"
		>
			{children}
		</Pressed>
	)
}

function Handle({ children }: PropsWithChildren) {
	const { value, disabled, isPressing, showIcons } =
		useContext(SwitchStateContext)
	const { enabledStyles, disabledStyles } = getStyles()

	const layout = (
		isPressing
			? value
				? layoutStyles.handleOnPressed
				: layoutStyles.handleOffPressed
			: value
				? layoutStyles.handleOn
				: showIcons
					? layoutStyles.handleOffBig
					: layoutStyles.handleOff
	) as LayoutStyles

	function getState() {
		const width = layoutStyles.track.width
		const { left, right } = layout
		const size = layout.width!

		const x =
			typeof left === 'number'
				? left
				: typeof right === 'number'
					? width - size - 4 - right
					: 0

		return { left: x }
	}

	const defState = getState()
	const width = Reanimated.useSharedValue(layout.width!)
	const height = Reanimated.useSharedValue(layout.height!)
	const left = Reanimated.useSharedValue(defState.left)
	const top = Reanimated.useSharedValue(layout.height! / -2)

	useEffect(() => {
		const state = getState()
		const config = { duration: 200, easing: emphasizedDecelerate() }

		width.value = Reanimated.withTiming(layout.width!, config)
		height.value = Reanimated.withTiming(layout.height!, config)
		left.value = Reanimated.withTiming(state.left, config)
		top.value = Reanimated.withTiming(layout.height! / -2, config)
	}, [value, disabled, isPressing])

	const colors = (
		disabled
			? value
				? disabledStyles.handleOn
				: disabledStyles.handleOff
			: isPressing
				? value
					? enabledStyles.handleOnPressed
					: enabledStyles.handleOffPressed
				: value
					? enabledStyles.handleOn
					: enabledStyles.handleOff
	) as ColorStyles

	const backgroundColor = Reanimated.useSharedValue(colors.backgroundColor)
	const opacity = Reanimated.useSharedValue(colors.opacity ?? 1)

	useEffect(() => {
		const config = { duration: 100, easing: emphasizedAccelerate() }

		backgroundColor.value = Reanimated.withTiming(
			colors.backgroundColor,
			config,
		)
		opacity.value = Reanimated.withTiming(colors.opacity ?? 1, config)
	}, [value, disabled, isPressing, colors])

	const innerStyle = [
		layoutStyles.handle,
		{
			width: width.value,
			height: height.value,
			top: top.value,
		},
		{ width, height, top },
		{ zIndex: -50 },
	]
	const AnimatedView = Reanimated.default.View

	return (
		<AnimatedView
			style={[
				layoutStyles.handleContainer,
				{ left: left.value, top: (layoutStyles.track.height - 4) / 2 },
				{ left },
			]}
			key="handle-container"
		>
			<View>
				<AnimatedView style={innerStyle} key="handle-children-spacing">
					{children}
				</AnimatedView>
				<AnimatedView
					style={[innerStyle, { zIndex: 51 }]}
					key="handle-icon-spacing"
				>
					<Icon />
				</AnimatedView>
				<AnimatedView
					style={[
						innerStyle,
						{
							backgroundColor: backgroundColor.value,
							opacity: opacity.value,
						},
						{ backgroundColor, opacity },
						{ zIndex: 50 },
					]}
					key="handle"
				/>
			</View>
		</AnimatedView>
	)
}

function Icon() {
	const { value, disabled, showIcons } = useContext(SwitchStateContext)
	const { enabledStyles, disabledStyles } = getStyles()

	const colors = (
		disabled
			? value
				? disabledStyles.iconOn
				: disabledStyles.iconOff
			: value
				? enabledStyles.iconOn
				: enabledStyles.iconOff
	) as IconColorStyles

	const tintColor = Reanimated.useSharedValue(colors.tintColor)
	const enabOpacity = Reanimated.useSharedValue(
		value ? (colors.opacity ?? 1) : 0,
	)
	const disbOpacity = Reanimated.useSharedValue(
		!value ? (colors.opacity ?? 1) : 0,
	)

	useEffect(() => {
		tintColor.value = Reanimated.withTiming(colors.tintColor, {
			duration: 100,
			easing: emphasizedDecelerate(),
		})
		enabOpacity.value = Reanimated.withDelay(
			50,
			Reanimated.withTiming(value ? (colors.opacity ?? 1) : 0, {
				duration: 50,
				easing: emphasizedDecelerate(),
			}),
		)
		disbOpacity.value = Reanimated.withDelay(
			50,
			Reanimated.withTiming(!value ? (colors.opacity ?? 1) : 0, {
				duration: 50,
				easing: emphasizedDecelerate(),
			}),
		)
	}, [value, disabled, colors])

	const AnimatedImage = Reanimated.default.Image

	return (
		<View key="icon" style={{ width: 16, height: 16 }}>
			<AnimatedImage
				style={[
					layoutStyles.icon,
					{ tintColor: tintColor.value, opacity: enabOpacity.value },
					{ tintColor, opacity: enabOpacity },
				]}
				source={icon('CheckmarkLargeIcon')}
				key="icon-enabled"
			/>
			{showIcons && (
				<AnimatedImage
					style={[
						layoutStyles.icon,
						{ tintColor: tintColor.value, opacity: disbOpacity.value },
						{ tintColor, opacity: disbOpacity },
					]}
					source={icon('XLargeIcon')}
					key="icon-disabled"
				/>
			)}
		</View>
	)
}

function Ripple() {
	const { value, disabled, isPressing } = useContext(SwitchStateContext)
	const { enabledStyles } = getStyles()

	const layout = (
		isPressing && !disabled ? layoutStyles.ripplePressed : layoutStyles.ripple
	) as LayoutStyles

	const width = Reanimated.useSharedValue(layout.width!)
	const height = Reanimated.useSharedValue(layout.height!)
	const top = Reanimated.useSharedValue(layout.height! / -2)

	useEffect(() => {
		const config = { duration: 200, easing: emphasizedDecelerate() }

		width.value = Reanimated.withTiming(layout.width!, config)
		height.value = Reanimated.withTiming(layout.height!, config)
		top.value = Reanimated.withTiming(layout.height! / -2, config)
	}, [value, disabled, isPressing])

	const colors = (
		isPressing && !disabled
			? value
				? enabledStyles.rippleOnPressed
				: enabledStyles.rippleOffPressed
			: {
					backgroundColor: '#fff',
					opacity: 0,
				}
	) as ColorStyles

	const backgroundColor = Reanimated.useSharedValue(colors.backgroundColor)
	const opacity = Reanimated.useSharedValue(colors.opacity ?? 1)

	useEffect(() => {
		const config = { duration: 200, easing: emphasizedDecelerate() }

		backgroundColor.value = Reanimated.withTiming(
			colors.backgroundColor,
			config,
		)
		opacity.value = Reanimated.withTiming(colors.opacity ?? 1, config)
	}, [value, disabled, isPressing, colors])

	const AnimatedView = Reanimated.default.View

	return (
		<AnimatedView
			style={[
				layoutStyles.ripple,
				{
					width: width.value,
					height: height.value,
				},
				{
					backgroundColor: backgroundColor.value,
					opacity: opacity.value,
				},
				{ width, height },
				{ backgroundColor, opacity },
				{ zIndex: -50 },
			]}
			key="ripple"
		/>
	)
}

export default function M3Switch({
	value,
	onValueChange,
	disabled,
	showIcons,
	tall,
	style,
}: {
	value?: boolean
	onValueChange?: (val: boolean) => void
	disabled?: boolean
	showIcons?: boolean
	tall?: boolean
	style?: any
}) {
	byProps('useThemeContext').useThemeContext()
	const [isPressing, setIsPressing] = useState(false)

	const body = (
		<SwitchStateContext.Provider
			value={{
				value: !!value,
				disabled: !!disabled,
				showIcons: !!showIcons,
				isPressing,
			}}
		>
			<Track
				setIsPressing={setIsPressing}
				onValueChange={onValueChange}
				style={style}
			>
				<Handle>
					<Ripple />
				</Handle>
			</Track>
		</SwitchStateContext.Provider>
	)

	return tall ? (
		<View style={{ height: 38, justifyContent: 'center' }}>{body}</View>
	) : (
		body
	)
}
