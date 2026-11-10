import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores } from '@valenced/discord/flux'
import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { after } from '@valenced/patcher'
import { Settings } from './settings'

export interface Options {
	hideJoins: boolean
	hideWaves: boolean
	showCount: boolean
}

export const defaults: Options = {
	hideJoins: true,
	hideWaves: false,
	showCount: true,
}

const USER_JOIN = 7
const REPLY = 19

function isJoin(m: any) {
	return m?.type === USER_JOIN
}

function isWave(m: any) {
	if (m?.type !== REPLY || m.content || !m.stickerItems?.length) return false
	const ref = m.messageReference
	if (!ref?.message_id) return false
	const S = Stores as any
	const target =
		S.MessageStore?.getMessage(ref.channel_id, ref.message_id) ??
		S.ReferencedMessageStore?.getMessageByReference(ref)?.message
	return isJoin(target)
}

function hiddenRow(run: any[]) {
	const last = run[run.length - 1]
	const n = run.length
	return {
		roleStyle: last.roleStyle,
		message: last.message,
		isFirst: true,
		content: [],
		text: `${n} welcome sticker${n === 1 ? '' : 's'} hidden`,
		revealed: false,
		rowType: 2,
		changeType: run[0].changeType ?? 0,
		context: last.message.id,
	}
}

function filter(items: any[], s: Options) {
	if (!Array.isArray(items) || (!s.hideJoins && !s.hideWaves)) return items

	const out: any[] = []
	let run: any[] = []
	let changed = false
	const flush = () => {
		if (run.length && s.showCount) out.push(hiddenRow(run))
		run = []
	}

	for (const it of items) {
		const m = it?.rowType === 1 ? it.message : null
		if (m && s.hideJoins && isJoin(m)) {
			changed = true
			continue
		}
		if (m && s.hideWaves && isWave(m)) {
			changed = true
			run.push(it)
			continue
		}
		flush()
		out.push(it)
	}
	flush()
	if (!changed) return items

	return out.filter(
		(it, i) => it?.rowType !== 'day' || typeof out[i - 1]?.rowType === 'number',
	)
}

function refresh() {
	const S = Stores as any
	const ch = S.SelectedChannelStore?.getChannelId()
	const last = ch && S.MessageStore?.getMessages(ch)?.last()
	if (last)
		(Dispatcher as any).dispatch({
			type: 'MESSAGE_UPDATE',
			message: { id: last.id, channel_id: ch },
		})
}

export default plugin<{ jsonStorage: Options }>({
	jsonStorage: { default: defaults },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage }) {
		let s = defaults

		cleanup(
			jsonStorage.subscribe(() => {
				const old = s
				s = { ...defaults, ...jsonStorage.cache }
				if (
					old.hideJoins !== s.hideJoins ||
					old.hideWaves !== s.hideWaves ||
					old.showCount !== s.showCount
				)
					refresh()
			}),
			getModuleWithImportedPath<any>(
				'modules/messages/native/createChannelStream.tsx',
				mod => {
					cleanup(
						after(mod, 'default', (items: any) => {
							try {
								return filter(items, s)
							} catch {
								return items
							}
						}),
					)
				},
			),
		)

		jsonStorage.get().then(v => {
			s = { ...defaults, ...v }
		})
	},
})
