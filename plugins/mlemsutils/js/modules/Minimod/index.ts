import { Stores } from '@valenced/discord/flux'
import { before } from '@valenced/patcher'
import { NativeModules, TurboModuleRegistry } from 'react-native'
import NerdEmoji from '../../../assets/MiniMod/NerdEmoji.png'
import { Module, ModuleCategory } from '../../stuff/Module'
import dark from './dark.png'
import light from './light.png'

function markTimeouts(args: any[]) {
	const timedOut = (
		Stores as any
	).GuildMemberStore.getCommunicationDisabledUserMap()
	if (!Object.keys(timedOut).length) return

	const rows = JSON.parse(args[1])
	if (!Array.isArray(rows)) return

	const now = Date.now()
	let changed = false
	for (const row of rows) {
		if (row?.type !== 1 || !row.message) continue

		const date = new Date(
			timedOut[`${row.message.guildId}-${row.message.authorId}`],
		)
		if (date.getTime() > now) {
			row.message.communicationDisabled = true
			changed = true
		}
	}

	if (changed) args[1] = JSON.stringify(rows)
}

export default new Module({
	id: 'minimod',
	label: 'Minimod',
	meta: {
		sublabel:
			"Lets you see some moderator-only things. Inspired by the 'ShowHiddenThings' Vencord plugin",
		category: ModuleCategory.Fun,
		icon: { uri: NerdEmoji },
		thumbnail: { dark: { uri: dark }, light: { uri: light } },
	},
	settings: {
		showTimeouts: {
			label: 'Show timeouts',
			subLabel: 'Show member timeout icons in chat',
			type: 'toggle',
			default: true,
		},
	},
	handlers: {
		onStart() {
			if (this.storage.options.showTimeouts) {
				const ChatModule =
					TurboModuleRegistry.get<any>('NativeChatModule') ??
					NativeModules.DCDChatManager
				if (!ChatModule?.updateRows)
					throw new Error('NativeChatModule not found')

				this.patches.add(
					before(ChatModule, 'updateRows', (args: any[]) => {
						try {
							markTimeouts(args)
						} catch (e: any) {
							console.error(`[${this.label}]`, e?.stack ?? e)
						}
						return args
					}),
				)
			}
		},
		onStop() {},
	},
})
