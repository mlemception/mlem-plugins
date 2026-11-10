import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { createElement, Fragment, useState } from 'react'
import { ScrollView } from 'react-native'
import { newStyle } from './sheet'
import { save, setStorage, storage, styleOf, useOptions } from './store'
import { fromCustom, fromSaved } from './styles'
import type { PluginApi } from '@valenced/plugins/types'
import type { Ai, Options, Original, Scope, Send } from './store'

export function Settings({
	api,
}: {
	api: PluginApi<{ jsonStorage: Options }>
}) {
	if (!storage) setStorage(api.jsonStorage)
	const loaded = api.jsonStorage.use()
	if (!loaded) return null
	return <Page />
}

function confirm(title: string, body: string, yes: string, run: () => void) {
	const { AlertModal, AlertActionButton } = Design as any
	AlertActionCreators.openAlert(
		'styletranslate-confirm',
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

function Page() {
	const {
		Stack,
		TableRadioGroup,
		TableRadioRow,
		TableRowGroup,
		TableRow,
		TableSwitchRow,
		TextInput,
	} = Design as any
	const s = useOptions()
	const [url, setUrl] = useState(s.aiUrl)
	const [key, setKey] = useState(s.aiKey)
	const [model, setModel] = useState(s.aiModel)
	const onCount = Object.keys(s.on).length
	const last = styleOf(s.style, s)

	return (
		<ScrollView
			contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
			keyboardShouldPersistTaps="handled"
		>
			<Stack spacing={24}>
				<TableRadioGroup
					title="When you send"
					value={s.send}
					onChange={(send: Send) => save({ send })}
				>
					<TableRadioRow
						label="Send it right away"
						subLabel="Your message goes out restyled, no extra taps"
						value="auto"
					/>
					<TableRadioRow
						label="Let me check it first"
						subLabel="The restyled text lands in the chat box so you can tweak it, then send"
						value="review"
					/>
				</TableRadioGroup>

				<TableRadioGroup
					title="Keep a style on"
					value={s.scope}
					onChange={(scope: Scope) => save({ scope, on: {} })}
				>
					<TableRadioRow
						label="Per chat"
						subLabel="Only where you turned it on"
						value="chat"
					/>
					<TableRadioRow
						label="Everywhere"
						subLabel="One style for every chat"
						value="all"
					/>
				</TableRadioGroup>

				<TableRadioGroup
					title="Show the original"
					value={s.original}
					onChange={(original: Original) => save({ original })}
				>
					<TableRadioRow label="Don't" value="off" />
					<TableRadioRow
						label="Small text underneath"
						subLabel="So people know what you meant"
						value="small"
					/>
					<TableRadioRow
						label="Hidden in a spoiler"
						subLabel="Tap to reveal"
						value="spoiler"
					/>
				</TableRadioGroup>

				<TableRowGroup title="Chat bar">
					<TableSwitchRow
						label="Style button"
						subLabel="Tap to pick a style, hold to turn your last one on or off"
						value={s.button}
						onValueChange={(button: boolean) => save({ button })}
					/>
					<TableSwitchRow
						label="Status above the chat bar"
						subLabel="Shows which style is on. Progress and errors always show"
						value={s.chip}
						onValueChange={(chip: boolean) => save({ chip })}
					/>
					<TableSwitchRow
						label="Get ready while typing"
						subLabel="Restyles in the background when you pause, so sending feels instant"
						value={s.ahead}
						onValueChange={(ahead: boolean) => save({ ahead })}
					/>
					{onCount > 0 && (
						<TableRow
							label={
								s.scope === 'all'
									? 'Turn the style off'
									: `Turn off in ${onCount} ${onCount === 1 ? 'chat' : 'chats'}`
							}
							variant="danger"
							onPress={() => save({ on: {} })}
						/>
					)}
				</TableRowGroup>

				<TableRowGroup title="Your styles">
					{s.customs.map(c => {
						const st = fromCustom(c)
						return (
							<TableRow
								key={c.id}
								label={st.name}
								subLabel={c.prompt}
								onPress={() =>
									confirm(`Delete ${st.name}?`, c.prompt, 'Delete', () =>
										save({
											customs: s.customs.filter(x => x.id !== c.id),
											favs: s.favs.filter(x => x !== c.id),
											recent: s.recent.filter(x => x !== c.id),
										}),
									)
								}
							/>
						)
					})}
					{s.saved.map(x => {
						const st = fromSaved(x)
						return (
							<TableRow
								key={x.post}
								label={st.name}
								subLabel="Saved from search"
								onPress={() =>
									confirm(
										`Remove ${st.name}?`,
										'You can find it again with search.',
										'Remove',
										() =>
											save({
												saved: s.saved.filter(y => y.post !== x.post),
												favs: s.favs.filter(y => y !== st.id),
												recent: s.recent.filter(y => y !== st.id),
											}),
									)
								}
							/>
						)
					})}
					<TableRow
						label="New style"
						subLabel="Describe any voice and AI writes in it"
						arrow
						onPress={() => newStyle()}
					/>
				</TableRowGroup>

				<TableRadioGroup
					title="AI for your styles"
					value={s.ai}
					onChange={(ai: Ai) => save({ ai })}
				>
					<TableRadioRow
						label="Free"
						subLabel="Pollinations, no account. Slow and one restyle every 45 seconds"
						value="free"
					/>
					<TableRadioRow
						label="My own key"
						subLabel="Any OpenAI compatible API, like OpenAI, OpenRouter or Groq"
						value="own"
					/>
				</TableRadioGroup>

				{s.ai === 'own' && (
					<Stack spacing={12}>
						<TextInput
							label="API URL"
							value={url}
							autoCapitalize="none"
							autoCorrect={false}
							onChange={(v: string) => {
								setUrl(v)
								save({ aiUrl: v.trim() })
							}}
						/>
						<TextInput
							label="API key"
							value={key}
							secureTextEntry
							autoCapitalize="none"
							autoCorrect={false}
							onChange={(v: string) => {
								setKey(v)
								save({ aiKey: v.trim() })
							}}
						/>
						<TextInput
							label="Model"
							value={model}
							autoCapitalize="none"
							autoCorrect={false}
							onChange={(v: string) => {
								setModel(v)
								save({ aiModel: v.trim() })
							}}
						/>
					</Stack>
				)}

				<TableRowGroup title="About">
					<TableRow
						label="Built-in styles come from AnythingTranslate"
						subLabel={`Last used: ${last?.name ?? 'none'}. Instant styles work offline`}
					/>
				</TableRowGroup>
			</Stack>
		</ScrollView>
	)
}
