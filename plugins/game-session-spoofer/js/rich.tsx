import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { useState } from 'react'
import { View } from 'react-native'
import { Label, Pill, toast } from './common'
import { current, setRich } from './session'
import type { Rich } from './store'

export interface Draft {
	details: string
	state: string
	party: boolean
	size: string
	max: string
	smallUrl: string
	smallText: string
	buttons: { label: string; url: string }[]
	display: 0 | 1 | 2
}

export const toDraft = (r?: Rich | null): Draft => ({
	details: r?.details ?? '',
	state: r?.state ?? '',
	party: !!r?.party,
	size: String(r?.party?.[0] ?? 1),
	max: String(r?.party?.[1] ?? 4),
	smallUrl: r?.small?.url ?? '',
	smallText: r?.small?.text ?? '',
	buttons: r?.buttons?.map(b => ({ ...b })) ?? [],
	display: r?.display ?? 0,
})

const https = (u: string) => /^https:\/\/\S+\.\S+/.test(u)

const short = (v: string) =>
	v.trim().length === 1 ? 'Needs at least 2 characters' : undefined

export function fromDraft(d: Draft) {
	const errors: Record<string, string | undefined> = {
		details: short(d.details),
		state: short(d.state),
	}
	const size = Number(d.size)
	const max = Number(d.max)
	if (
		d.party &&
		!(
			Number.isInteger(size) &&
			Number.isInteger(max) &&
			size >= 1 &&
			max >= size &&
			max <= 999
		)
	)
		errors.party = 'Use whole numbers, like 1 of 4'
	const url = d.smallUrl.trim()
	if (url && !https(url)) errors.small = 'Needs an https:// image link'
	const buttons = d.buttons
		.map(b => ({ label: b.label.trim(), url: b.url.trim() }))
		.filter(b => b.label || b.url)
	buttons.forEach((b, i) => {
		if (!b.label) errors[`b${i}`] = 'Give the button a label'
		else if (!https(b.url)) errors[`b${i}`] = 'Needs an https:// link'
	})
	const rich: Rich = {}
	if (d.details.trim()) rich.details = d.details.trim()
	if (d.state.trim()) rich.state = d.state.trim()
	if (d.party) rich.party = [size, max]
	if (url) rich.small = { url, text: d.smallText.trim() }
	if (buttons.length) rich.buttons = buttons
	if (d.display === 1 && rich.state) rich.display = 1
	if (d.display === 2 && rich.details) rich.display = 2
	const ok = !Object.values(errors).some(Boolean)
	return { rich, errors, ok }
}

export function summary(r?: Rich | null) {
	if (!r) return ''
	const party = r.party ? `(${r.party[0]} of ${r.party[1]})` : ''
	return [r.details, [r.state, party].filter(Boolean).join(' ')]
		.filter(Boolean)
		.join(' · ')
}

export function RichFields({
	draft,
	set,
	errors,
}: {
	draft: Draft
	set: (d: Draft) => void
	errors: Record<string, string | undefined>
}) {
	const { TextInput, Text } = Design as any
	const up = (p: Partial<Draft>) => set({ ...draft, ...p })
	const field = (
		value: string,
		onChange: (v: string) => void,
		placeholder: string,
		error?: string,
		extra?: any,
	) => (
		<TextInput
			placeholder={placeholder}
			value={value}
			onChange={onChange}
			autoCorrect={false}
			status={error ? 'error' : undefined}
			errorMessage={error}
			{...extra}
		/>
	)
	const button = (i: number, p: Partial<{ label: string; url: string }>) =>
		up({
			buttons: draft.buttons.map((b, j) => (i === j ? { ...b, ...p } : b)),
		})

	return (
		<View style={{ gap: 20 }}>
			<View style={{ gap: 10 }}>
				<Label text="Details" hint="First line under the game name" />
				{field(
					draft.details,
					details => up({ details }),
					'Like play.hypixel.net or Ranked',
					errors.details,
					{ maxLength: 128 },
				)}
			</View>

			<View style={{ gap: 10 }}>
				<Label text="State" hint="Second line, the party size goes after it" />
				{field(
					draft.state,
					state => up({ state }),
					'Like In a lobby or your username',
					errors.state,
					{ maxLength: 128 },
				)}
			</View>

			<View style={{ gap: 10 }}>
				<Label text="Party" hint="Shows as (1 of 4) with a people icon" />
				<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
					<Pill
						label="Solo"
						selected={!draft.party}
						onPress={() => up({ party: false })}
					/>
					<Pill
						label="In a party"
						selected={draft.party}
						onPress={() => up({ party: true })}
					/>
				</View>
				{draft.party && (
					<View style={{ gap: 6 }}>
						<View
							style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
						>
							<View style={{ flex: 1 }}>
								{field(draft.size, size => up({ size }), '1', undefined, {
									keyboardType: 'number-pad',
									maxLength: 3,
									status: errors.party ? 'error' : undefined,
								})}
							</View>
							<Text variant="text-md/medium" color="text-muted">
								of
							</Text>
							<View style={{ flex: 1 }}>
								{field(draft.max, max => up({ max }), '4', undefined, {
									keyboardType: 'number-pad',
									maxLength: 3,
									status: errors.party ? 'error' : undefined,
								})}
							</View>
						</View>
						{!!errors.party && (
							<Text variant="text-xs/medium" color="text-feedback-critical">
								{errors.party}
							</Text>
						)}
					</View>
				)}
			</View>

			<View style={{ gap: 10 }}>
				<Label
					text="Member list shows"
					hint="What people see next to your name in servers"
				/>
				<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
					<Pill
						label="Game name"
						selected={draft.display === 0}
						onPress={() => up({ display: 0 })}
					/>
					{!!draft.details.trim() && (
						<Pill
							label="Details"
							selected={draft.display === 2}
							onPress={() => up({ display: 2 })}
						/>
					)}
					{!!draft.state.trim() && (
						<Pill
							label="State"
							selected={draft.display === 1}
							onPress={() => up({ display: 1 })}
						/>
					)}
				</View>
			</View>

			<View style={{ gap: 10 }}>
				<Label
					text="Small icon"
					hint="Little badge on the game picture, like a skin or rank"
				/>
				{field(
					draft.smallUrl,
					smallUrl => up({ smallUrl }),
					'https:// image link',
					errors.small,
					{ autoCapitalize: 'none', keyboardType: 'url' },
				)}
				{!!draft.smallUrl.trim() &&
					field(
						draft.smallText,
						smallText => up({ smallText }),
						'Text when tapped, like your username',
						undefined,
						{ maxLength: 128 },
					)}
			</View>

			<View style={{ gap: 10 }}>
				<Label text="Buttons" hint="Up to 2 links under your activity" />
				{draft.buttons.map((b, i) => (
					<View key={i} style={{ gap: 6 }}>
						{field(b.label, label => button(i, { label }), 'Label', undefined, {
							maxLength: 32,
						})}
						{field(
							b.url,
							url => button(i, { url }),
							'https:// link',
							errors[`b${i}`],
							{ autoCapitalize: 'none', keyboardType: 'url' },
						)}
					</View>
				))}
				<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
					{draft.buttons.length < 2 && (
						<Pill
							label="Add button"
							selected={false}
							onPress={() =>
								up({ buttons: [...draft.buttons, { label: '', url: '' }] })
							}
						/>
					)}
					{!!draft.buttons.length && (
						<Pill
							label="Remove last"
							selected={false}
							onPress={() => up({ buttons: draft.buttons.slice(0, -1) })}
						/>
					)}
				</View>
			</View>
		</View>
	)
}

const close = () => ActionSheetActionCreators.hideActionSheet()

function StatusSheet() {
	const {
		ActionSheet,
		ActionSheetCloseButton,
		BottomSheetTitleHeader,
		Button,
	} = Design as any
	const s = current()
	const [draft, setDraft] = useState(() => toDraft(s?.rich))
	const { rich, errors, ok } = fromDraft(draft)

	return (
		<ActionSheet
			header={
				<BottomSheetTitleHeader
					title="Status"
					trailing={<ActionSheetCloseButton onPress={close} />}
				/>
			}
		>
			<View style={{ paddingHorizontal: 16, paddingBottom: 24, gap: 20 }}>
				<RichFields draft={draft} set={setDraft} errors={errors} />
				<View style={{ gap: 8 }}>
					<Button
						text="Save"
						variant="primary"
						size="lg"
						disabled={!ok || !s}
						onPress={() => {
							setRich(rich)
							close()
							toast('Status updated')
						}}
					/>
					<Button
						text="Clear all"
						variant="secondary"
						size="md"
						onPress={() => setDraft(toDraft(null))}
					/>
				</View>
			</View>
		</ActionSheet>
	)
}

export const openStatus = () =>
	ActionSheetActionCreators.openLazy(
		Promise.resolve({ default: StatusSheet }) as any,
		'GameSessionStatus',
		{},
	)
