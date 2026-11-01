import { Image, Pressable, View } from 'react-native'
import { makeStyles, resolveSemanticColor, semanticColors } from '../common'
import Text from './Text'
import type { PropsWithChildren, ReactNode } from 'react'

const useTitleStyles = makeStyles(() => ({
	icon: {
		width: 16,
		height: 16,
		marginTop: 1.5,
		tintColor: semanticColors.TEXT_MUTED,
	},
}))

const useGroupStyles = makeStyles(() => ({
	main: {
		backgroundColor: semanticColors.CARD_BACKGROUND_DEFAULT,
		borderColor: semanticColors.BORDER_MUTED,
		borderWidth: 1,
		borderRadius: 16,
		overflow: 'hidden',
		flex: 1,
	},
}))

export function BetterTableRowTitle({
	title,
	onPress,
	icon,
	padding,
}: {
	title: string
	onPress?: () => void
	icon?: number
	padding?: boolean
}) {
	const styles = useTitleStyles()
	const UseComponent: any = onPress ? Pressable : View

	return (
		<UseComponent
			android_ripple={
				onPress && {
					color: resolveSemanticColor(semanticColors.ANDROID_RIPPLE),
				}
			}
			onPress={onPress}
			style={{
				marginBottom: 8,
				marginHorizontal: padding ? 16 : 0,
				marginTop: padding ? 8 : 0,
				gap: 4,
				flexDirection: 'row',
				alignItems: 'center',
			}}
		>
			{icon && <Image style={styles.icon} source={icon} resizeMode="cover" />}
			<Text variant="text-sm/semibold" color="TEXT_MUTED">
				{title}
			</Text>
		</UseComponent>
	)
}

export function BetterTableRowGroup({
	title,
	onTitlePress,
	icon,
	children,
	padding,
	nearby,
}: PropsWithChildren<{
	title?: string | ReactNode
	onTitlePress?: () => void
	icon?: number
	padding?: boolean
	nearby?: boolean
}>) {
	const styles = useGroupStyles()

	return (
		<View style={{ marginHorizontal: 16, marginTop: nearby ? 8 : 16 }}>
			{title ? (
				typeof title === 'string' ? (
					<BetterTableRowTitle
						title={title}
						onPress={onTitlePress}
						icon={icon}
					/>
				) : (
					title
				)
			) : null}
			<View style={styles.main}>
				{padding ? (
					<View style={{ paddingHorizontal: 16, paddingVertical: 16 }}>
						{children}
					</View>
				) : (
					children
				)}
			</View>
		</View>
	)
}
