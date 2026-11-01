import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { Module, ModuleCategory } from '../../stuff/Module'

const noRows = (rows: any) =>
	Array.isArray(rows) ? rows.map(x => (Array.isArray(x) ? [] : x)) : rows

export default new Module({
	id: 'no-invite-to-servers',
	label: 'No Invite to Servers',
	meta: {
		sublabel: "Removes the 'Invite to Servers' button from profiles",
		category: ModuleCategory.Fixes,
		icon: 'UserPlusIcon',
	},
	handlers: {
		onStart() {
			this.patches.add(
				getModules(
					withProps<any>('useServerInviteRows', 'showGuildInviteActionSheet'),
					mod => {
						this.patches.add(after(mod, 'useServerInviteRows', noRows))
					},
					{ max: 1 },
				),
			)
		},
		onStop() {},
	},
})
