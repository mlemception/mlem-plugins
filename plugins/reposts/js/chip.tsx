import { Design } from '@valenced/discord/design'
import { Pressable } from 'react-native'
import { explain } from './connect'
import { assetIcon, colors, useToken } from './discord'
import { CHECK_TEXT, checkOf } from './verify'
import type { Entry } from '../shared/wire'

const ICONS = {
	edited: 'PencilIcon',
	deleted: 'TrashIcon',
	mismatch: 'CircleErrorIcon',
	unknown: 'CircleInformationIcon',
} as const

export function Chip({ entry }: { entry: Entry }) {
	const { Text } = Design as any
	const c = colors()
	const status = checkOf(entry)
	const good = useToken(c.STATUS_POSITIVE)
	const warn = useToken(c.STATUS_WARNING)
	const bad = useToken(c.STATUS_DANGER)
	const muted = useToken(c.ICON_MUTED ?? c.TEXT_MUTED)
	if (!status) return null
	const [title, body] = CHECK_TEXT[status]
	const tint =
		status === 'ok'
			? good
			: status === 'mismatch'
				? bad
				: status === 'edited'
					? warn
					: muted
	const Icon = status === 'ok' ? undefined : assetIcon(ICONS[status])
	return (
		<Pressable
			hitSlop={10}
			onPress={() => explain(title, body)}
			accessibilityRole="button"
			accessibilityLabel={title}
			style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
		>
			{Icon && <Icon size="xs" color={tint} />}
			<Text variant="text-xs/semibold" style={{ color: tint }}>
				{title}
			</Text>
		</Pressable>
	)
}
