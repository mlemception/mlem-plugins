import { createElement, isValidElement } from 'react'
import { Image, View } from 'react-native'
import {
	icon,
	Reanimated,
	rawColors,
	resolveCustomSemantic,
	resolveSemanticColor,
	semanticColors,
} from '../../../lib/common'
import Text from '../../../lib/components/Text'

function SnackbarIcon({
	img,
	color,
	style,
}: {
	img: any
	color?: any
	style: any
}) {
	if (isValidElement(img)) return img
	if (typeof img === 'function') {
		return createElement(img, { size: 'md', color, style })
	}

	const source =
		img && typeof img === 'object' && 'src' in img
			? img.src
				? { uri: img.src }
				: undefined
			: img
	return (
		<Image
			source={source}
			style={[
				style,
				img?.type === 'avatar' && { borderRadius: 12 },
				typeof img === 'number' && color && { tintColor: color },
			]}
			resizeMode="contain"
		/>
	)
}

export default function M3Snackbar({
	text,
	content,
	source,
	icon: iconProp,
	IconComponent,
	iconColor,
	variant,
	isOnBottom,
	inverted,
}: {
	text?: any
	content?: any
	source?: any
	icon?: any
	IconComponent?: any
	iconColor?: any
	variant?: 'default' | 'success' | 'critical'
	isOnBottom?: boolean
	inverted?: boolean
}) {
	const styles = {
		container: {
			backgroundColor: resolveCustomSemantic(
				rawColors.PRIMARY_200,
				rawColors.PRIMARY_730,
				inverted,
			),
			width: 344,
			minHeight: 48,
			borderRadius: 8,
			paddingHorizontal: 16,
			paddingVertical: 14,
			flexDirection: 'row',
		},
		text: {
			color: resolveCustomSemantic(
				rawColors.PRIMARY_730,
				rawColors.PRIMARY_130,
				inverted,
			),
			width: 280,
		},
		iconContainer: {
			alignSelf: 'flex-end',
			width: 48,
			height: '100%',
			justifyContent: 'center',
			alignItems: 'center',
		},
		icon: {
			width: 24,
			height: 24,
		},
		shadow: {
			shadowColor: '#000',
			shadowOffset: {
				width: 0,
				height: 12,
			},
			shadowOpacity: 0.58,
			shadowRadius: 16.0,
			elevation: 24,
		},
	}

	const value = text ?? content
	const node = typeof value === 'function' ? createElement(value) : value
	const fallback =
		variant === 'success'
			? icon('CircleCheckIcon')
			: variant === 'critical'
				? icon('CircleErrorIcon')
				: undefined
	const img = source ?? iconProp ?? IconComponent ?? fallback
	const color = iconColor
		? resolveSemanticColor(iconColor)
		: variant === 'success'
			? resolveSemanticColor(semanticColors.TEXT_FEEDBACK_POSITIVE)
			: variant === 'critical'
				? resolveSemanticColor(semanticColors.TEXT_FEEDBACK_CRITICAL)
				: typeof img === 'function'
					? styles.text.color
					: undefined
	const AnimatedView = Reanimated.default.View

	return (
		<AnimatedView
			style={[styles.container, styles.shadow]}
			entering={
				isOnBottom
					? Reanimated.FadeInUp.duration(150)
					: Reanimated.FadeInDown.duration(150)
			}
		>
			<Text variant="text-md/semibold" style={styles.text}>
				{node}
			</Text>
			{!!img && (
				<View style={styles.iconContainer as any}>
					<SnackbarIcon img={img} color={color} style={styles.icon} />
				</View>
			)}
		</AnimatedView>
	)
}
