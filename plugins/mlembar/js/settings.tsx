import { Design } from '@valenced/discord/design'
import { useState } from 'react'
import { Image, ScrollView, View } from 'react-native'
import { setStorage, storage, useOptions } from './store'
import { uploadImage } from './upload'
import type { PluginApi } from '@valenced/plugins/types'
import type { Mode, Options } from './store'

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

function Page() {
	const {
		Button,
		Stack,
		TableRadioGroup,
		TableRadioRow,
		TableRowGroup,
		TableSwitchRow,
		TextInput,
	} = Design as any
	const s = useOptions()
	const [url, setUrl] = useState(s.url)
	const [busy, setBusy] = useState(false)
	const shown = url.trim()

	const change = (v: string) => {
		setUrl(v)
		storage.set({ url: v })
	}

	return (
		<ScrollView
			contentContainerStyle={{ padding: 16, paddingBottom: 64 }}
			keyboardShouldPersistTaps="handled"
		>
			<Stack spacing={24}>
				<TableRadioGroup
					title="Background"
					value={s.mode}
					onChange={(mode: Mode) => storage.set({ mode })}
				>
					<TableRadioRow
						label="Nameplate"
						subLabel="Your normal nameplate"
						value="nameplate"
					/>
					<TableRadioRow
						label="Custom image"
						subLabel="Any image or gif from a link"
						value="image"
					/>
					<TableRadioRow
						label="None"
						subLabel="Plain bar, no nameplate"
						value="none"
					/>
				</TableRadioGroup>

				{s.mode === 'image' && (
					<Stack spacing={12}>
						<TextInput
							label="Image link"
							placeholder="https://example.com/image.png"
							value={url}
							autoCapitalize="none"
							autoCorrect={false}
							onChange={change}
						/>
						<Button
							variant="secondary"
							text={busy ? 'Uploading...' : 'Upload from device'}
							loading={busy}
							disabled={busy}
							onPress={async () => {
								const link = await uploadImage(() => setBusy(true))
								setBusy(false)
								if (link) change(link)
							}}
						/>
						{!!shown && (
							<View
								style={{
									height: 64,
									borderRadius: 16,
									overflow: 'hidden',
								}}
							>
								<Image
									source={{ uri: shown }}
									style={{ width: '100%', height: '100%' }}
									resizeMode="cover"
								/>
							</View>
						)}
						<TableRowGroup>
							<TableSwitchRow
								label="Fade"
								subLabel="Blend the left side into the bar"
								value={s.fade}
								onValueChange={(fade: boolean) => storage.set({ fade })}
							/>
						</TableRowGroup>
					</Stack>
				)}
			</Stack>
		</ScrollView>
	)
}
