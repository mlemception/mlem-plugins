import { createElement } from 'react'
import { Image } from 'react-native'
import repost from './repost.png'

const sizes: Record<string, number> = {
	xxs: 12,
	xs: 16,
	sm: 18,
	md: 24,
	lg: 32,
}

export function RepostIcon({ size = 'md', color, style }: any) {
	const px = typeof size === 'number' ? size : (sizes[size] ?? 24)
	return createElement(Image, {
		source: { uri: repost },
		style: [{ width: px, height: px, tintColor: color }, style],
	})
}
