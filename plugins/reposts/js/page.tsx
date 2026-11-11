import { Design } from '@valenced/discord/design'
import { memo, useEffect, useRef, useState } from 'react'
import { Animated, Easing, Text as RNText, View } from 'react-native'
import { connect } from './auth'
import { RepostCard } from './card'
import { countFor, listFor, refreshIndex, refreshList } from './data'
import { assetIcon, colors, me, useToken } from './discord'
import { RepostIcon } from './icon'
import { account, connected, live, saved, useVersion } from './store'
import type { Entry } from '../shared/wire'

const PAGE = 12
const SIDE = 16
const AView = (Animated as any)['View']

function useDelayed(on: boolean, ms = 180) {
	const [show, setShow] = useState(false)
	useEffect(() => {
		if (!on) return setShow(false)
		const t = setTimeout(() => setShow(true), ms)
		return () => clearTimeout(t)
	}, [on, ms])
	return show
}

function Pulse({ children }: { children: any }) {
	const v = useRef(new Animated.Value(0.45)).current
	useEffect(() => {
		const loop = Animated.loop(
			Animated.sequence([
				Animated.timing(v, {
					toValue: 1,
					duration: 700,
					easing: Easing.inOut(Easing.quad),
					useNativeDriver: true,
				}),
				Animated.timing(v, {
					toValue: 0.45,
					duration: 700,
					easing: Easing.inOut(Easing.quad),
					useNativeDriver: true,
				}),
			]),
		)
		loop.start()
		return () => loop.stop()
	}, [v])
	return <AView style={{ opacity: v }}>{children}</AView>
}

function Skeleton() {
	const c = colors()
	const bg = useToken(c.BACKGROUND_MOD_NORMAL ?? c.BACKGROUND_MOD_SUBTLE)
	const card = useToken(c.CARD_SECONDARY_BG ?? c.BACKGROUND_MOD_SUBTLE)
	const bar = (w: number | string, h = 12) => (
		<View
			style={{
				width: w as any,
				height: h,
				borderRadius: h / 2,
				backgroundColor: bg,
			}}
		/>
	)
	return (
		<Pulse>
			<View style={{ gap: 12 }}>
				{[0, 1, 2].map(i => (
					<View
						key={i}
						style={{
							backgroundColor: card,
							borderRadius: 16,
							padding: 14,
							gap: 12,
						}}
					>
						{bar(110, 10)}
						<View style={{ flexDirection: 'row', gap: 12 }}>
							<View
								style={{
									width: 40,
									height: 40,
									borderRadius: 20,
									backgroundColor: bg,
								}}
							/>
							<View style={{ flex: 1, gap: 8, paddingTop: 2 }}>
								{bar('45%')}
								{bar(i === 1 ? '70%' : '92%')}
								{i !== 1 && bar('60%')}
							</View>
						</View>
					</View>
				))}
			</View>
		</Pulse>
	)
}

function Badge({ size = 64 }: { size?: number }) {
	const c = colors()
	const bg = useToken(c.BACKGROUND_MOD_SUBTLE)
	const fg = useToken(c.ICON_STRONG ?? c.INTERACTIVE_NORMAL)
	return (
		<View
			style={{
				width: size,
				height: size,
				borderRadius: size / 2,
				backgroundColor: bg,
				alignItems: 'center',
				justifyContent: 'center',
			}}
		>
			<RepostIcon size={Math.round(size * 0.48)} color={fg} />
		</View>
	)
}

function HoldHint() {
	const { Text } = Design as any
	const c = colors()
	const card = useToken(c.CARD_SECONDARY_BG ?? c.BACKGROUND_MOD_SUBTLE)
	const bar = useToken(c.BACKGROUND_MOD_NORMAL ?? c.BACKGROUND_MOD_SUBTLE)
	const menu = useToken(c.BACKGROUND_SURFACE_HIGHEST ?? c.BACKGROUND_FLOATING)
	const border = useToken(c.BORDER_SUBTLE ?? c.BACKGROUND_MOD_SUBTLE)
	const fg = useToken(c.ICON_STRONG ?? c.INTERACTIVE_NORMAL)
	const touch = useToken(c.BACKGROUND_BRAND ?? c.BRAND_500)
	const pulse = useRef(new Animated.Value(0)).current
	useEffect(() => {
		const loop = Animated.loop(
			Animated.timing(pulse, {
				toValue: 1,
				duration: 1600,
				easing: Easing.out(Easing.quad),
				useNativeDriver: true,
			}),
		)
		loop.start()
		return () => loop.stop()
	}, [pulse])
	return (
		<View style={{ width: 250, height: 104, alignSelf: 'center' }}>
			<View
				style={{
					position: 'absolute',
					left: 0,
					top: 6,
					right: 30,
					backgroundColor: card,
					borderRadius: 14,
					padding: 12,
					flexDirection: 'row',
					gap: 10,
				}}
			>
				<View
					style={{
						width: 28,
						height: 28,
						borderRadius: 14,
						backgroundColor: bar,
					}}
				/>
				<View style={{ flex: 1, gap: 7, paddingTop: 3 }}>
					<View
						style={{
							width: '45%',
							height: 8,
							borderRadius: 4,
							backgroundColor: bar,
						}}
					/>
					<View
						style={{
							width: '90%',
							height: 8,
							borderRadius: 4,
							backgroundColor: bar,
						}}
					/>
					<View
						style={{
							width: '65%',
							height: 8,
							borderRadius: 4,
							backgroundColor: bar,
						}}
					/>
				</View>
			</View>
			<AView
				style={{
					position: 'absolute',
					left: 92,
					top: 30,
					width: 26,
					height: 26,
					borderRadius: 13,
					backgroundColor: touch,
					opacity: pulse.interpolate({
						inputRange: [0, 1],
						outputRange: [0.45, 0],
					}),
					transform: [
						{
							scale: pulse.interpolate({
								inputRange: [0, 1],
								outputRange: [0.6, 1.8],
							}),
						},
					],
				}}
			/>
			<View
				style={{
					position: 'absolute',
					right: 0,
					bottom: 0,
					flexDirection: 'row',
					alignItems: 'center',
					gap: 10,
					paddingHorizontal: 14,
					height: 42,
					borderRadius: 12,
					backgroundColor: menu,
					borderWidth: 1,
					borderColor: border,
					shadowColor: '#000',
					shadowOpacity: 0.35,
					shadowRadius: 10,
					elevation: 8,
				}}
			>
				<RepostIcon size={18} color={fg} />
				<Text variant="text-sm/semibold" color="text-strong">
					Repost
				</Text>
			</View>
		</View>
	)
}

const FAUX = [
	{
		who: 'mira',
		color: '#5865f2',
		lines: [
			'ok this is the funniest thing anyone',
			'has said in this server all year',
		],
		when: 'Reposted · 2h',
		pic: false,
	},
	{
		who: 'theo',
		color: '#eb459e',
		lines: [
			'the pasta water should taste like',
			'the sea. i will not elaborate',
		],
		when: 'Reposted · 5h',
		pic: true,
	},
	{
		who: 'Anonymous',
		color: '#4e5058',
		lines: ['whoever keeps microwaving fish', 'at work: we know'],
		when: 'Reposted · 1d',
		pic: false,
	},
]

function Blurred({
	text,
	size = 15,
	color,
}: {
	text: string
	size?: number
	color: string
}) {
	return (
		<RNText
			numberOfLines={1}
			style={{
				fontSize: size,
				lineHeight: size + 6,
				fontFamily: 'ggsans-Medium',
				color: 'rgba(255,255,255,0.01)',
				textShadowColor: color,
				textShadowRadius: 9,
				textShadowOffset: { width: 0, height: 0 },
			}}
		>
			{text}
		</RNText>
	)
}

function FauxCard({ f }: { f: (typeof FAUX)[number] }) {
	const c = colors()
	const card = useToken(c.CARD_SECONDARY_BG ?? c.BACKGROUND_MOD_SUBTLE)
	const strong = useToken(c.TEXT_STRONG ?? c.TEXT_NORMAL)
	const muted = useToken(c.TEXT_MUTED)
	return (
		<View
			style={{ backgroundColor: card, borderRadius: 16, padding: 14, gap: 8 }}
		>
			<Blurred text={f.when} size={12} color={muted} />
			<View style={{ flexDirection: 'row', gap: 12 }}>
				<View
					style={{
						width: 40,
						height: 40,
						alignItems: 'center',
						justifyContent: 'center',
					}}
				>
					{[50, 44, 38, 32].map((d, i) => (
						<View
							key={d}
							style={{
								position: 'absolute',
								width: d,
								height: d,
								borderRadius: d / 2,
								backgroundColor: f.color,
								opacity: [0.12, 0.2, 0.3, 0.45][i],
							}}
						/>
					))}
				</View>
				<View style={{ flex: 1, gap: 2 }}>
					<Blurred text={f.who} size={16} color={strong} />
					{f.lines.map(l => (
						<Blurred key={l} text={l} color={strong} />
					))}
					{f.pic && (
						<View
							style={{
								marginTop: 6,
								height: 70,
								borderRadius: 10,
								backgroundColor: f.color,
								opacity: 0.35,
							}}
						/>
					)}
				</View>
			</View>
		</View>
	)
}

function Locked() {
	const { Text, Button } = Design as any
	const c = colors()
	const brand = useToken(c.BACKGROUND_BRAND ?? c.BRAND_500)
	const panel = useToken(c.BACKGROUND_SURFACE_HIGHEST ?? c.BACKGROUND_FLOATING)
	const border = useToken(c.BORDER_SUBTLE ?? c.BACKGROUND_MOD_SUBTLE)
	const lockBg = useToken(c.BACKGROUND_BASE_LOWEST ?? c.BACKGROUND_TERTIARY)
	const muted = useToken(c.ICON_MUTED ?? c.TEXT_MUTED)
	const drift = useRef(new Animated.Value(0)).current
	const enter = useRef(new Animated.Value(0)).current
	useEffect(() => {
		const loop = Animated.loop(
			Animated.sequence([
				Animated.timing(drift, {
					toValue: 1,
					duration: 5000,
					easing: Easing.inOut(Easing.sin),
					useNativeDriver: true,
				}),
				Animated.timing(drift, {
					toValue: 0,
					duration: 5000,
					easing: Easing.inOut(Easing.sin),
					useNativeDriver: true,
				}),
			]),
		)
		loop.start()
		Animated.spring(enter, {
			toValue: 1,
			useNativeDriver: true,
			speed: 14,
			bounciness: 6,
		}).start()
		return () => loop.stop()
	}, [drift, enter])
	const Lock = assetIcon('LockIcon')
	const Shield = assetIcon('ShieldIcon')
	return (
		<View style={{ minHeight: 470, justifyContent: 'center' }}>
			<AView
				pointerEvents="none"
				style={{
					position: 'absolute',
					left: 0,
					right: 0,
					top: 0,
					gap: 12,
					opacity: 0.7,
					transform: [
						{
							translateY: drift.interpolate({
								inputRange: [0, 1],
								outputRange: [0, -14],
							}),
						},
					],
				}}
			>
				{FAUX.map(f => (
					<FauxCard key={f.who} f={f} />
				))}
			</AView>
			<AView
				style={{
					marginHorizontal: 12,
					alignItems: 'center',
					gap: 12,
					paddingHorizontal: 20,
					paddingTop: 24,
					paddingBottom: 20,
					borderRadius: 20,
					backgroundColor: panel,
					borderWidth: 1,
					borderColor: border,
					shadowColor: '#000',
					shadowOpacity: 0.5,
					shadowRadius: 24,
					elevation: 16,
					opacity: enter,
					transform: [
						{
							scale: enter.interpolate({
								inputRange: [0, 1],
								outputRange: [0.94, 1],
							}),
						},
					],
				}}
			>
				<View style={{ width: 64, height: 64 }}>
					<View
						style={{
							width: 64,
							height: 64,
							borderRadius: 22,
							backgroundColor: brand,
							alignItems: 'center',
							justifyContent: 'center',
						}}
					>
						<RepostIcon size={34} color="#fff" />
					</View>
					<View
						style={{
							position: 'absolute',
							right: -6,
							bottom: -6,
							width: 26,
							height: 26,
							borderRadius: 13,
							backgroundColor: lockBg,
							alignItems: 'center',
							justifyContent: 'center',
							borderWidth: 2,
							borderColor: panel,
						}}
					>
						<Lock size="xs" color="#fff" />
					</View>
				</View>
				<View style={{ alignItems: 'center', gap: 6 }}>
					<Text
						variant="heading-lg/bold"
						color="text-strong"
						style={{ textAlign: 'center' }}
					>
						Unlock Reposts
					</Text>
					<Text
						variant="text-sm/medium"
						color="text-muted"
						style={{ textAlign: 'center' }}
					>
						Connect with Discord to keep the messages you love on your profile,
						and see what friends repost.
					</Text>
				</View>
				<View style={{ alignSelf: 'stretch', marginTop: 4 }}>
					<Button
						text={live.connecting ? 'Connecting…' : 'Connect with Discord'}
						variant="primary"
						size="lg"
						loading={live.connecting}
						onPress={connect}
					/>
				</View>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
					<Shield size="xxs" color={muted} />
					<Text variant="text-xs/medium" color="text-muted">
						Only your Discord ID is shared
					</Text>
				</View>
			</AView>
		</View>
	)
}

function Message({
	title,
	body,
	children,
	tip,
}: {
	title: string
	body?: string
	children?: any
	tip?: boolean
}) {
	const { Text } = Design as any
	return (
		<View
			style={{
				alignItems: 'center',
				paddingVertical: 24,
				paddingHorizontal: 8,
				gap: 14,
			}}
		>
			<Badge />
			<View style={{ alignItems: 'center', gap: 6 }}>
				<Text
					variant="heading-lg/bold"
					color="text-strong"
					style={{ textAlign: 'center' }}
				>
					{title}
				</Text>
				{!!body && (
					<Text
						variant="text-sm/medium"
						color="text-muted"
						style={{ textAlign: 'center', maxWidth: 300 }}
					>
						{body}
					</Text>
				)}
			</View>
			{tip && <HoldHint />}
			{children}
		</View>
	)
}

function Header({ uid, n, mine }: { uid: string; n: number; mine: boolean }) {
	const { Text } = Design as any
	const failed = live.failed.get(uid)
	const syncing = mine && account().queue.length > 0
	const note = failed ? 'Offline · showing saved' : syncing ? 'Saving…' : ''
	return (
		<View
			style={{
				flexDirection: 'row',
				alignItems: 'center',
				justifyContent: 'space-between',
				minHeight: 20,
			}}
		>
			<Text variant="text-sm/semibold" color="text-muted">
				{n === 1 ? '1 repost' : `${n} reposts`}
			</Text>
			{!!note && (
				<Text variant="text-xs/medium" color="text-muted">
					{note}
				</Text>
			)}
		</View>
	)
}

function Body({ uid }: { uid: string }) {
	const { Button, Text } = Design as any
	useVersion()
	const mine = uid === me()
	const [limit, setLimit] = useState(PAGE)
	const [showHidden, setShowHidden] = useState(false)
	const list = listFor(uid)
	const loading = live.loading.has(uid)
	const failed = live.failed.get(uid)
	const slowLoad = useDelayed(!list && loading)

	if (mine && !connected()) return <Locked />

	if (!list) {
		if (failed && !loading)
			return (
				<Message title="Couldn't load reposts" body={failed}>
					<Button
						text="Try again"
						variant="secondary"
						size="md"
						onPress={() => refreshList(uid, true)}
					/>
				</Message>
			)
		return slowLoad ? <Skeleton /> : <View style={{ height: 240 }} />
	}

	const hiddenKeys = new Set(saved.hidden)
	const shown: Entry[] = []
	let hiddenCount = 0
	for (const e of list) {
		if (!mine && hiddenKeys.has(`${uid}:${e.m}`) && !showHidden) hiddenCount++
		else shown.push(e)
	}

	if (!shown.length && !hiddenCount)
		return mine ? (
			<Message
				title="Nothing reposted yet"
				body="Hold any message and tap Repost. It shows up here right away."
				tip
			/>
		) : (
			<Message title="No reposts right now" body="Check back later." />
		)

	return (
		<View style={{ gap: 12 }}>
			<Header
				uid={uid}
				n={mine ? shown.length : countFor(uid) - hiddenCount}
				mine={mine}
			/>
			{shown.slice(0, limit).map((e, i) => (
				<RepostCard key={e.m} entry={e} owner={uid} index={i} />
			))}
			{shown.length > limit && (
				<Button
					text={`Show ${Math.min(PAGE, shown.length - limit)} more`}
					variant="secondary"
					size="md"
					onPress={() => setLimit(l => l + PAGE)}
				/>
			)}
			{hiddenCount > 0 && (
				<Text
					variant="text-xs/medium"
					color="text-muted"
					style={{ textAlign: 'center', paddingVertical: 6 }}
					onPress={() => setShowHidden(true)}
				>
					{hiddenCount === 1
						? '1 repost you hid · Show'
						: `${hiddenCount} reposts you hid · Show`}
				</Text>
			)}
		</View>
	)
}

export const RepostsPage = memo(function RepostsPage({ uid }: { uid: string }) {
	useEffect(() => {
		refreshList(uid)
		refreshIndex()
	}, [uid])
	return (
		<View
			style={{ paddingHorizontal: SIDE, paddingTop: 16, paddingBottom: 32 }}
		>
			<Body uid={uid} />
		</View>
	)
})
