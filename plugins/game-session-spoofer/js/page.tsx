import { getAssetIdByName } from '@valenced/assets'
import TableRowAssetIcon from '@valenced/components/TableRowAssetIcon'
import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { createElement, Fragment, useEffect, useMemo, useState } from 'react'
import { ScrollView, View } from 'react-native'
import {
	Bar,
	cap,
	colors,
	fmt,
	fmtMinutes,
	GameIcon,
	icon,
	useIcons,
	useNow,
	useToken,
} from './common'
import { HEARTBEAT_MS } from './credit'
import { loaded, loadGames, search } from './games'
import {
	current,
	extend,
	publish,
	setForever,
	shown,
	skip,
	startQueue,
	status,
	stopAll,
	stopSession,
	syncCredit,
} from './session'
import { openGame, openShuffle, queueOpen } from './sheet'
import { data, save, useData } from './store'
import type { App } from './games'
import type { Queued } from './store'

function useGames() {
	const [apps, setApps] = useState<App[] | null>(loaded)
	const [error, setError] = useState<string | null>(null)
	const [n, setN] = useState(0)
	useEffect(() => {
		if (apps) return
		setError(null)
		loadGames().then(setApps, e =>
			setError(e?.message ?? 'Could not load games'),
		)
	}, [n])
	return { apps, error, retry: () => setN(x => x + 1) }
}

function confirm(title: string, body: string, yes: string, run: () => void) {
	const { AlertModal, AlertActionButton } = Design as any
	AlertActionCreators.openAlert(
		'gss-confirm',
		createElement(AlertModal, {
			title,
			content: body,
			actions: createElement(
				Fragment,
				null,
				createElement(AlertActionButton, {
					text: yes,
					variant: 'destructive',
					onPress: run,
				}),
				createElement(AlertActionButton, {
					text: 'Cancel',
					variant: 'secondary',
				}),
			),
		}),
	)
}

const SHOWN: Record<string, [string, string] | undefined> = {
	invisible: [
		'WarningIcon',
		"You're invisible, so nobody sees it. Your playtime still counts if that's on.",
	],
	hidden: [
		'EyeSlashIcon',
		'Activity sharing is off. Turn on "Share your activity" in Content & Social to show it.',
	],
	missing: [
		'WarningIcon',
		'Discord is showing another activity instead. Discord only shows one game at a time.',
	],
	waiting: ['ClockIcon', 'Waiting for Discord to pick it up...'],
}

function NowPlaying() {
	const { Text, Button } = Design as any
	const d = useData()
	const now = useNow()
	const c = colors()
	const card = useToken(c.CARD_PRIMARY_BG ?? c.BACKGROUND_MOD_SUBTLE)
	const border = useToken(c.BORDER_SUBTLE ?? c.BACKGROUND_MOD_SUBTLE)
	const muted = useToken(c.TEXT_MUTED)
	const green = useToken(c.TEXT_FEEDBACK_POSITIVE ?? c.STATUS_POSITIVE)
	const s = current()
	const box = {
		borderRadius: 16,
		backgroundColor: card,
		borderWidth: 1,
		borderColor: border,
		padding: 16,
		gap: 14,
	}

	if (!s)
		return (
			<View
				style={[box, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}
			>
				<GameIcon id="none" hash={null} size={48} />
				<View style={{ flex: 1, gap: 2 }}>
					<Text variant="text-md/semibold" color="text-strong">
						Not playing anything
					</Text>
					<Text variant="text-sm/medium" color="text-muted">
						{d.queue.length
							? `${d.queue.length} ${d.queue.length === 1 ? 'game' : 'games'} waiting in your queue`
							: 'Search for a game below to start'}
					</Text>
				</View>
				{!!d.queue.length && (
					<Button
						text="Start"
						size="sm"
						variant="primary"
						onPress={() => startQueue()}
					/>
				)}
			</View>
		)

	const played = now - s.start
	const left = s.endsAt ? s.endsAt - now : 0
	const progress = s.endsAt ? (now - s.start) / (s.endsAt - s.start) : 0
	const vis = shown()
	const warn = SHOWN[vis]
	const Warn = warn && icon(warn[0])
	const next = d.queue[0]

	return (
		<View style={box}>
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
				<GameIcon id={s.game.id} hash={s.game.icon} size={56} />
				<View style={{ flex: 1, gap: 2 }}>
					<Text variant="eyebrow" style={{ color: green }}>
						{vis === 'shown' ? 'Playing now' : 'Playing'}
					</Text>
					<Text variant="text-lg/bold" color="text-strong" lineClamp={2}>
						{s.game.name}
					</Text>
					<Text variant="text-sm/medium" color="text-muted">
						{s.endsAt
							? `Played for ${fmt(played)}, ${fmt(left)} left`
							: `Played for ${fmt(played)}, until you stop`}
					</Text>
				</View>
			</View>

			{!!s.endsAt && <Bar value={progress} />}

			{warn && Warn && (
				<View
					style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}
				>
					<Warn size="xs" color={muted} />
					<Text variant="text-xs/medium" color="text-muted" style={{ flex: 1 }}>
						{warn[1]}
					</Text>
				</View>
			)}

			{d.credit && (
				<Text
					variant="text-xs/medium"
					color={status.error ? 'text-feedback-critical' : 'text-muted'}
				>
					{status.error
						? `Playtime not sent: ${status.error}. Retrying in a few minutes.`
						: s.credit?.launched
							? `${cap(fmt(s.credit.creditedUntil - s.start))} of playtime sent${status.sent ? `, next update in ${fmt(status.sent + HEARTBEAT_MS - now)}` : ''}`
							: 'Sending playtime to Discord...'}
				</Text>
			)}

			{next && (
				<Text variant="text-xs/medium" color="text-muted" lineClamp={1}>
					{s.endsAt
						? `Up next: ${next.name} in ${fmt(left)}`
						: `Up next: ${next.name}, after you skip`}
				</Text>
			)}

			<View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
				<Button
					text="Stop"
					size="sm"
					variant="destructive"
					onPress={() => (d.queue.length ? stopSession() : stopAll())}
				/>
				{!!d.queue.length && (
					<Button
						text="Skip"
						size="sm"
						variant="secondary"
						onPress={() => skip()}
					/>
				)}
				{s.endsAt ? (
					<>
						<Button
							text="+30m"
							size="sm"
							variant="secondary"
							onPress={() => extend(30)}
						/>
						<Button
							text="+2h"
							size="sm"
							variant="secondary"
							onPress={() => extend(120)}
						/>
					</>
				) : null}
				{s.endsAt ? (
					<Button
						text="Forever"
						size="sm"
						variant="secondary"
						onPress={() => setForever()}
					/>
				) : null}
			</View>
		</View>
	)
}

function Search() {
	const { TextInput, TableRowGroup, TableRow, Text, Button } = Design as any
	const { apps, error, retry } = useGames()
	const [q, setQ] = useState('')
	const d = useData()
	useIcons()
	const results = useMemo(() => (apps ? search(apps, q) : []), [apps, q])
	const typing = q.trim().length >= 2

	return (
		<View style={{ gap: 12 }}>
			<TextInput
				placeholder={
					apps
						? `Search ${apps.length.toLocaleString('en-US')} games`
						: error
							? "Couldn't load the game list"
							: 'Loading the game list...'
				}
				value={q}
				onChange={setQ}
				isClearable
				onClear={() => setQ('')}
				autoCorrect={false}
				returnKeyType="search"
				leadingIcon={icon('MagnifyingGlassIcon')}
				isDisabled={!apps}
			/>

			{error && (
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
					<Text
						variant="text-sm/medium"
						color="text-feedback-critical"
						style={{ flex: 1 }}
					>
						{error}
					</Text>
					<Button text="Retry" size="sm" variant="secondary" onPress={retry} />
				</View>
			)}

			{typing && apps && (
				<TableRowGroup
					title={
						results.length
							? `${results.length >= 40 ? 'Top 40' : results.length} results`
							: undefined
					}
				>
					{results.length ? (
						results.map(a => (
							<TableRow
								key={a.id}
								label={a.name}
								subLabel={[a.exe, ...a.themes.slice(0, 2)].join(' · ')}
								icon={<GameIcon id={a.id} hash={a.icon} size={36} />}
								arrow
								onPress={() => openGame(a)}
							/>
						))
					) : (
						<TableRow
							label={`Nothing called "${q.trim()}"`}
							subLabel="Only games Discord can detect show up here"
						/>
					)}
				</TableRowGroup>
			)}

			{!typing && !!d.recent.length && (
				<TableRowGroup title="Recent">
					{d.recent.map(g => (
						<TableRow
							key={g.id}
							label={g.name}
							subLabel={g.exe}
							icon={<GameIcon id={g.id} hash={g.icon} size={36} />}
							arrow
							onPress={() => openGame(g)}
						/>
					))}
				</TableRowGroup>
			)}
		</View>
	)
}

function QueueRow({
	q,
	i,
	startsIn,
	last,
}: {
	q: Queued
	i: number
	startsIn: number | null
	last: boolean
}) {
	const { TableRow, IconButton } = Design as any
	const move = (by: number) => {
		const list = [...data().queue]
		const j = i + by
		if (j < 0 || j >= list.length) return
		;[list[i], list[j]] = [list[j], list[i]]
		if (list.slice(0, -1).some(x => x.minutes === 0)) return
		save({ queue: list })
	}
	const remove = () => save({ queue: data().queue.filter((_, k) => k !== i) })
	return (
		<TableRow
			label={`${i + 1}. ${q.name}`}
			subLabel={`${fmtMinutes(q.minutes)}${startsIn !== null ? `, starts in ${fmt(startsIn)}` : ''}`}
			icon={<GameIcon id={q.id} hash={q.icon} size={36} />}
			onPress={() => openGame(q)}
			trailing={
				<View style={{ flexDirection: 'row', gap: 4 }}>
					<IconButton
						icon={getAssetIdByName('ChevronSmallUpIcon')}
						size="sm"
						variant="tertiary"
						disabled={i === 0}
						accessibilityLabel={`Move ${q.name} up`}
						onPress={() => move(-1)}
					/>
					<IconButton
						icon={getAssetIdByName('ChevronSmallDownIcon')}
						size="sm"
						variant="tertiary"
						disabled={last}
						accessibilityLabel={`Move ${q.name} down`}
						onPress={() => move(1)}
					/>
					<IconButton
						icon={getAssetIdByName('TrashIcon')}
						size="sm"
						variant="tertiary"
						accessibilityLabel={`Remove ${q.name}`}
						onPress={remove}
					/>
				</View>
			}
		/>
	)
}

function Queue() {
	const { TableRowGroup, TableRow } = Design as any
	const d = useData()
	const now = useNow(!!d.queue.length, 30_000)
	const s = current()

	const starts = useMemo(() => {
		const out: (number | null)[] = []
		let at = s?.endsAt || null
		for (const q of d.queue) {
			out.push(at === null ? null : at - now)
			at = at === null || !q.minutes ? null : at + q.minutes * 60_000
		}
		return out
	}, [d.queue, s?.endsAt, Math.floor(now / 30_000)])

	const total = d.queue.reduce((t, q) => t + q.minutes, 0)
	const open = queueOpen(d.queue)
	const title = d.queue.length
		? `Up next, ${d.queue.length} ${d.queue.length === 1 ? 'game' : 'games'}${open ? `, ${fmtMinutes(total)}` : ''}`
		: 'Queue'

	return (
		<TableRowGroup title={title}>
			{d.queue.map((q, i) => (
				<QueueRow
					key={`${q.id}-${i}`}
					q={q}
					i={i}
					startsIn={starts[i]}
					last={i === d.queue.length - 1}
				/>
			))}
			{!d.queue.length && (
				<TableRow
					label="Nothing queued"
					subLabel="Queue games and they play one after another, even while Discord is closed"
				/>
			)}
			{!s && !!d.queue.length && (
				<TableRow
					label="Start the queue"
					icon={<TableRowAssetIcon name="PlayIcon" />}
					onPress={() => startQueue()}
				/>
			)}
			{open && (
				<TableRow
					label="Add random games"
					subLabel="Fill the queue with games picked at random"
					icon={<TableRowAssetIcon name="PlusMediumIcon" />}
					arrow
					onPress={openShuffle}
				/>
			)}
			{!!d.queue.length && (
				<TableRow
					label="Clear the queue"
					variant="danger"
					icon={<TableRowAssetIcon name="TrashIcon" variant="danger" />}
					onPress={() =>
						confirm(
							'Clear the queue?',
							`${d.queue.length} queued games will be removed.`,
							'Clear',
							() => save({ queue: [] }),
						)
					}
				/>
			)}
		</TableRowGroup>
	)
}

function Options() {
	const { TableRowGroup, TableSwitchRow, TableRow, TableRowTrailingText } =
		Design as any
	const d = useData()
	return (
		<>
			<TableRowGroup title="Playtime">
				<TableSwitchRow
					label="Count toward playtime badges"
					subLabel="Reports the session to Discord every 5 minutes, like a real game would. Badges only move once Discord runs its daily update"
					icon={<TableRowAssetIcon name="TrophyIcon" />}
					value={d.credit}
					onValueChange={(credit: boolean) => {
						save({ credit })
						syncCredit()
					}}
				/>
				{d.creditedMs > 0 && (
					<TableRow
						label="Sent so far"
						subLabel="Everything this plugin has reported"
						icon={<TableRowAssetIcon name="ClockIcon" />}
						trailing={<TableRowTrailingText text={fmt(d.creditedMs)} />}
					/>
				)}
			</TableRowGroup>
			<TableRowGroup title="Profile">
				<TableSwitchRow
					label="Show time left"
					subLabel="Your activity counts down to when the game ends instead of up"
					icon={<TableRowAssetIcon name="TimerIcon" />}
					value={d.showEnd}
					onValueChange={(showEnd: boolean) => {
						save({ showEnd })
						publish()
					}}
				/>
				<TableSwitchRow
					label="Game picture"
					subLabel="Uses the game's icon as the activity picture"
					icon={<TableRowAssetIcon name="ImageIcon" />}
					value={d.art}
					onValueChange={(art: boolean) => {
						save({ art })
						publish()
					}}
				/>
			</TableRowGroup>
		</>
	)
}

export function Page() {
	const { Stack } = Design as any
	useData()
	return (
		<ScrollView
			contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
			keyboardShouldPersistTaps="handled"
			keyboardDismissMode="on-drag"
		>
			<Stack spacing={24}>
				<NowPlaying />
				<Search />
				<Queue />
				<Options />
			</Stack>
		</ScrollView>
	)
}

export const trailing = () => {
	useData()
	useNow(true, 30_000)
	const s = current()
	return s ? s.game.name : undefined
}
