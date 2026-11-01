import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { View } from 'react-native'
import type { FC, PropsWithChildren } from 'react'
import type { ViewProps } from 'react-native'

type ActionSheetProps = PropsWithChildren<
	ViewProps & {
		title: string
		onClose?: () => void
	}
>

export function ActionSheet({ title, onClose, ...props }: ActionSheetProps) {
	const { ActionSheet: Sheet, BottomSheetTitleHeader } = Design as any
	const Close = (Design as any).ActionSheetCloseButton

	return (
		<Sheet
			header={
				<BottomSheetTitleHeader
					title={title}
					trailing={
						<Close
							onPress={
								onClose ?? (() => ActionSheetActionCreators.hideActionSheet())
							}
						/>
					}
				/>
			}
		>
			<View {...props} />
		</Sheet>
	)
}

ActionSheet.open = <P extends object>(sheet: FC<P>, props: P) => {
	ActionSheetActionCreators.openLazy(
		Promise.resolve({ default: sheet }) as any,
		'ActionSheet',
		props as any,
	)
}
