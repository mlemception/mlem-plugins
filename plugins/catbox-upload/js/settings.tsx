import { Design } from '@valenced/discord/design'
import { useState } from 'react'
import { ScrollView } from 'react-native'
import { setStorage, storage, useOptions } from './store'
import { hosts, size } from './upload'
import type { PluginApi } from '@valenced/plugins/types'
import type { Expiry, Host, Options, Paste } from './store'

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

const expiries: [Expiry, string][] = [
	['1h', '1 hour'],
	['12h', '12 hours'],
	['24h', '1 day'],
	['72h', '3 days'],
]

function Page() {
	const { Stack, TableRadioGroup, TableRadioRow, TextInput } = Design as any
	const s = useOptions()
	const [hash, setHash] = useState(s.userhash)

	return (
		<ScrollView
			contentContainerStyle={{ padding: 16, paddingBottom: 64 }}
			keyboardShouldPersistTaps="handled"
		>
			<Stack spacing={24}>
				<TableRadioGroup
					title="Upload to"
					value={s.host}
					onChange={(host: Host) => storage.set({ host })}
				>
					<TableRadioRow
						label="Catbox"
						subLabel={`Links last forever, up to ${size(hosts.catbox.max)}`}
						value="catbox"
					/>
					<TableRadioRow
						label="Litterbox"
						subLabel={`Links expire and Discord won't preview them, up to ${size(hosts.litterbox.max)}`}
						value="litterbox"
					/>
				</TableRadioGroup>

				<TableRadioGroup
					title="Paste as"
					value={s.paste}
					onChange={(paste: Paste) => storage.set({ paste })}
				>
					<TableRadioRow label="Link" subLabel="The full link" value="link" />
					<TableRadioRow
						label="Hidden link"
						subLabel="Invisible, only the preview shows"
						value="hidden"
					/>
					<TableRadioRow
						label="Tiny link"
						subLabel="A small ˙ you can still tap"
						value="dot"
					/>
				</TableRadioGroup>

				{s.host === 'litterbox' ? (
					<TableRadioGroup
						title="Delete after"
						value={s.expiry}
						onChange={(expiry: Expiry) => storage.set({ expiry })}
					>
						{expiries.map(([k, label]) => (
							<TableRadioRow key={k} label={label} value={k} />
						))}
					</TableRadioGroup>
				) : (
					<TextInput
						label="Catbox userhash"
						description="Optional. Uploads land in your Catbox account so you can delete them later."
						placeholder="Leave empty to upload anonymously"
						value={hash}
						secureTextEntry
						autoCapitalize="none"
						autoCorrect={false}
						isClearable
						onChange={(v: string) => {
							setHash(v)
							storage.set({ userhash: v.trim() })
						}}
						onClear={() => {
							setHash('')
							storage.set({ userhash: '' })
						}}
					/>
				)}
			</Stack>
		</ScrollView>
	)
}
