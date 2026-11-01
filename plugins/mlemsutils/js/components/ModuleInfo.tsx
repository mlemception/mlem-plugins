import { Design } from '@valenced/discord/design'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import { Image } from 'react-native'
import {
	Forms,
	icon,
	resolveSemanticColor,
	semanticColors,
} from '../lib/common'
import Text from '../lib/components/Text'
import { getModuleExtras } from '../stuff/Module'
import { ModuleRoute } from './pages/route'
import type { AnyModule } from '../stuff/Module'

export function ModuleInfo({ module }: { module: AnyModule }) {
	const navigation = ReactNavigationNative.useNavigation<any>()
	module.useRefresh()

	const { Stack } = Design as any
	const { FormRow } = Forms
	const extras = getModuleExtras(module)
	const color =
		extras[0]?.color ?? resolveSemanticColor(semanticColors.TEXT_DEFAULT)
	const source =
		typeof module.meta.icon === 'string'
			? icon(module.meta.icon)
			: module.meta.icon

	return (
		<FormRow
			label={
				<Stack direction="horizontal" align="center" spacing={6}>
					<Text variant="text-md/semibold" style={{ paddingRight: 6, color }}>
						{module.label}
					</Text>
					{extras.map(extra => (
						<Image
							key={extra.id}
							source={icon(extra.icon)}
							style={{
								width: 18,
								height: 18,
								tintColor: extra.color ?? color,
							}}
						/>
					))}
				</Stack>
			}
			subLabel={module.meta.sublabel}
			leading={<FormRow.Icon source={source} style={{ tintColor: color }} />}
			trailing={<FormRow.Arrow />}
			onPress={() => navigation.push(ModuleRoute, { id: module.id })}
		/>
	)
}
