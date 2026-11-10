import {
	ActionSheetActionCreators,
	AlertActionCreators,
} from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { createElement, useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import {
	byProps,
	chatInput,
	colors,
	draftOf,
	pretty,
	toast,
	useToken,
} from './common'
import { cached, message, restyle, search } from './engine'
import { sendNow, stage } from './send'
import {
	activeFor,
	options,
	save,
	setActive,
	styleOf,
	toggleFav,
	touch,
	useOptions,
} from './store'
import { builtin, fromCustom, fromSaved, groups } from './styles'
import type { Hit } from './engine'
import type { Custom, Style } from './styles'

const close = () => ActionSheetActionCreators.hideActionSheet()

export function openSheet(channelId?: string) {
	ActionSheetActionCreators.openLazy(
		Promise.resolve({ default: StyleSheet }) as any,
		'StyleTranslate',
		{ channelId } as any,
	)
}

function Tile({
	style,
	selected,
	on,
	onPress,
	onLongPress,
}: {
	style: Style
	selected: boolean
	on?: boolean
	onPress: () => void
	onLongPress?: () => void
}) {
	const { Text } = Design as any
	const c = colors()
	const brand = useToken(c.BACKGROUND_BRAND)
	const bg = useToken(c.BACKGROUND_MOD_SUBTLE)
	const pressedBg = useToken(c.BACKGROUND_MOD_STRONG ?? c.BACKGROUND_MOD_SUBTLE)
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={style.name}
			accessibilityState={{ selected }}
			onPress={onPress}
			onLongPress={onLongPress}
			delayLongPress={350}
			style={({ pressed }) => ({
				flexDirection: 'row',
				alignItems: 'center',
				gap: 6,
				paddingHorizontal: 12,
				height: 32,
				borderRadius: 16,
				backgroundColor: selected ? brand : pressed ? pressedBg : bg,
			})}
		>
			{on && (
				<View
					style={{
						width: 6,
						height: 6,
						borderRadius: 3,
						backgroundColor: selected ? '#fff' : brand,
					}}
				/>
			)}
			<Text
				variant="text-sm/medium"
				color={selected ? 'white' : 'text-default'}
				style={selected ? { color: '#fff' } : undefined}
				lineClamp={1}
			>
				{style.name}
			</Text>
		</Pressable>
	)
}

function Section({
	title,
	children,
	trailing,
}: {
	title: string
	children: any
	trailing?: any
}) {
	const { Text } = Design as any
	return (
		<View style={{ marginTop: 14 }}>
			<View
				style={{
					flexDirection: 'row',
					alignItems: 'center',
					marginBottom: 8,
				}}
			>
				<Text variant="eyebrow" color="text-muted" style={{ flex: 1 }}>
					{title}
				</Text>
				{trailing}
			</View>
			<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
				{children}
			</View>
		</View>
	)
}

type Preview =
	| { state: 'idle' }
	| { state: 'busy' }
	| { state: 'done'; text: string }
	| { state: 'fail'; error: string }

function usePreview(style: Style | undefined, draft: string, nonce: number) {
	const [p, setP] = useState<Preview>({ state: 'idle' })
	useEffect(() => {
		if (!style || !draft.trim()) return setP({ state: 'idle' })
		const hit = cached(style, draft)
		if (hit !== undefined) return setP({ state: 'done', text: hit })
		const abort = new AbortController()
		setP({ state: 'busy' })
		restyle(style, draft, abort.signal).then(
			text => !abort.signal.aborted && setP({ state: 'done', text }),
			e => !abort.signal.aborted && setP({ state: 'fail', error: message(e) }),
		)
		return () => abort.abort()
	}, [style?.id, draft, nonce])
	return p
}

function PreviewCard({
	channelId,
	style,
	draft,
}: {
	channelId?: string
	style?: Style
	draft: string
}) {
	const { Text, Button } = Design as any
	const c = colors()
	const card = useToken(c.BACKGROUND_MOD_SUBTLE)
	const [nonce, setNonce] = useState(0)
	const p = usePreview(style, draft, nonce)
	const has = !!draft.trim()
	const [slow, setSlow] = useState(false)
	const freeAi =
		style?.kind === 'ai' && !(options().ai === 'own' && options().aiKey)
	useEffect(() => {
		setSlow(false)
		if (p.state !== 'busy' || !freeAi) return
		const t = setTimeout(() => setSlow(true), 3000)
		return () => clearTimeout(t)
	}, [p.state, style?.id])

	const boxStyle = {
		borderRadius: 12,
		backgroundColor: card,
		paddingVertical: 10,
		paddingHorizontal: 12,
		gap: 8,
	}

	if (!style) return null

	if (!has)
		return (
			<View style={boxStyle}>
				<Text variant="text-sm/medium" color="text-muted" lineClamp={1}>
					{style.kind === 'ai'
						? style.name
						: `${style.name}${style.sample ? `: ${style.sample}` : ''}`}
				</Text>
			</View>
		)

	const done = p.state === 'done' ? p.text : undefined
	const use = () => {
		if (!done || !channelId) return
		if (style) stage(channelId, style, draft, done)
		close()
		setTimeout(() => {
			try {
				chatInput(channelId)?.focus?.()
			} catch {}
		}, 350)
	}
	const send = () => {
		if (!done || !channelId) return
		close()
		setTimeout(() => {
			if (!sendNow(channelId, done)) toast("Couldn't find the chat box")
		}, 250)
	}

	return (
		<View style={boxStyle}>
			<Text
				variant="text-sm/medium"
				color={
					p.state === 'fail'
						? 'text-feedback-critical'
						: p.state === 'done'
							? 'text-default'
							: 'text-muted'
				}
				lineClamp={4}
				selectable
			>
				{p.state === 'done'
					? pretty(p.text)
					: p.state === 'fail'
						? p.error
						: slow
							? 'Free AI is slow, hang on...'
							: 'Restyling...'}
			</Text>
			<View style={{ flexDirection: 'row', gap: 8 }}>
				{p.state === 'fail' ? (
					<View style={{ flex: 1 }}>
						<Button
							text="Try again"
							variant="secondary"
							size="sm"
							onPress={() => setNonce(n => n + 1)}
						/>
					</View>
				) : (
					<>
						<View style={{ flex: 1 }}>
							<Button
								text="Edit first"
								variant="secondary"
								size="sm"
								disabled={!done}
								onPress={use}
							/>
						</View>
						<View style={{ flex: 1 }}>
							<Button
								text="Send"
								variant="primary"
								size="sm"
								disabled={!done}
								onPress={send}
							/>
						</View>
					</>
				)}
			</View>
		</View>
	)
}

function NewStyle({ onDone }: { onDone: (c: Custom) => void }) {
	const { AlertModal, AlertActionButton, TextInput } = Design as any
	const [name, setName] = useState('')
	const [prompt, setPrompt] = useState('')
	return (
		<AlertModal
			title="New style"
			content="Describe how it should sound."
			extraContent={
				<View style={{ gap: 12 }}>
					<TextInput
						autoFocus
						placeholder="Name, like Grumpy grandpa"
						value={name}
						onChange={setName}
					/>
					<TextInput
						placeholder="Talks like a grumpy grandpa who hates technology"
						value={prompt}
						onChange={setPrompt}
						multiline
					/>
				</View>
			}
			actions={
				<>
					<AlertActionButton
						text="Create"
						variant="primary"
						disabled={!name.trim() || !prompt.trim()}
						onPress={() =>
							onDone({
								id: `ai:${Date.now().toString(36)}`,
								name: name.trim(),
								emoji: '',
								prompt: prompt.trim(),
							})
						}
					/>
					<AlertActionButton text="Cancel" variant="secondary" />
				</>
			}
		/>
	)
}

export function newStyle(after?: (s: Style) => void) {
	AlertActionCreators.openAlert(
		'styletranslate-new',
		createElement(NewStyle, {
			onDone: c => {
				save({ customs: [...options().customs, c] })
				after?.(fromCustom(c))
			},
		}),
	)
}

function useSearch(q: string) {
	const [hits, setHits] = useState<Hit[] | 'busy' | string>([])
	useEffect(() => {
		const t = q.trim()
		if (t.length < 2) return setHits([])
		setHits('busy')
		const abort = new AbortController()
		const timer = setTimeout(() => {
			search(t, abort.signal).then(
				h => !abort.signal.aborted && setHits(h),
				e => !abort.signal.aborted && setHits(message(e)),
			)
		}, 450)
		return () => {
			clearTimeout(timer)
			abort.abort()
		}
	}, [q])
	return hits
}

function StyleSheet({ channelId }: { channelId?: string }) {
	const {
		ActionSheet,
		ActionSheetCloseButton,
		BottomSheetTitleHeader,
		TextInput,
		TableRowGroup,
		TableSwitchRow,
	} = Design as any
	const o = useOptions()
	const draft = useMemo(() => draftOf(channelId), [])
	const [sel, setSel] = useState(() => activeFor(channelId)?.id ?? o.style)
	const [q, setQ] = useState('')
	const [frozen] = useState(() => ({ favs: o.favs, recent: o.recent }))
	const hits = useSearch(q)
	const style = styleOf(sel, o) ?? builtin[0]
	const active = activeFor(channelId, o)
	const Scroll =
		byProps('BottomSheetScrollView', 'BottomSheetFlatList')
			?.BottomSheetScrollView ?? ScrollView

	const yours = [...o.customs.map(fromCustom), ...o.saved.map(fromSaved)]
	const all = [...yours, ...builtin]
	const find = (id: string) => all.find(s => s.id === id)

	const pick = (s: Style) => {
		setSel(s.id)
		if (active && channelId) setActive(channelId, s.id)
		else touch(s.id)
	}
	const fav = (s: Style) => {
		const added = toggleFav(s.id)
		toast(
			added
				? `${s.name} added to favorites`
				: `${s.name} removed from favorites`,
			added ? 'StarIcon' : 'StarOutlineIcon',
		)
	}
	const tile = (s: Style, k = s.id) => (
		<Tile
			key={k}
			style={s}
			selected={s.id === style.id}
			on={active?.id === s.id}
			onPress={() => pick(s)}
			onLongPress={() => fav(s)}
		/>
	)

	const query = q.trim().toLowerCase()
	const matches = query
		? all.filter(
				s =>
					s.name.toLowerCase().includes(query) ||
					s.group.toLowerCase().includes(query),
			)
		: []

	const favs = frozen.favs.map(find).filter(Boolean) as Style[]
	const recent = frozen.recent
		.filter(id => !frozen.favs.includes(id))
		.map(find)
		.filter(Boolean)
		.slice(0, 6) as Style[]

	const addTile = (
		<Tile
			key="new"
			style={{
				id: 'new',
				name: '+ New style',
				emoji: '',
				kind: 'ai',
				group: '',
			}}
			selected={false}
			onPress={() => newStyle(pick)}
		/>
	)

	const remote = (h: Hit) => {
		const s = fromSaved(h)
		const known = o.saved.some(x => x.post === h.post)
		return (
			<Tile
				key={`r${h.post}`}
				style={s}
				selected={s.id === style.id}
				onPress={() => {
					if (!known)
						save({
							saved: [...options().saved, { post: h.post, name: h.name }],
						})
					pick(s)
				}}
			/>
		)
	}

	const scope = o.scope === 'all' ? 'everywhere' : 'in this chat'

	return (
		<ActionSheet
			scrollable
			startExpanded
			header={
				<BottomSheetTitleHeader
					title="Style"
					trailing={<ActionSheetCloseButton onPress={close} />}
				/>
			}
		>
			<View style={{ flex: 1 }}>
				<View style={{ paddingHorizontal: 16, gap: 12, paddingBottom: 4 }}>
					<PreviewCard channelId={channelId} style={style} draft={draft} />
					<TextInput
						placeholder="Search styles"
						value={q}
						onChange={setQ}
						isClearable
						onClear={() => setQ('')}
						autoCorrect={false}
						returnKeyType="search"
					/>
				</View>
				<Scroll
					style={{ flex: 1 }}
					contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
					keyboardShouldPersistTaps="handled"
					keyboardDismissMode="on-drag"
				>
					{!query && (
						<View style={{ marginTop: 12 }}>
							<TableRowGroup>
								<TableSwitchRow
									label={
										active ? `${active.name} is on` : `Keep ${style.name} on`
									}
									subLabel={`Restyles every message you send ${scope}`}
									value={!!active}
									onValueChange={(v: boolean) => {
										setActive(channelId, v ? style.id : null)
										if (v && !draft.trim()) setTimeout(close, 220)
									}}
								/>
							</TableRowGroup>
						</View>
					)}
					{query ? (
						<>
							{!!matches.length && (
								<Section title="Styles">
									{matches.map(s => tile(s, `m${s.id}`))}
								</Section>
							)}
							<Section title="From AnythingTranslate">
								{hits === 'busy' ? (
									<Hint text="Looking..." />
								) : typeof hits === 'string' ? (
									<Hint text={hits} />
								) : hits.length ? (
									hits.map(remote)
								) : (
									<Hint
										text={
											query.length < 2
												? 'Keep typing'
												: `Nothing called "${q.trim()}"`
										}
									/>
								)}
							</Section>
						</>
					) : (
						<>
							{!!favs.length && (
								<Section title="Favorites">
									{favs.map(s => tile(s, `f${s.id}`))}
								</Section>
							)}
							{!!recent.length && (
								<Section title="Recent">
									{recent.map(s => tile(s, `r${s.id}`))}
								</Section>
							)}
							{!!yours.length && (
								<Section title="Yours">
									{yours.map(s => tile(s, `y${s.id}`))}
									{addTile}
								</Section>
							)}
							{groups.map(g => (
								<Section key={g} title={g}>
									{builtin.filter(s => s.group === g).map(s => tile(s))}
								</Section>
							))}
							{!yours.length && (
								<Section title="Make your own">{addTile}</Section>
							)}
						</>
					)}
				</Scroll>
			</View>
		</ActionSheet>
	)
}

function Hint({ text }: { text: string }) {
	const { Text } = Design as any
	return (
		<View style={{ paddingVertical: 6, width: '100%' }}>
			<Text variant="text-sm/medium" color="text-muted">
				{text}
			</Text>
		</View>
	)
}
