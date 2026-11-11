import { Design } from '@valenced/discord/design'
import { memo, useEffect, useRef } from 'react'
import {
	Animated,
	Dimensions,
	Easing,
	Pressable,
	StyleSheet,
	View,
} from 'react-native'
import { Chip } from './chip'
import {
	buzz,
	canJump,
	colors,
	contextMenus,
	jump,
	me,
	useToken,
} from './discord'
import { RepostIcon } from './icon'
import { menuItems } from './menu'
import { ago, isLong, MessageBody, Source } from './message'
import { useVersion } from './store'
import { verify } from './verify'
import { openFull } from './viewer'
import type { Entry } from '../shared/wire'

const seen = new Set<string>()
const FRESH = 20
const AView = (Animated as any)['View']

function useMenu(entry: Entry, owner: string) {
	const m = contextMenus()
	const state = m?.useContextMenuState?.()
	return (e: any) => {
		const items = menuItems(entry, owner)
		if (!m?.showContextMenu || !state || !items.length) return
		const { height } = Dimensions.get('window')
		const y = e?.nativeEvent?.pageY ?? height / 2
		const below = y < height * 0.55
		const close = (cancel?: boolean) => {
			const i = state.activeIndex?.get?.() ?? -1
			state.activeIndex?.set?.(-1)
			m.hideContextMenu()
			if (!cancel) items[i]?.action()
		}
		try {
			m.resetContextMenuState?.(state)
			buzz('IMPACT_MEDIUM')
			m.showContextMenu({
				key: `reposts-${owner}-${entry.m}`,
				items,
				x: 28,
				y: below ? y + 8 : height - y + 8,
				positionX: 'left',
				positionY: below ? 'below' : 'above',
				width: 1,
				height: 1,
				state,
				dividerIndexes: [],
				keyboardShouldPersistTaps: 'never',
				requestClose: close,
				onClose: () => {},
			})
		} catch {}
	}
}

export const RepostCard = memo(function RepostCard({
	entry,
	owner,
	index,
}: {
	entry: Entry
	owner: string
	index: number
}) {
	const { Text } = Design as any
	useVersion()
	const c = colors()
	const card = useToken(c.CARD_SECONDARY_BG ?? c.BACKGROUND_MOD_SUBTLE)
	const pressedBg = useToken(
		c.CARD_SECONDARY_BACKGROUND_ACTIVE ?? c.BACKGROUND_MOD_STRONG,
	)
	const glow = useToken(c.MENTION_BACKGROUND ?? c.BACKGROUND_MENTIONED)
	const muted = useToken(c.ICON_MUTED ?? c.TEXT_MUTED)
	const isMine = owner === me()

	const key = `${owner}:${entry.m}`
	const first = useRef(!seen.has(key))
	const fade = useRef(new Animated.Value(first.current ? 0 : 1)).current
	const scale = useRef(new Animated.Value(1)).current
	const fresh = first.current && Date.now() / 1000 - entry.at < FRESH
	const flash = useRef(new Animated.Value(fresh ? 1 : 0)).current
	useEffect(() => {
		seen.add(key)
		verify(entry)
		if (!first.current) return
		Animated.timing(fade, {
			toValue: 1,
			duration: 260,
			delay: Math.min(index, 6) * 45,
			easing: Easing.out(Easing.cubic),
			useNativeDriver: true,
		}).start()
		if (fresh)
			Animated.timing(flash, {
				toValue: 0,
				duration: 1400,
				delay: 500,
				easing: Easing.inOut(Easing.quad),
				useNativeDriver: false,
			}).start()
	}, [entry.m])

	const press = (to: number) =>
		Animated.spring(scale, {
			toValue: to,
			useNativeDriver: true,
			speed: 40,
			bounciness: 0,
		}).start()

	const jumpable = canJump(entry, owner)
	const openMenu = useMenu(entry, owner)
	const more = () => openFull(entry, owner)

	return (
		<AView
			style={{
				opacity: fade,
				transform: [
					{
						translateY: fade.interpolate({
							inputRange: [0, 1],
							outputRange: [10, 0],
						}),
					},
					{ scale },
				],
			}}
		>
			<Pressable
				onPress={jumpable && !isLong(entry) ? () => jump(entry) : more}
				onLongPress={openMenu}
				onPressIn={() => press(0.985)}
				onPressOut={() => press(1)}
				delayLongPress={380}
				accessibilityRole="button"
				accessibilityHint="Hold for options"
			>
				{({ pressed }: { pressed: boolean }) => (
					<AView
						style={{
							backgroundColor: pressed ? pressedBg : card,
							borderRadius: 16,
							paddingTop: 12,
							paddingBottom: 10,
							paddingHorizontal: 14,
							gap: 8,
							overflow: 'hidden',
						}}
					>
						<AView
							pointerEvents="none"
							style={[
								StyleSheet.absoluteFill,
								{ backgroundColor: glow, opacity: flash },
							]}
						/>
						<View
							style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
						>
							<RepostIcon size={14} color={muted} />
							<Text
								variant="text-xs/semibold"
								color="text-muted"
								style={{ flex: 1 }}
							>
								{`${isMine ? 'You reposted' : 'Reposted'} · ${ago(entry.at)}`}
							</Text>
							{entry.x && isMine ? (
								<Text variant="text-xs/semibold" color="text-danger">
									Hidden after reports
								</Text>
							) : (
								<Chip entry={entry} />
							)}
						</View>
						<MessageBody entry={entry} onMore={more} />
						{(!entry.p || isMine) && <Source entry={entry} />}
					</AView>
				)}
			</Pressable>
		</AView>
	)
})
