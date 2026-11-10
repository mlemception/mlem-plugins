import { Design } from '@valenced/discord/design'
import { useEffect, useRef, useState } from 'react'
import { Animated, Pressable, View } from 'react-native'
import { colors, icon, useToken } from './common'
import { giveBack, retry, sendAsIs } from './send'
import { openSheet } from './sheet'
import { activeFor, jobFor, options, setActive, useTick } from './store'
import type { Job } from './store'
import type { Style } from './styles'

const Box = Animated.createAnimatedComponent(View)

function Pulse({ color }: { color: string }) {
	const v = useRef(new Animated.Value(0.35)).current
	useEffect(() => {
		const a = Animated.loop(
			Animated.sequence([
				Animated.timing(v, {
					toValue: 1,
					duration: 520,
					useNativeDriver: true,
				}),
				Animated.timing(v, {
					toValue: 0.35,
					duration: 520,
					useNativeDriver: true,
				}),
			]),
		)
		a.start()
		return () => a.stop()
	}, [])
	return (
		<Box
			style={{
				width: 8,
				height: 8,
				borderRadius: 4,
				backgroundColor: color,
				opacity: v,
				transform: [{ scale: v }],
			}}
		/>
	)
}

interface Shown {
	job?: Job
	style: Style
}

export function Chip({ channelId }: { channelId?: string }) {
	useTick()
	const o = options()
	const job = jobFor(channelId)
	const active = activeFor(channelId, o)
	const now: Shown | undefined = job
		? { job, style: job.style }
		: active && o.chip
			? { style: active }
			: undefined

	const [shown, setShown] = useState<Shown | undefined>(now)
	const show = useRef(new Animated.Value(now ? 1 : 0)).current
	const sig = now
		? `${now.style.id}:${now.job?.phase ?? 'on'}:${now.job?.id ?? ''}`
		: ''

	useEffect(() => {
		if (now) {
			setShown(now)
			Animated.spring(show, {
				toValue: 1,
				useNativeDriver: true,
				speed: 20,
				bounciness: 5,
			}).start()
		} else if (shown)
			Animated.timing(show, {
				toValue: 0,
				duration: 160,
				useNativeDriver: true,
			}).start(({ finished }) => finished && setShown(undefined))
	}, [sig])

	const c = colors()
	const bg = useToken(c.MOBILE_FLOATINGBAR_BACKGROUND_HIGHER)
	const border = useToken(c.BORDER_MUTED)
	const muted = useToken(c.INTERACTIVE_ICON_DEFAULT)
	const brand = useToken(c.TEXT_BRAND)
	const danger = useToken(c.TEXT_FEEDBACK_CRITICAL)

	if (!shown || !channelId) return null
	const cur = now ?? shown
	const { Text } = Design as any
	const X = icon('XSmallIcon')
	const Retry = icon('RetryIcon')
	const Undo = icon('UndoIcon')
	const Send = icon('SendMessageIcon')

	const button = (
		label: string,
		Icon: any,
		onPress: () => void,
		color = muted,
	) => (
		<Pressable
			key={label}
			accessibilityRole="button"
			accessibilityLabel={label}
			hitSlop={8}
			onPress={onPress}
			style={({ pressed }) => ({
				padding: 8,
				borderRadius: 16,
				opacity: pressed ? 0.5 : 1,
			})}
		>
			<Icon size="sm" color={color} />
		</Pressable>
	)

	const phase = cur.job?.phase
	const name = cur.style.name
	let title = `${name} on`
	let line = o.scope === 'all' ? 'Everywhere' : 'In this chat'
	let lineColor = 'text-muted'
	let actions: any[] = [button('Turn off', X, () => setActive(channelId, null))]
	const Sparkle = icon('PencilSparkleIcon')
	let lead = <Sparkle size="sm" color={brand} />

	if (phase === 'work') {
		title = `Restyling as ${name}`
		line = 'Sends as soon as it’s ready'
		lead = (
			<View style={{ width: 16, alignItems: 'center' }}>
				<Pulse color={brand} />
			</View>
		)
		actions = [button('Cancel', X, () => giveBack(channelId))]
	} else if (phase === 'review') {
		title = `${name} version is in the box`
		line = 'Tweak it if you want, then send'
		actions = [button('Put the original back', Undo, () => giveBack(channelId))]
	} else if (phase === 'fail') {
		title = `Couldn't restyle as ${name}`
		line = cur.job?.error ?? 'Something went wrong'
		lineColor = 'text-feedback-critical'
		actions = [
			button('Retry', Retry, () => retry(channelId)),
			button('Send without style', Send, () => sendAsIs(channelId)),
			button('Discard and edit', X, () => giveBack(channelId), danger),
		]
	}

	return (
		<Box
			pointerEvents={now ? 'auto' : 'none'}
			style={{
				marginBottom: 8,
				borderRadius: 16,
				borderWidth: 1,
				borderColor: phase === 'fail' ? danger : border,
				backgroundColor: bg,
				overflow: 'hidden',
				opacity: show,
				transform: [
					{
						translateY: show.interpolate({
							inputRange: [0, 1],
							outputRange: [10, 0],
						}),
					},
				],
			}}
		>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={`${title}. ${line}`}
				accessibilityHint="Opens styles"
				onPress={() => openSheet(channelId)}
				style={({ pressed }) => ({
					flexDirection: 'row',
					alignItems: 'center',
					gap: 10,
					paddingVertical: 4,
					paddingLeft: 12,
					paddingRight: 4,
					opacity: pressed ? 0.7 : 1,
				})}
			>
				{lead}
				<View style={{ flex: 1 }}>
					<Text variant="text-sm/semibold" color="text-default" lineClamp={1}>
						{title}
					</Text>
					<Text variant="text-xs/medium" color={lineColor} lineClamp={2}>
						{line}
					</Text>
				</View>
				{actions}
			</Pressable>
		</Box>
	)
}
