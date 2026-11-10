import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { useEffect, useRef, useState } from 'react'
import { Animated, Image, Pressable, View } from 'react-native'
import { icon } from './common'
import { discard, hosts, retry, size, useUploads } from './upload'
import type { Item, Job } from './upload'

const Box: typeof Animated.View = (Animated as any).View

const who = (u: any) => u?.globalName ?? u?.global_name ?? u?.username ?? 'them'

function replyTo(job?: Job) {
	const ref = job?.args?.[3]?.messageReference
	if (!ref?.message_id) return
	try {
		const m = (Stores as any).MessageStore.getMessage(
			ref.channel_id ?? job?.channelId,
			ref.message_id,
		)
		return m?.author ? who(m.author) : undefined
	} catch {}
}

const tokens = () => (Tokens as any).default ?? Tokens

function Thumb({ item }: { item: Item }) {
	const [broken, setBroken] = useState(false)
	const color = (Design as any).useToken(tokens().colors.ICON_SUBTLE)
	const bg = (Design as any).useToken(tokens().colors.BACKGROUND_MOD_SUBTLE)
	const box = {
		width: 40,
		height: 40,
		borderRadius: 10,
		overflow: 'hidden' as const,
		backgroundColor: bg,
		alignItems: 'center' as const,
		justifyContent: 'center' as const,
	}
	if (item.type.startsWith('image/') && !broken)
		return (
			<View style={box}>
				<Image
					source={{ uri: item.uri }}
					style={{ width: 40, height: 40 }}
					resizeMode="cover"
					onError={() => setBroken(true)}
				/>
			</View>
		)
	const Icon = icon(
		item.type.startsWith('video/')
			? 'VideoIcon'
			: item.type.startsWith('image/')
				? 'ImageIcon'
				: 'FileIcon',
	)
	return (
		<View style={box}>
			<Icon size="md" color={color} />
		</View>
	)
}

export function Status({ channelId }: { channelId?: string }) {
	const { jobs, progress } = useUploads()
	const job = jobs.find(j => !channelId || j.channelId === channelId)
	const file: Item | undefined =
		job?.files.find(f => f.status === 'up') ??
		job?.files.find(f => f.status === 'fail') ??
		job?.files[0]
	const [shown, setShown] = useState<{ job: Job; file: Item } | undefined>(
		job && file ? { job, file } : undefined,
	)
	const show = useRef(new Animated.Value(job ? 1 : 0)).current
	const bar = useRef(new Animated.Value(0)).current

	const t = tokens().colors
	const useToken = (Design as any).useToken
	const bg = useToken(t.MOBILE_FLOATINGBAR_BACKGROUND_HIGHER)
	const border = useToken(t.BORDER_MUTED)
	const track = useToken(t.BACKGROUND_MOD_SUBTLE)
	const brand = useToken(t.TEXT_BRAND)
	const danger = useToken(t.TEXT_FEEDBACK_CRITICAL)
	const muted = useToken(t.INTERACTIVE_ICON_DEFAULT)

	const uploading = file?.status === 'up'
	const broken = !!job?.error

	useEffect(() => {
		if (job && file) {
			if (file.id !== shown?.file.id && uploading) bar.setValue(0)
			setShown({ job, file })
			Animated.spring(show, {
				toValue: 1,
				useNativeDriver: true,
				speed: 18,
				bounciness: 4,
			}).start()
		} else if (shown)
			Animated.timing(show, {
				toValue: 0,
				duration: 180,
				delay: 120,
				useNativeDriver: true,
			}).start(({ finished }) => finished && setShown(undefined))
	}, [job, file?.id, file?.status])

	useEffect(() => {
		Animated.timing(bar, {
			toValue: uploading ? progress : broken ? 1 : 1,
			duration: 160,
			useNativeDriver: false,
		}).start()
	}, [progress, uploading, broken])

	if (!shown) return null
	const cur = job && file ? { job, file } : shown

	const { Text } = Design as any
	const X = icon('XSmallIcon')
	const Retry = icon('RetryIcon')
	const pct = Math.round((uploading ? progress : 1) * 100)
	const host = hosts[cur.file.host].name
	const total = cur.job.files.length
	const doneCount = cur.job.files.filter(f => f.status === 'done').length
	const to = replyTo(cur.job)
	const line = cur.job.error
		? cur.job.error
		: [
				to ? `Replying to ${to}` : `Uploading to ${host}`,
				total > 1 ? `${Math.min(doneCount + 1, total)} of ${total}` : null,
				cur.file.size ? size(cur.file.size) : null,
				pct >= 99 ? 'Finishing up' : `${pct}%`,
			]
				.filter(Boolean)
				.join(' · ')

	const button = (
		label: string,
		Icon: any,
		onPress: () => void,
		color: string,
	) => (
		<Pressable
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

	return (
		<Box
			pointerEvents={job ? 'auto' : 'none'}
			style={{
				marginBottom: 8,
				borderRadius: 16,
				borderWidth: 1,
				borderColor: border,
				backgroundColor: bg,
				overflow: 'hidden',
				opacity: show,
				transform: [
					{
						translateY: show.interpolate({
							inputRange: [0, 1],
							outputRange: [12, 0],
						}),
					},
				],
			}}
		>
			<View
				style={{
					flexDirection: 'row',
					alignItems: 'center',
					gap: 12,
					paddingVertical: 10,
					paddingLeft: 10,
					paddingRight: 6,
				}}
			>
				<Thumb item={cur.file} />
				<View style={{ flex: 1 }}>
					<Text variant="text-sm/semibold" color="text-default" lineClamp={1}>
						{cur.file.name}
					</Text>
					<Text
						variant="text-xs/medium"
						color={cur.job.error ? 'text-feedback-critical' : 'text-muted'}
						lineClamp={1}
					>
						{line}
					</Text>
				</View>
				{!!cur.job.error &&
					button('Retry', Retry, () => retry(cur.job.id), muted)}
				{button(
					cur.job.error ? 'Remove' : 'Cancel',
					X,
					() => discard(cur.job.id),
					muted,
				)}
			</View>
			<View style={{ height: 3, backgroundColor: track }}>
				<Box
					style={{
						height: 3,
						backgroundColor: cur.job.error ? danger : brand,
						width: bar.interpolate({
							inputRange: [0, 1],
							outputRange: ['0%', '100%'],
						}),
					}}
				/>
			</View>
		</Box>
	)
}
