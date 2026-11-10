import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { useRef, useSyncExternalStore } from 'react'
import { View } from 'react-native'

const lowest = 0.25
const highest = 2
const inset = 26
const stops = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

const place = (rate: number) =>
	rate <= 1
		? ((rate - lowest) / (1 - lowest)) * 0.5
		: 0.5 + ((rate - 1) / (highest - 1)) * 0.5

const nearest = (at: number) =>
	stops.reduce((best, stop) =>
		Math.abs(place(stop) - at) < Math.abs(place(best) - at) ? stop : best,
	)

export const label = (value: number) => `${+value.toFixed(2)}x`

export let fallback = 1

export function setFallback(value: number) {
	fallback = stops.includes(value) ? value : 1
}

let rate = 1
let open = 0
const subs = new Set<() => void>()
const ping = () => {
	for (const sub of subs) sub()
}
const listen = (sub: () => void) => {
	subs.add(sub)
	return () => {
		subs.delete(sub)
	}
}

export const speed = {
	get: () => rate,
	set(value: number) {
		rate = value
		ping()
	},
	enter() {
		if (open++ === 0) rate = fallback
		ping()
		return () => {
			open--
			ping()
		}
	},
}

export const useRate = () => useSyncExternalStore(listen, () => rate)
export const useOpen = () => useSyncExternalStore(listen, () => open > 0)

export function Picker({
	value,
	onChange,
}: {
	value: number
	onChange: (value: number) => void
}) {
	const { Slider, Text } = Design as any
	const [{ Gesture, GestureDetector }] = lookupModule(
		withProps<any>('Gesture', 'GestureDetector'),
	)
	const box = useRef(0)
	const last = useRef(value)
	last.current = value
	const change = useRef(onChange)
	change.current = onChange
	const move = (x: number) => {
		const next = nearest((x - inset) / (box.current - inset * 2))
		if (next === last.current) return
		last.current = next
		change.current(next)
		const [buzz] = lookupModule(withProps<any>('triggerHapticFeedback'))
		buzz?.triggerHapticFeedback(buzz.HapticFeedbackTypes.IMPACT_LIGHT)
	}
	const hold = useRef(
		Gesture.Pan()
			.runOnJS(true)
			.minDistance(0)
			.onBegin((event: any) => move(event.x))
			.onUpdate((event: any) => move(event.x)),
	).current

	return (
		<View>
			<Text
				variant="heading-lg/semibold"
				color="text-strong"
				style={{ textAlign: 'center' }}
			>
				{label(value)}
			</Text>
			<GestureDetector gesture={hold}>
				<View
					style={{ height: 40, justifyContent: 'center' }}
					collapsable={false}
					pointerEvents="box-only"
					onLayout={event => {
						box.current = event.nativeEvent.layout.width
					}}
				>
					<Slider value={place(value)} minimumValue={0} maximumValue={1} />
				</View>
			</GestureDetector>
			<View
				style={{
					flexDirection: 'row',
					justifyContent: 'space-between',
					marginHorizontal: -14,
				}}
			>
				{[label(lowest), '1x', label(highest)].map(text => (
					<Text
						key={text}
						variant="text-sm/medium"
						color="text-muted"
						style={{ width: 60, textAlign: 'center' }}
					>
						{text}
					</Text>
				))}
			</View>
		</View>
	)
}

function SpeedSheet() {
	const { ActionSheet, ActionSheetCloseButton, BottomSheetTitleHeader } =
		Design as any
	const value = useRate()

	return (
		<ActionSheet
			header={
				<BottomSheetTitleHeader
					title="Speed"
					trailing={
						<ActionSheetCloseButton
							onPress={() =>
								ActionSheetActionCreators.hideActionSheet('mlemspeed')
							}
						/>
					}
				/>
			}
		>
			<View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
				<Picker value={value} onChange={speed.set} />
			</View>
		</ActionSheet>
	)
}

export const openSheet = () =>
	ActionSheetActionCreators.openLazy(
		Promise.resolve({ default: SpeedSheet }) as any,
		'mlemspeed',
		{} as any,
	)
