import { ReactNativeSafeAreaContext } from '@valenced/externals/react-native-safe-area-context'
import { cloneElement, isValidElement } from 'react'
import {
	FlatList,
	ScrollView,
	SectionList,
	useWindowDimensions,
	View,
} from 'react-native'
import { resolveSemanticColor, semanticColors } from '../../../../lib/common'
import Text from '../../../../lib/components/Text'
import TextButton from './TextButton'
import type { ReactElement, ReactNode } from 'react'

const colorMap: Record<string, 'BRAND' | 'DANGER' | 'POSITIVE' | 'NORMAL'> = {
	destructive: 'DANGER',
	danger: 'DANGER',
	active: 'POSITIVE',
	positive: 'POSITIVE',
}

export default function M3Dialog({
	title,
	body,
	children,
	actions,
}: {
	title?: ReactNode
	body?: ReactNode
	children?: ReactNode
	actions?: ReactNode
}) {
	const styles = {
		textContent: {
			width: '100%',
			flexDirection: 'column',
			gap: 16,
			flexShrink: 1,
			paddingHorizontal: 24,
			paddingTop: 24,
		},
		actions: {
			width: '100%',
			flexDirection: 'row-reverse',
			flexWrap: 'wrap',
			gap: 8,
			paddingLeft: 8,
			paddingVertical: 24,
		},
	} as const

	const nested =
		!!children ||
		(isValidElement(body) &&
			[ScrollView, FlatList, SectionList].includes(body.type as any))
	const text = (
		<View style={styles.textContent}>
			{!!title && (
				<Text variant="text-lg/semibold" color="TEXT_DEFAULT">
					{title}
				</Text>
			)}
			{isValidElement(body) ? (
				<View style={{ padding: 0, flexShrink: 1 }}>{body}</View>
			) : (
				!!body && (
					<Text variant="text-md/semibold" color="TEXT_DEFAULT">
						{body}
					</Text>
				)
			)}
			{children}
		</View>
	)

	return (
		<>
			{nested ? (
				<View style={{ flexShrink: 1, overflow: 'hidden' }}>{text}</View>
			) : (
				<ScrollView style={{ flexShrink: 1 }} bounces={false}>
					{text}
				</ScrollView>
			)}
			<View style={styles.actions}>{actions}</View>
		</>
	)
}

export function M3AlertModal({
	render,
	...props
}: {
	render: (props: any) => ReactElement<any>
	title?: ReactNode
	content?: ReactNode
	extraContent?: ReactNode
	actions?: ReactNode
}) {
	const root = render(props)
	const { width, height } = useWindowDimensions()
	const { top, bottom } = ReactNativeSafeAreaContext.useSafeAreaInsets()
	const dialog = (
		<M3Dialog title={props.title} body={props.content} actions={props.actions}>
			{props.extraContent}
		</M3Dialog>
	)

	if (!isValidElement(root)) return dialog

	return cloneElement(root, {
		style: [
			(root.props as any).style,
			{
				backgroundColor: resolveSemanticColor(
					semanticColors.BACKGROUND_SURFACE_HIGH,
				),
				borderRadius: 28,
				borderWidth: 0,
				margin: 0,
				width: width * 0.85,
				maxWidth: '100%',
				maxHeight: height - top - bottom - 32,
				flexDirection: 'column',
			},
		],
		children: dialog,
	} as any)
}

export function M3AlertButton({
	render,
	...props
}: {
	render: (props: any) => ReactElement<any>
	[key: string]: any
}) {
	const { text, variant, disabled, loading, onPress } = (render(props)?.props ??
		props) as any

	return (
		<TextButton
			label={text}
			color={colorMap[variant] ?? 'BRAND'}
			disabled={disabled}
			loading={loading}
			onPress={onPress}
		/>
	)
}
