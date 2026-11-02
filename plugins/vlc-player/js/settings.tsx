import { Design } from '@valenced/discord/design'
import { callNativeMethod } from '@valenced/modules/native'
import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, ScrollView, View } from 'react-native'

import { state } from './viewer'

interface Status {
	phase: string
	progress: number
	error: string
	restart: boolean
	abi: string
	size: number
	version: string
	allVideos: boolean
	fileCards: boolean
}

const call = callNativeMethod as (name: string, args: unknown[]) => Promise<any>

const labels: Record<string, string> = {
	idle: 'Not running',
	checking: 'Checking',
	downloading: 'Downloading',
	ready: 'Installed',
	bundled: 'Installed',
	failed: 'Download failed',
}

const dots: Record<string, string> = {
	ready: '#23A55A',
	bundled: '#23A55A',
	failed: '#F23F43',
}

const Fill = (Animated as any)['View']

const megabytes = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`

function Progress({ value }: { value: number }) {
	const width = useRef(new Animated.Value(0)).current

	useEffect(() => {
		Animated.timing(width, {
			toValue: value,
			duration: 350,
			easing: Easing.out(Easing.cubic),
			useNativeDriver: false,
		}).start()
	}, [value])

	return (
		<View
			style={{
				height: 8,
				borderRadius: 4,
				overflow: 'hidden',
				backgroundColor: 'rgba(128, 132, 142, 0.25)',
			}}
		>
			<Fill
				style={{
					height: 8,
					borderRadius: 4,
					backgroundColor: '#5865F2',
					width: width.interpolate({
						inputRange: [0, 1],
						outputRange: ['0%', '100%'],
					}),
				}}
			/>
		</View>
	)
}

export function Settings() {
	const { Button, Stack, TableRow, TableRowGroup, TableSwitchRow } =
		Design as any
	const [status, setStatus] = useState<Status | null>(null)
	const busy = status?.phase === 'downloading' || status?.phase === 'checking'

	const refresh = () =>
		call('mlemvlc.status', [])
			.then(setStatus)
			.catch(() => setStatus(null))

	useEffect(() => {
		refresh()
		const timer = setInterval(refresh, busy ? 300 : 1500)
		return () => clearInterval(timer)
	}, [busy])

	const phase = status?.phase ?? 'idle'
	const row = (label: string, value: string) => (
		<TableRow label={label} trailing={<TableRow.TrailingText text={value} />} />
	)

	return (
		<ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 64 }}>
			<Stack spacing={16}>
				<TableRowGroup title="Playback">
					<TableSwitchRow
						label="Play all videos in VLC"
						subLabel="Plays every video in chat with VLC instead of Discord's player"
						value={status?.allVideos ?? true}
						disabled={!status}
						onValueChange={(value: boolean) => {
							setStatus(s => (s ? { ...s, allVideos: value } : s))
							state.all = value
							call('mlemvlc.setAllVideos', [value]).then(refresh)
						}}
					/>
						<TableSwitchRow
							label="Show video files in chat"
							subLabel="Turns mkv, avi and other video files into players"
							value={status?.fileCards ?? true}
							disabled={!status}
							onValueChange={(value: boolean) => {
								setStatus(s => (s ? { ...s, fileCards: value } : s))
								call('mlemvlc.setFileCards', [value]).then(refresh)
							}}
						/>
				</TableRowGroup>
				<TableRowGroup title="Engine">
					<TableRow
						label={labels[phase] ?? phase}
						subLabel={
							status?.error && phase === 'failed'
								? status.error
								: status?.restart
									? 'restart discord to use the new copy'
									: undefined
						}
						icon={
							<View
								style={{
									width: 12,
									height: 12,
									margin: 6,
									borderRadius: 6,
									backgroundColor: dots[phase] ?? '#F0B232',
								}}
							/>
						}
						trailing={
							phase === 'downloading' ? (
								<TableRow.TrailingText
									text={`${Math.round((status?.progress ?? 0) * 100)}%`}
								/>
							) : undefined
						}
					/>
					{row('Build', status?.abi || 'unknown')}
					{row('Size', status?.size ? megabytes(status.size) : 'none')}
					{row('libVLC', status?.version.split(' ')[0] || 'not loaded')}
				</TableRowGroup>
				{phase === 'downloading' && <Progress value={status?.progress ?? 0} />}
				{phase !== 'bundled' && (
					<Button
						text={
							busy ? 'Downloading' : status?.size ? 'Redownload' : 'Download'
						}
						size="md"
						disabled={busy || !status}
						onPress={() => {
							call('mlemvlc.redownload', []).then(refresh)
						}}
					/>
				)}
			</Stack>
		</ScrollView>
	)
}
