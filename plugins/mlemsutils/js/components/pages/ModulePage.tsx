import { Design } from '@valenced/discord/design'
import { useLayoutEffect, useMemo, useReducer } from 'react'
import { Image, Pressable, ScrollView, View } from 'react-native'
import {
	byProps,
	Forms,
	icon,
	makeStyles,
	resolveCustomSemantic,
	resolveSemanticColor,
	semanticColors,
} from '../../lib/common'
import { BetterTableRowGroup } from '../../lib/components/BetterTableRow'
import Text from '../../lib/components/Text'
import modules from '../../modules'
import { getModuleExtras } from '../../stuff/Module'
import { ModuleOption } from '../ModuleOption'
import type { AnyModule } from '../../stuff/Module'

const useStyles = makeStyles(() => ({
	thumbnailCard: {
		backgroundColor: semanticColors.CARD_BACKGROUND_DEFAULT,
		borderColor: semanticColors.BORDER_MUTED,
		borderWidth: 1,
		borderRadius: 16,
		width: '100%',
		height: 200,
	},
}))

function Enabled({ module }: { module: AnyModule }) {
	const [, update] = useReducer(x => ~x, 0)
	module.useRefresh()

	const { FormRow, FormSwitchRow } = Forms
	return (
		<FormSwitchRow
			label="Enabled"
			subLabel={module.disabledReason}
			leading={<FormRow.Icon source={icon('SettingsIcon')} />}
			value={module.storage.enabled}
			onValueChange={() => {
				module.toggle()
				update()
			}}
		/>
	)
}

function ModulePageInner({ module }: { module: AnyModule }) {
	module.useRefresh()

	const { Stack } = Design as any
	const { FormRow } = Forms
	const extras = getModuleExtras(module).filter(x => x.content)
	const styles = useStyles()
	const text = resolveSemanticColor(semanticColors.TEXT_DEFAULT)

	const theme = byProps('useThemeContext').useThemeContext()
	const thumbnail = useMemo(() => {
		const t = module.meta.thumbnail as any
		return t && typeof t === 'object' && 'dark' in t
			? resolveCustomSemantic(t.dark, t.light)
			: t
	}, [theme])

	return (
		<ScrollView style={{ flex: 1, paddingBottom: 16 }}>
			<BetterTableRowGroup padding>
				<Text variant="text-md/medium" color="TEXT_DEFAULT">
					{module.meta.sublabel}
				</Text>
			</BetterTableRowGroup>
			{thumbnail && (
				<View style={{ padding: 16, paddingTop: 8 }}>
					<Image
						resizeMode="cover"
						source={thumbnail}
						style={styles.thumbnailCard}
					/>
				</View>
			)}
			<BetterTableRowGroup title="Status" icon={icon('TopicsIcon')}>
				{extras[0] ? (
					extras.map(extra => {
						const content = (
							<View key={extra.id} style={{ padding: 8 }}>
								<Stack
									direction="horizontal"
									spacing={8}
									align="center"
									style={{ padding: 8 }}
								>
									<Image
										source={icon(extra.icon)}
										style={{ tintColor: extra.color ?? text }}
									/>
									<Text
										variant="text-md/medium"
										style={{ flex: 1, color: extra.color ?? text }}
									>
										{extra.content}
									</Text>
									{extra.action && <FormRow.Arrow />}
								</Stack>
							</View>
						)

						return extra.action ? (
							<Pressable key={extra.id} onPress={extra.action}>
								{content}
							</Pressable>
						) : (
							content
						)
					})
				) : (
					<Enabled module={module} />
				)}
			</BetterTableRowGroup>
			{extras[0] && (
				<BetterTableRowGroup nearby>
					<Enabled module={module} />
				</BetterTableRowGroup>
			)}
			{Object.keys(module.settings)[0] && (
				<BetterTableRowGroup title="Options" icon={icon('SettingsIcon')}>
					{Object.keys(module.settings).map(id => (
						<ModuleOption key={id} module={module} id={id} />
					))}
				</BetterTableRowGroup>
			)}
			<View style={{ height: 16 }} />
		</ScrollView>
	)
}

export function ModulePage({ route, navigation }: any) {
	const module = modules.find(x => x.id === route.params?.id)

	useLayoutEffect(() => {
		if (module) navigation.setOptions({ title: module.label })
	}, [module])

	return module ? <ModulePageInner module={module} /> : null
}
