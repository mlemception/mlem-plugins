import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { setStorage, storage, useOptions } from './store'
import type { PluginApi } from '@valenced/plugins/types'
import type { Header, Options, RailLook } from './store'

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
		Stack,
		TableRadioGroup,
		TableRadioRow,
		TableRowGroup,
		TableSwitchRow,
	} = Design as any
	const s = useOptions()
	const set = (v: Partial<Options>) => storage.set(v)
	const off = !s.sidebar

	return (
		<ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 64 }}>
			<Stack spacing={24}>
				<TableRowGroup>
					<TableSwitchRow
						label="Folder sidebar"
						subLabel="Open folders in their own column next to your servers"
						value={s.sidebar}
						onValueChange={(sidebar: boolean) => set({ sidebar })}
					/>
					<TableSwitchRow
						label="Animate"
						subLabel="Slide the panel over like Discord does"
						disabled={off}
						value={s.animate}
						onValueChange={(animate: boolean) => set({ animate })}
					/>
					<TableSwitchRow
						label="Swipe to close"
						subLabel="Swipe left on the sidebar to close it"
						disabled={off}
						value={s.swipe}
						onValueChange={(swipe: boolean) => set({ swipe })}
					/>
				</TableRowGroup>

				<TableRadioGroup
					title="Folders in the server list"
					value={s.rail}
					onChange={(rail: RailLook) => set({ rail })}
				>
					<TableRadioRow
						label="Server icons"
						subLabel="Small server icons, folder icon while open"
						value="icons"
					/>
					<TableRadioRow
						label="Folder icon"
						subLabel="Always show the folder icon"
						value="folder"
					/>
				</TableRadioGroup>

				<TableRadioGroup
					title="Folder icon in the sidebar"
					value={s.header}
					onChange={(header: Header) => set({ header })}
				>
					<TableRadioRow label="Always" value="always" />
					<TableRadioRow
						label="When more than one folder is open"
						value="many"
					/>
					<TableRadioRow label="Never" value="never" />
				</TableRadioGroup>

				<TableRowGroup title="Behavior">
					<TableSwitchRow
						label="Folder name"
						subLabel="Show the name under the folder icon in the sidebar"
						disabled={off || s.header === 'never'}
						value={s.names}
						onValueChange={(names: boolean) => set({ names })}
					/>
					<TableSwitchRow
						label="One folder at a time"
						subLabel="Opening a folder closes the others"
						value={s.oneOpen}
						onValueChange={(oneOpen: boolean) => set({ oneOpen })}
					/>
					<TableSwitchRow
						label="Close after picking a server"
						subLabel="Close the folder when you pick a server from it"
						value={s.closeOnPick}
						onValueChange={(closeOnPick: boolean) => set({ closeOnPick })}
					/>
					<TableSwitchRow
						label="Close on other servers"
						subLabel="Close folders when you pick a server that isn't in one"
						value={s.closeOutside}
						onValueChange={(closeOutside: boolean) => set({ closeOutside })}
					/>
					<TableSwitchRow
						label="Close on messages"
						subLabel="Close folders when you go to your DMs"
						value={s.closeOnHome}
						onValueChange={(closeOnHome: boolean) => set({ closeOnHome })}
					/>
					<TableSwitchRow
						label="Follow the open server"
						subLabel="Open a server's folder when you switch to it from somewhere else"
						value={s.followGuild}
						onValueChange={(followGuild: boolean) => set({ followGuild })}
					/>
				</TableRowGroup>
			</Stack>
		</ScrollView>
	)
}
