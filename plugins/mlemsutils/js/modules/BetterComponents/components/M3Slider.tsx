import { useEffect, useMemo, useRef, useState } from 'react'
import { PanResponder, Pressable, View } from 'react-native'
import { byProps, Reanimated } from '../../../lib/common'
import { mdSysColor } from './M3Switch/styles'

const height = 44
const trackHeight = 16
const handleWidth = 4
const handleWidthPressed = 2
const gap = 6
const dotSize = 4

const emphasizedDecelerate = () => Reanimated.Easing.bezier(0.05, 0.7, 0.1, 1)

const clamp = (value: number, min: number, max: number) =>
	Math.min(Math.max(value, min), max)

export default function M3Slider(props: {
	value?: number
	minimumValue?: number
	maximumValue?: number
	lowerLimit?: number
	upperLimit?: number
	step?: number
	inverted?: boolean
	disabled?: boolean
	onValueChange?: (value: number) => void
	onSlidingStart?: (value: number) => void
	onSlidingComplete?: (value: number) => void
	style?: any
}) {
	byProps('useThemeContext').useThemeContext()

	const { value = 0, minimumValue = 0, maximumValue = 1, disabled } = props

	const latest = useRef(props)
	latest.current = props

	const [width, setWidth] = useState(0)
	const [current, setCurrent] = useState(value)
	const widthRef = useRef(0)
	const currentRef = useRef(value)
	const dragging = useRef(false)
	const startX = useRef(0)

	const range = maximumValue - minimumValue || 1
	const ratio = clamp((current - minimumValue) / range, 0, 1)
	const x =
		(props.inverted ? 1 - ratio : ratio) * Math.max(width - handleWidth, 0) +
		handleWidth / 2

	const activeWidth = Reanimated.useSharedValue(Math.max(x - gap - 2, 0))
	const inactiveLeft = Reanimated.useSharedValue(x + gap + 2)
	const handleLeft = Reanimated.useSharedValue(x - handleWidth / 2)
	const barWidth = Reanimated.useSharedValue(handleWidth)

	useEffect(() => {
		const set = (shared: any, to: number) => {
			shared.value = dragging.current
				? to
				: Reanimated.withTiming(to, {
						duration: 150,
						easing: emphasizedDecelerate(),
					})
		}

		set(activeWidth, Math.max(x - gap - 2, 0))
		set(inactiveLeft, x + gap + 2)
		set(handleLeft, x - handleWidth / 2)
	}, [x])

	useEffect(() => {
		if (dragging.current) return
		currentRef.current = value
		setCurrent(value)
	}, [value])

	const setPressed = (pressed: boolean) => {
		dragging.current = pressed
		barWidth.value = Reanimated.withTiming(
			pressed ? handleWidthPressed : handleWidth,
			{ duration: 100, easing: emphasizedDecelerate() },
		)
	}

	const snap = (at: number) => {
		const {
			minimumValue: min = 0,
			maximumValue: max = 1,
			lowerLimit,
			upperLimit,
			step = 0,
			inverted,
		} = latest.current

		const usable = Math.max(widthRef.current - handleWidth, 1)
		const pos = clamp((at - handleWidth / 2) / usable, 0, 1)
		let next = min + (inverted ? 1 - pos : pos) * (max - min)

		if (step > 0) {
			const decimals = `${step}`.split('.')[1]?.length ?? 0
			next = min + Math.round((next - min) / step) * step
			next = Number(next.toFixed(decimals))
		}

		return clamp(
			next,
			Math.max(min, lowerLimit ?? min),
			Math.min(max, upperLimit ?? max),
		)
	}

	const update = (next: number) => {
		if (next === currentRef.current) return
		currentRef.current = next
		setCurrent(next)
		latest.current.onValueChange?.(next)
	}

	const pan = useMemo(() => {
		const wantsDrag = (_: unknown, g: { dx: number; dy: number }) =>
			!latest.current.disabled &&
			Math.abs(g.dx) >= 4 &&
			Math.abs(g.dx) > Math.abs(g.dy)
		const finish = () => {
			setPressed(false)
			latest.current.onSlidingComplete?.(currentRef.current)
		}

		return PanResponder.create({
			onMoveShouldSetPanResponder: wantsDrag,
			onMoveShouldSetPanResponderCapture: wantsDrag,
			onPanResponderTerminationRequest: () => false,
			onPanResponderGrant: (e, g) => {
				startX.current = e.nativeEvent.locationX - g.dx
				setPressed(true)
				latest.current.onSlidingStart?.(currentRef.current)
			},
			onPanResponderMove: (_, g) => update(snap(startX.current + g.dx)),
			onPanResponderRelease: finish,
			onPanResponderTerminate: finish,
		})
	}, [])

	const seek = (at: number) => {
		latest.current.onSlidingStart?.(currentRef.current)
		update(snap(at))
		latest.current.onSlidingComplete?.(currentRef.current)
	}

	const nudge = (dir: 1 | -1) => {
		const { step = 0 } = latest.current
		const next = clamp(
			currentRef.current + dir * (step || range / 20),
			minimumValue,
			maximumValue,
		)
		update(next)
		latest.current.onSlidingComplete?.(next)
	}

	const AnimatedView = Reanimated.default.View

	return (
		<View
			{...pan.panHandlers}
			style={[
				{ height, justifyContent: 'center', opacity: disabled ? 0.38 : 1 },
				props.style,
			]}
			onLayout={e => {
				widthRef.current = e.nativeEvent.layout.width
				setWidth(e.nativeEvent.layout.width)
			}}
			accessible
			accessibilityRole="adjustable"
			accessibilityState={{ disabled: !!disabled }}
			accessibilityValue={{
				min: minimumValue,
				max: maximumValue,
				now: current,
			}}
			accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
			onAccessibilityAction={e =>
				nudge(e.nativeEvent.actionName === 'increment' ? 1 : -1)
			}
		>
			<Pressable
				style={{ height }}
				disabled={disabled}
				accessible={false}
				onPress={e => seek(e.nativeEvent.locationX)}
				key="body"
			>
				<AnimatedView
					pointerEvents="none"
					style={[
						{
							position: 'absolute',
							top: (height - trackHeight) / 2,
							left: 0,
							height: trackHeight,
							borderTopLeftRadius: trackHeight / 2,
							borderBottomLeftRadius: trackHeight / 2,
							borderTopRightRadius: 2,
							borderBottomRightRadius: 2,
							backgroundColor: mdSysColor.primary(),
						},
						{ width: activeWidth },
					]}
					key="active"
				/>
				<AnimatedView
					pointerEvents="none"
					style={[
						{
							position: 'absolute',
							top: (height - trackHeight) / 2,
							right: 0,
							height: trackHeight,
							borderTopRightRadius: trackHeight / 2,
							borderBottomRightRadius: trackHeight / 2,
							borderTopLeftRadius: 2,
							borderBottomLeftRadius: 2,
							backgroundColor: mdSysColor.primaryContainer(),
							overflow: 'hidden',
						},
						{ left: inactiveLeft },
					]}
					key="inactive"
				/>
				{width - x > trackHeight && (
					<View
						pointerEvents="none"
						style={{
							position: 'absolute',
							top: (height - dotSize) / 2,
							right: (trackHeight - dotSize) / 2,
							width: dotSize,
							height: dotSize,
							borderRadius: dotSize / 2,
							backgroundColor: mdSysColor.primary(),
						}}
						key="stop"
					/>
				)}
				<AnimatedView
					pointerEvents="none"
					style={[
						{
							position: 'absolute',
							top: 0,
							width: handleWidth,
							height,
							alignItems: 'center',
						},
						{ left: handleLeft },
					]}
					key="handle"
				>
					<AnimatedView
						style={[
							{
								height,
								borderRadius: handleWidth / 2,
								backgroundColor: mdSysColor.primary(),
							},
							{ width: barWidth },
						]}
					/>
				</AnimatedView>
			</Pressable>
		</View>
	)
}
