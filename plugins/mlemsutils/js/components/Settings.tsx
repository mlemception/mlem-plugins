import { ScrollView, View } from 'react-native'
import { BetterTableRowGroup } from '../lib/components/BetterTableRow'
import Text from '../lib/components/Text'
import modules from '../modules'
import { moduleCategoryMap } from '../stuff/Module'
import { Header } from './Header'
import { ModuleInfo } from './ModuleInfo'

export function Settings() {
	return (
		<ScrollView>
			<Header />
			{moduleCategoryMap().map(({ category, title, icon }) => {
				const mods = modules.filter(x => x.meta.category === category)
				const noMods = mods.length === 0
				return (
					<BetterTableRowGroup
						key={title}
						title={title}
						icon={icon}
						padding={noMods}
					>
						{mods.map(module => (
							<ModuleInfo key={module.id} module={module} />
						))}
						{noMods && (
							<Text variant="text-md/semibold" color="TEXT_DEFAULT">
								{`No plugins in the ${title} category yet!`}
							</Text>
						)}
					</BetterTableRowGroup>
				)
			})}
			<View style={{ height: 12 }} />
		</ScrollView>
	)
}
