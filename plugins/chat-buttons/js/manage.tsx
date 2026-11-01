import {
	ActionSheetActionCreators,
	AlertActionCreators,
} from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { createElement, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { tint } from './icons'
import { iconFor, storage, useLive } from './store'

function Nickname({ id, label }: { id: string; label: string }) {
	const { AlertModal, AlertActionButton, TextInput } = Design as any
	const [text, setText] = useState(storage.cache?.names?.[id] ?? '')

	return (
		<AlertModal
			title="Nickname"
			content={label}
			extraContent={
				<TextInput
					autoFocus
					placeholder={label}
					value={text}
					onChange={setText}
				/>
			}
			actions={
				<>
					<AlertActionButton
						text="Save"
						variant="primary"
						onPress={() => storage.set({ names: { [id]: text.trim() } })}
					/>
					<AlertActionButton text="Cancel" variant="secondary" />
				</>
			}
		/>
	)
}

function ButtonList() {
	const { FormSwitch, TableRow, TableRowGroup } = Design as any
	const s = storage.use()
	useLive()
	if (!s) return null

	const ids = Object.keys(s.seen ?? {})

	return (
		<TableRowGroup title="In the menu">
			{!ids.length && <TableRow label="Open a chat to see your buttons" />}
			{ids.map(id => {
				const label = s.seen[id]
				const name = s.names?.[id]
				const Icon = iconFor(id)
				return (
					<TableRow
						key={id}
						label={name || label}
						subLabel={name ? label : 'Tap to add a nickname'}
						icon={
							Icon ? <TableRow.Icon IconComponent={tint(Icon)} /> : undefined
						}
						trailing={
							<FormSwitch
								value={!s.kept?.[id]}
								onValueChange={(v: boolean) =>
									storage.set({ kept: { [id]: !v } })
								}
							/>
						}
						onPress={() =>
							AlertActionCreators.openAlert(
								'chatbuttons-nickname',
								createElement(Nickname, { id, label }),
							)
						}
					/>
				)
			})}
		</TableRowGroup>
	)
}

function ManageSheet() {
	const { ActionSheet, ActionSheetCloseButton, BottomSheetTitleHeader } =
		Design as any

	return (
		<ActionSheet
			header={
				<BottomSheetTitleHeader
					title="Chat buttons"
					trailing={
						<ActionSheetCloseButton
							onPress={() => ActionSheetActionCreators.hideActionSheet()}
						/>
					}
				/>
			}
		>
			<View style={{ paddingBottom: 16 }}>
				<ButtonList />
			</View>
		</ActionSheet>
	)
}

export const openManage = () =>
	ActionSheetActionCreators.openLazy(
		Promise.resolve({ default: ManageSheet }) as any,
		'ChatButtons',
		{} as any,
	)

export function Settings() {
	return (
		<ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 64 }}>
			<ButtonList />
		</ScrollView>
	)
}
