import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { useState } from 'react'
import { View } from 'react-native'
import {
	fmtMinutes,
	GameIcon,
	Label,
	MAX_PLAYED,
	Pill,
	parse,
	toast,
} from './common'
import { loaded, shuffle } from './games'
import { current, play } from './session'
import { data, save, useData } from './store'
import type { App } from './games'
import type { Game, Queued } from './store'

const close = () => ActionSheetActionCreators.hideActionSheet()

const LENGTHS: [string, number][] = [
	['15m', 15],
	['30m', 30],
	['1h', 60],
	['2h', 120],
	['4h', 240],
	['8h', 480],
	['24h', 1440],
	['Forever', 0],
]

const PLAYED: [string, number][] = [
	['Just now', 0],
	['15m', 15],
	['1h', 60],
	['3h', 180],
	['10h', 600],
]

const open = (Comp: any, key: string, props: any) =>
	ActionSheetActionCreators.openLazy(
		Promise.resolve({ default: Comp }) as any,
		key,
		props,
	)

export const openGame = (game: Game & Partial<App>) =>
	open(GameSheet, 'GameSessionGame', { game })

export const openShuffle = () => open(ShuffleSheet, 'GameSessionShuffle', {})

export const queueOpen = (q: Queued[]) =>
	!q.length || q[q.length - 1].minutes !== 0

function Choice({
	presets,
	value,
	custom,
	onPick,
	onCustom,
	placeholder,
	error,
}: {
	presets: [string, number][]
	value: number | null
	custom: string | null
	onPick: (m: number) => void
	onCustom: (s: string | null) => void
	placeholder: string
	error?: string
}) {
	const { TextInput } = Design as any
	const [asked, setAsked] = useState(false)
	return (
		<View style={{ gap: 10 }}>
			<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
				{presets.map(([label, m]) => (
					<Pill
						key={label}
						label={label}
						selected={custom === null && value === m}
						onPress={() => onPick(m)}
					/>
				))}
				<Pill
					label="Custom"
					selected={custom !== null}
					onPress={() => {
						setAsked(true)
						onCustom(custom === null ? '' : null)
					}}
				/>
			</View>
			{custom !== null && (
				<TextInput
					autoFocus={asked}
					placeholder={placeholder}
					value={custom}
					onChange={onCustom}
					autoCorrect={false}
					autoCapitalize="none"
					status={error ? 'error' : undefined}
					errorMessage={error}
				/>
			)}
		</View>
	)
}

function GameSheet({ game }: { game: Game & Partial<App> }) {
	const {
		ActionSheet,
		ActionSheetCloseButton,
		BottomSheetTitleHeader,
		Text,
		Button,
	} = Design as any
	const d = useData()
	const [len, setLen] = useState<number>(() => parse(d.duration) ?? 60)
	const [lenText, setLenText] = useState<string | null>(() => {
		const m = parse(d.duration)
		return m !== null && !LENGTHS.some(x => x[1] === m) ? d.duration : null
	})
	const [played, setPlayed] = useState(0)
	const [playedText, setPlayedText] = useState<string | null>(null)

	const minutes = lenText !== null ? parse(lenText) : len
	const back = playedText !== null ? parse(playedText, MAX_PLAYED) : played
	const cur = current()
	const same = cur?.game.id === game.id
	const canQueue = minutes !== null && queueOpen(d.queue)
	const canNext = minutes !== null && minutes !== 0 && !!cur
	const queued = d.queue.some(q => q.id === game.id)

	const entry = (): Queued => ({
		id: game.id,
		name: game.name,
		exe: game.exe,
		icon: game.icon ?? null,
		minutes: minutes ?? 60,
	})

	const remember = () => {
		const label = LENGTHS.find(x => x[1] === minutes)?.[0]
		save({ duration: lenText || label || d.duration })
	}

	const start = () => {
		if (minutes === null || back === null) return
		remember()
		play(entry(), minutes, back)
		close()
		toast(`Playing ${game.name}`)
	}

	const enqueue = (next: boolean) => {
		if (minutes === null) return
		remember()
		const q = data().queue
		save({ queue: next ? [entry(), ...q] : [...q, entry()] })
		close()
		toast(
			next ? `${game.name} plays next` : `${game.name} added to the queue`,
			'ListViewIcon',
		)
	}

	const meta = [game.exe, ...(game.themes ?? []).slice(0, 3)]
		.filter(Boolean)
		.join(' · ')

	return (
		<ActionSheet
			header={
				<BottomSheetTitleHeader
					title={same ? 'Playing now' : 'Play a game'}
					trailing={<ActionSheetCloseButton onPress={close} />}
				/>
			}
		>
			<View style={{ paddingHorizontal: 16, paddingBottom: 24, gap: 20 }}>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
					<GameIcon id={game.id} hash={game.icon} size={60} />
					<View style={{ flex: 1, gap: 2 }}>
						<Text variant="heading-lg/bold" color="text-strong" lineClamp={2}>
							{game.name}
						</Text>
						{!!meta && (
							<Text variant="text-sm/medium" color="text-muted" lineClamp={1}>
								{meta}
							</Text>
						)}
					</View>
				</View>

				<View style={{ gap: 10 }}>
					<Label
						text="How long"
						hint={minutes === null ? undefined : `Plays ${fmtMinutes(minutes)}`}
					/>
					<Choice
						presets={LENGTHS}
						value={len}
						custom={lenText}
						onPick={m => {
							setLen(m)
							setLenText(null)
						}}
						onCustom={setLenText}
						placeholder="Or type one, like 1h 30m"
						error={
							lenText && minutes === null
								? 'Try something like 90m, 2h or 1d'
								: undefined
						}
					/>
				</View>

				<View style={{ gap: 10 }}>
					<Label
						text="Already played for"
						hint={
							d.credit
								? 'Only changes your profile, playtime counts from now'
								: 'Backdates the start so your profile shows more time'
						}
					/>
					<Choice
						presets={PLAYED}
						value={played}
						custom={playedText}
						onPick={m => {
							setPlayed(m)
							setPlayedText(null)
						}}
						onCustom={setPlayedText}
						placeholder="Or type one, up to 24h"
						error={
							playedText && back === null
								? 'Up to 24h, like 45m or 3h'
								: undefined
						}
					/>
				</View>

				<View style={{ gap: 8 }}>
					<Button
						text={
							cur
								? same
									? 'Restart'
									: `Switch to ${game.name}`
								: 'Start playing'
						}
						variant="primary"
						size="lg"
						disabled={minutes === null || back === null}
						onPress={start}
					/>
					<View style={{ flexDirection: 'row', gap: 8 }}>
						<View style={{ flex: 1 }}>
							<Button
								text="Play next"
								variant="secondary"
								size="md"
								disabled={!canNext}
								onPress={() => enqueue(true)}
							/>
						</View>
						<View style={{ flex: 1 }}>
							<Button
								text={queued ? 'Queue again' : 'Add to queue'}
								variant="secondary"
								size="md"
								disabled={!canQueue}
								onPress={() => enqueue(false)}
							/>
						</View>
					</View>
					{!queueOpen(d.queue) && (
						<Text
							variant="text-xs/medium"
							color="text-muted"
							style={{ textAlign: 'center' }}
						>
							The last game in the queue plays forever, so nothing can go after
							it.
						</Text>
					)}
					{d.credit && (minutes === 0 || (minutes ?? 0) > 480) && (
						<Text
							variant="text-xs/medium"
							color="text-muted"
							style={{ textAlign: 'center' }}
						>
							Playtime stops counting after 8h a day. Your profile keeps showing
							the game.
						</Text>
					)}
				</View>
			</View>
		</ActionSheet>
	)
}

const COUNTS = [3, 5, 10, 20]
const EACH: [string, number][] = [
	['15m', 15],
	['30m', 30],
	['1h', 60],
	['2h', 120],
	['4h', 240],
]

function ShuffleSheet() {
	const {
		ActionSheet,
		ActionSheetCloseButton,
		BottomSheetTitleHeader,
		Text,
		Button,
	} = Design as any
	const d = useData()
	const [count, setCount] = useState(5)
	const [each, setEach] = useState(60)
	const apps = loaded()
	const open = queueOpen(d.queue)

	const add = () => {
		if (!apps || !open) return
		const picks = shuffle(apps, count).map(a => ({
			id: a.id,
			name: a.name,
			exe: a.exe,
			icon: a.icon ?? null,
			minutes: each,
		}))
		save({ queue: [...data().queue, ...picks] })
		close()
		toast(`Added ${picks.length} random games`, 'ListViewIcon')
	}

	return (
		<ActionSheet
			header={
				<BottomSheetTitleHeader
					title="Random games"
					trailing={<ActionSheetCloseButton onPress={close} />}
				/>
			}
		>
			<View style={{ paddingHorizontal: 16, paddingBottom: 24, gap: 20 }}>
				<Text variant="text-sm/medium" color="text-muted">
					Picks games at random from everything Discord can detect and adds them
					to the end of your queue.
				</Text>
				{d.credit && (
					<Text variant="text-sm/medium" color="text-feedback-critical">
						Playtime reporting is on. Lots of random games back to back is the
						kind of thing that looks fake, so keep it short or turn reporting
						off first.
					</Text>
				)}
				<View style={{ gap: 10 }}>
					<Label text="How many" />
					<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
						{COUNTS.map(n => (
							<Pill
								key={n}
								label={String(n)}
								selected={count === n}
								onPress={() => setCount(n)}
							/>
						))}
					</View>
				</View>
				<View style={{ gap: 10 }}>
					<Label
						text="Each one plays for"
						hint={`${fmtMinutes(count * each)} in total`}
					/>
					<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
						{EACH.map(([l, m]) => (
							<Pill
								key={l}
								label={l}
								selected={each === m}
								onPress={() => setEach(m)}
							/>
						))}
					</View>
				</View>
				<Button
					text={apps ? `Add ${count} games` : 'Loading games...'}
					variant="primary"
					size="lg"
					disabled={!apps || !open}
					onPress={add}
				/>
				{!open && (
					<Text
						variant="text-xs/medium"
						color="text-muted"
						style={{ textAlign: 'center' }}
					>
						The last game in the queue plays forever, so nothing can go after
						it.
					</Text>
				)}
			</View>
		</ActionSheet>
	)
}
