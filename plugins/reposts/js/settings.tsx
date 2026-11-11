import { Design } from '@valenced/discord/design'
import { Image, ScrollView, View } from 'react-native'
import { connect, deleteEverything, logout, setOptOut } from './auth'
import { confirm, explain } from './connect'
import { assetIcon, avatarUrl, displayName, me, stores } from './discord'
import { RepostIcon } from './icon'
import { account, connected, live, save, saved, useVersion } from './store'

const STORED =
	"For each repost: the message, channel and server IDs, the text, attachment names and sizes, and who wrote it unless you reposted anonymously. Anonymous reposts never store the author, not even on the server. Names and pictures aren't stored, they're looked up live from Discord.\n\nTo log in, Reposts only gets your Discord ID. The Discord token it gets is thrown away right after."

const PROTECT =
	"Everything needs a Reposts login, responses are scrambled so they aren't readable at a glance, and requests are rate limited. That stops casual snooping, not someone determined: anyone who logs in can see the reposts of people they look up, the same as in the app."

export function Settings() {
	const { TableRowGroup, TableRow, TableSwitchRow, TableRowIcon, Text } =
		Design as any
	useVersion()
	const uid = me()
	const on = connected()
	const a = account()
	const user = uid ? stores.UserStore?.getUser?.(uid) : undefined
	const Icon = (name: string, variant?: string) => (
		<TableRowIcon
			source={undefined}
			IconComponent={assetIcon(name)}
			variant={variant}
		/>
	)

	return (
		<ScrollView
			contentContainerStyle={{ padding: 16, paddingBottom: 64, gap: 24 }}
		>
			<TableRowGroup title="Account">
				{on ? (
					<TableRow
						label={displayName(user)}
						subLabel={`Connected · ${a.mine.length === 1 ? '1 repost' : `${a.mine.length} reposts`}`}
						icon={
							user ? (
								<Image
									source={{ uri: avatarUrl(user, 64) }}
									style={{ width: 32, height: 32, borderRadius: 16 }}
								/>
							) : (
								<RepostIcon size={24} />
							)
						}
					/>
				) : (
					<TableRow
						label={live.connecting ? 'Connecting…' : 'Connect with Discord'}
						subLabel="Needed to repost and to see other people's reposts"
						icon={<TableRowIcon IconComponent={RepostIcon} />}
						arrow
						disabled={live.connecting}
						onPress={connect}
					/>
				)}
				{on && (
					<TableRow
						label="Log Out"
						icon={Icon('DoorExitIcon')}
						onPress={() =>
							confirm(
								'Log out of Reposts?',
								'Your reposts stay on your profile. You can log back in any time.',
								'Log out',
								logout,
							)
						}
					/>
				)}
			</TableRowGroup>

			{on && (
				<TableRowGroup title="Privacy">
					<TableSwitchRow
						label="Let people repost my messages"
						subLabel="When off, nobody can repost what you write, and existing public reposts of your messages are hidden"
						value={!a.optout}
						onValueChange={(v: boolean) => setOptOut(!v)}
					/>
				</TableRowGroup>
			)}

			{saved.hidden.length > 0 && (
				<TableRowGroup title="Hidden">
					<TableRow
						label="Show reposts I hid"
						subLabel={
							saved.hidden.length === 1
								? '1 hidden repost'
								: `${saved.hidden.length} hidden reposts`
						}
						icon={Icon('EyeIcon')}
						onPress={() => save({ hidden: [] })}
					/>
				</TableRowGroup>
			)}

			<TableRowGroup title="About">
				<TableRow
					label="What's stored"
					icon={Icon('CircleInformationIcon')}
					arrow
					onPress={() => explain("What's stored", STORED)}
				/>
				<TableRow
					label="How it's protected"
					icon={Icon('ShieldIcon')}
					arrow
					onPress={() => explain("How it's protected", PROTECT)}
				/>
			</TableRowGroup>

			{on && (
				<TableRowGroup>
					<TableRow
						label="Delete All My Reposts"
						variant="danger"
						icon={Icon('TrashIcon', 'danger')}
						onPress={() =>
							confirm(
								'Delete everything?',
								"All your reposts are deleted from the server and you're logged out on every device. This can't be undone.",
								'Delete everything',
								deleteEverything,
							)
						}
					/>
				</TableRowGroup>
			)}

			{live.outdated && (
				<View style={{ alignItems: 'center' }}>
					<Text variant="text-sm/medium" color="text-danger">
						A newer version of Reposts is needed. Update it from the plugin
						list.
					</Text>
				</View>
			)}
		</ScrollView>
	)
}
