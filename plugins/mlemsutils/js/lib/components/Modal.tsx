import { Design } from '@valenced/discord/design'
import { byProps } from '../common'
import type { FC, PropsWithChildren } from 'react'

export const pushModal = (key: string, modal: FC) =>
	byProps('pushModal', 'popModal').pushModal({ key, modal })

export const popModal = (key: string) =>
	byProps('pushModal', 'popModal').popModal(key)

export default function Modal({
	mkey,
	children,
	...props
}: PropsWithChildren<{
	mkey: string
	title?: string
	headerRight?: FC
}>) {
	const { Navigator, getHeaderCloseButton } = Design as any

	return (
		<Navigator
			initialRouteName={mkey}
			screens={{
				[mkey]: {
					...props,
					headerLeft: getHeaderCloseButton(() => popModal(mkey)),
					render: () => children,
				},
			}}
		/>
	)
}
