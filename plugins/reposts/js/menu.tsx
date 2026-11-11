import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { createElement, Fragment } from 'react'
import { call, describe } from './api'
import { confirm } from './connect'
import {
	assetIcon,
	canJump,
	jump,
	me,
	openProfile,
	smooth,
	toast,
} from './discord'
import { RepostIcon } from './icon'
import { cache, save, saved, touchCache } from './store'
import { hideAuthor, unrepost } from './sync'
import type { Entry } from '../shared/wire'

const REASONS: [string, string][] = [
	['spam', 'Spam'],
	['fake', 'Fake or edited quote'],
	['private', "Shouldn't have been shared"],
	['harassment', 'Harassment'],
]

export interface Item {
	label: string
	IconComponent: any
	action: () => void
	variant?: 'destructive'
}

function hideLocally(owner: string, m: string) {
	smooth()
	const k = `${owner}:${m}`
	if (!saved.hidden.includes(k))
		save({ hidden: [...saved.hidden, k].slice(-500) })
}

async function report(entry: Entry, owner: string, why: string) {
	hideLocally(owner, entry.m)
	try {
		await call('/v1/report', {
			method: 'POST',
			body: { u: owner, m: entry.m, why },
		})
		toast('Reported and hidden for you', assetIcon('FlagIcon'))
	} catch (e) {
		toast(describe(e), assetIcon('CircleErrorIcon'))
	}
}

function askReason(entry: Entry, owner: string) {
	const { AlertModal, AlertActionButton } = Design as any
	AlertActionCreators.openAlert(
		'reposts-report',
		createElement(AlertModal, {
			title: 'Report this repost?',
			content:
				"It's hidden for you right away. If a few people report it, it's hidden for everyone.",
			actions: createElement(
				Fragment,
				null,
				...REASONS.map(([id, label]) =>
					createElement(AlertActionButton, {
						key: id,
						text: label,
						variant: 'secondary',
						onPress: () => report(entry, owner, id),
					}),
				),
				createElement(AlertActionButton, {
					key: 'x',
					text: 'Cancel',
					variant: 'tertiary',
				}),
			),
		}),
	)
}

async function takeDown(entry: Entry, owner: string) {
	try {
		await call('/v1/remove', { method: 'POST', body: { u: owner, m: entry.m } })
		const l = cache.lists[owner]
		if (l) {
			smooth()
			l.body.l = l.body.l.filter(e => e.m !== entry.m)
			l.body.n = l.body.l.length
			touchCache()
		}
		toast('Removed from their profile', assetIcon('TrashIcon'))
	} catch (e) {
		toast(describe(e), assetIcon('CircleErrorIcon'))
	}
}

export function menuItems(entry: Entry, owner: string): Item[] {
	const mine = owner === me()
	const items: Item[] = []
	if (entry.t)
		items.push({
			label: 'Copy Text',
			IconComponent: assetIcon('CopyIcon'),
			action: () => {
				Clipboard.setString(entry.t!)
				toast('Copied to clipboard', assetIcon('CopyIcon'))
			},
		})
	if (canJump(entry, owner))
		items.push({
			label: 'Jump to Message',
			IconComponent: assetIcon('ChatArrowRightIcon'),
			action: () => jump(entry),
		})
	if (entry.a && !entry.p)
		items.push({
			label: 'View Author',
			IconComponent: assetIcon('UserCircleIcon'),
			action: () => openProfile(entry.a!),
		})

	if (mine) {
		if (!entry.p)
			items.push({
				label: 'Hide Author',
				IconComponent: assetIcon('EyeSlashIcon'),
				action: () =>
					confirm(
						'Hide who wrote this?',
						"Their name is removed from this repost for good, on the server too. You can't undo this.",
						'Hide author',
						() => hideAuthor(entry.m),
					),
			})
		items.push({
			label: 'Remove Repost',
			IconComponent: RepostIcon,
			action: () => unrepost(entry.m),
			variant: 'destructive',
		})
		return items
	}

	items.push({
		label: 'Hide Repost',
		IconComponent: assetIcon('EyeSlashIcon'),
		action: () => {
			hideLocally(owner, entry.m)
			toast('Hidden. Only you see this change.', assetIcon('EyeSlashIcon'))
		},
	})
	if (entry.a && entry.a === me())
		items.push({
			label: 'Remove From Their Profile',
			IconComponent: assetIcon('TrashIcon'),
			variant: 'destructive',
			action: () =>
				confirm(
					'Take your message down?',
					"You wrote this, so you can remove it from their profile. They won't be told.",
					'Remove',
					() => takeDown(entry, owner),
				),
		})
	items.push({
		label: 'Report Repost',
		IconComponent: assetIcon('FlagIcon'),
		variant: 'destructive',
		action: () => askReason(entry, owner),
	})
	return items
}
