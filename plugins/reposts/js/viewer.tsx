import { getAssetIdByName } from '@valenced/assets'
import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { ReactNativeSafeAreaContext } from '@valenced/externals/react-native-safe-area-context'
import { View } from 'react-native'
import { Chip } from './chip'
import {
	assetIcon,
	buzz,
	canJump,
	colors,
	jump,
	me,
	toast,
	useToken,
} from './discord'
import { RepostIcon } from './icon'
import { ago, MessageBody, Source, shownText } from './message'
import { useVersion } from './store'
import { checkOf } from './verify'
import type { Entry } from '../shared/wire'

const KEY = 'RepostsFullView'

export function openFull(entry: Entry, owner: string) {
	buzz('IMPACT_LIGHT')
	try {
		ActionSheetActionCreators.openLazy(
			Promise.resolve({ default: FullView }) as any,
			KEY,
			{ entry, owner },
			'stack' as any,
		)
	} catch {}
}

const close = () => ActionSheetActionCreators.hideActionSheet(KEY)

function FullView({ entry, owner }: { entry: Entry; owner: string }) {
	const {
		ActionSheet,
		BottomSheetTitleHeader,
		ActionSheetCloseButton,
		Text,
		Button,
	} = Design as any
	useVersion()
	const c = colors()
	const muted = useToken(c.ICON_MUTED ?? c.TEXT_MUTED)
	const insets = (ReactNativeSafeAreaContext as any).useSafeAreaInsets?.()
	const mine = owner === me()
	const status = checkOf(entry)
	const verified =
		canJump(entry, owner) && (status === 'ok' || status === 'edited')
	const copyable = !!shownText(entry)
	return (
		<ActionSheet
			startExpanded
			scrollable
			header={
				<BottomSheetTitleHeader
					title={mine ? 'Your repost' : 'Repost'}
					trailing={<ActionSheetCloseButton onPress={close} />}
				/>
			}
		>
			<View
				style={{
					paddingHorizontal: 16,
					paddingTop: 4,
					paddingBottom: 16 + (insets?.bottom ?? 24),
					gap: 12,
				}}
			>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
					<RepostIcon size={14} color={muted} />
					<Text
						variant="text-xs/semibold"
						color="text-muted"
						style={{ flex: 1 }}
					>
						{`${mine ? 'You reposted' : 'Reposted'} · ${ago(entry.at)}`}
					</Text>
					<Chip entry={entry} />
				</View>
				<MessageBody entry={entry} full />
				{(!entry.p || mine) && <Source entry={entry} />}
				{(verified || copyable) && (
					<View
						style={{
							flexDirection: 'row',
							justifyContent: 'center',
							gap: 8,
							marginTop: 4,
						}}
					>
						{verified && (
							<Button
								text="Jump to Message"
								variant="primary"
								size="sm"
								grow={false}
								icon={getAssetIdByName('ChatArrowRightIcon')}
								onPress={() => {
									close()
									jump(entry)
								}}
							/>
						)}
						{copyable && (
							<Button
								text="Copy Text"
								variant="secondary"
								size="sm"
								grow={false}
								icon={getAssetIdByName('CopyIcon')}
								onPress={() => {
									Clipboard.setString(entry.t!)
									toast('Copied to clipboard', assetIcon('CopyIcon'))
								}}
							/>
						)}
					</View>
				)}
			</View>
		</ActionSheet>
	)
}
