import { useMemo, useState } from 'react'
import {
	Clipboard,
	Image,
	LayoutAnimation,
	Pressable,
	Text as RNText,
	ScrollView,
	View,
} from 'react-native'
import {
	icon,
	makeStyles,
	resolveSemanticColor,
	semanticColors,
	showToast,
} from '../../lib/common'
import Modal from '../../lib/components/Modal'
import Text from '../../lib/components/Text'

const useStyles = makeStyles(() => ({
	main: {
		backgroundColor: semanticColors.CARD_SECONDARY_BG,
		borderRadius: 8,
		padding: 12,
		gap: 8,
	},
	middle: {
		marginLeft: 'auto',
		marginRight: 'auto',
		alignItems: 'center',
		justifyContent: 'center',
	},
	leading: {
		alignSelf: 'flex-start',
		justifyContent: 'flex-start',
		alignItems: 'center',
	},
	trailing: {
		alignSelf: 'flex-start',
		justifyContent: 'flex-end',
		alignItems: 'center',
	},
	upIcon: {
		width: 24,
		height: 24,
		tintColor: semanticColors.INTERACTIVE_ICON_DEFAULT,
	},
	code: {
		backgroundColor: semanticColors.BACKGROUND_SECONDARY,
		borderColor: semanticColors.BORDER_MUTED,
		borderWidth: 1,
		borderRadius: 4,
		padding: 8,
		fontFamily: 'monospace',
		fontSize: 12,
		color: semanticColors.TEXT_DEFAULT,
	},
}))

function Card({
	label,
	error,
	clear,
}: {
	label: string
	error: string
	clear: () => void
}) {
	const styles = useStyles()
	const [expanded, setExpanded] = useState(false)
	const [gone, setGone] = useState(false)
	const short = useMemo(() => {
		const lines = error.split('\n')
		return lines.length > 1 ? `${lines[0]} …` : lines[0]
	}, [error])

	if (gone) return null

	const ripple = {
		color: resolveSemanticColor(semanticColors.ANDROID_RIPPLE),
		foreground: true,
	}

	return (
		<Pressable
			style={styles.main}
			android_ripple={ripple}
			onPress={() => {
				setExpanded(!expanded)
				LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
			}}
		>
			<View
				style={{
					flexDirection: 'row',
					justifyContent: 'center',
					alignItems: 'center',
				}}
			>
				<View style={styles.leading}>
					<Pressable
						android_ripple={ripple}
						onPress={() => {
							Clipboard.setString(error)
							showToast('Copied error', icon('CopyIcon'))
						}}
						style={{ padding: 4 }}
					>
						<Image
							source={icon('CopyIcon')}
							resizeMode="cover"
							style={styles.upIcon}
						/>
					</Pressable>
				</View>
				<View style={styles.middle}>
					<Text variant="text-lg/bold" color="TEXT_DEFAULT" align="center">
						{label}
					</Text>
				</View>
				<View style={styles.trailing}>
					<Pressable
						android_ripple={ripple}
						onPress={() => {
							clear()
							setGone(true)
							showToast('Cleared error', icon('TrashIcon'))
						}}
						style={{ padding: 4 }}
					>
						<Image
							source={icon('TrashIcon')}
							resizeMode="cover"
							style={styles.upIcon}
						/>
					</Pressable>
				</View>
			</View>
			<RNText selectable style={styles.code}>
				{expanded ? error : short}
			</RNText>
		</Pressable>
	)
}

export default function ErrorViewerModal({
	errors,
	module,
	clearEntry,
}: {
	errors: Record<string, string>
	module: string
	clearEntry: (entry: string) => void
}) {
	return () => (
		<Modal mkey="error-viewer" title={`${module} Errors`}>
			<ScrollView style={{ flex: 1, padding: 12 }}>
				<View style={{ gap: 12, flexDirection: 'column' }}>
					{Object.entries(errors).map(([label, err]) => (
						<Card
							key={label}
							label={label}
							error={err}
							clear={() => clearEntry(label)}
						/>
					))}
				</View>
			</ScrollView>
		</Modal>
	)
}
