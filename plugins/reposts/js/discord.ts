import { getAssetIdByName } from '@valenced/assets'
import {
	ActionSheetActionCreators,
	ToastActionCreators,
} from '@valenced/discord/actions'
import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import {
	getModuleDependencies,
	isModuleInitialized,
} from '@valenced/modules/metro'
import { createElement } from 'react'
import { Image, LayoutAnimation } from 'react-native'
import type { Entry } from '../shared/wire'

const mods = new Map<string, any>()

export function byProps(...props: [string, ...string[]]): any {
	const key = props.join()
	let mod = mods.get(key)
	if (!mod) {
		try {
			;[mod] = lookupModule(withProps<any>(...props))
		} catch {}
		if (mod) mods.set(key, mod)
	}
	return mod
}

export const stores = Stores as any
export const http = () => byProps('HTTP', 'getAPIBaseURL')?.HTTP
export const userActions = () =>
	byProps('getUser', 'fetchProfile', 'fetchCurrentUser')
export const nav = () => byProps('transitionToChannel', 'transitionToMessage')
let profileMod: any
export function profiles(): any {
	if (profileMod) return profileMod
	const ok = (e: any) =>
		typeof e?.default === 'function' &&
		typeof e.getUserProfileActionSheetKey === 'function'
	const hit = byProps(
		'getUserProfileActionSheetKey',
		'showUserProfileActionSheetPostConnection',
	)
	if (ok(hit)) return (profileMod = hit)
	try {
		const host = lookupModule(
			withProps<any>('MarkupText', 'plainMentionRenderer'),
		)[1]
		const sheets = lookupModule(
			withProps<any>('openLazy', 'hideActionSheet'),
		)[1]
		if (host === undefined || sheets === undefined) return
		for (const d of getModuleDependencies(host) ?? []) {
			if (!getModuleDependencies(d)?.includes(sheets)) continue
			try {
				const e = __r(d)
				if (ok(e)) return (profileMod = e)
			} catch {}
		}
	} catch {}
}
export const contextMenus = () =>
	byProps('showContextMenu', 'useContextMenuState', 'hideContextMenu')
export const calendar = () =>
	byProps('calendarFormat', 'dateFormat', 'calendarFormatCompact')
export const usernames = () => byProps('AVERAGE_FONT_WIDTH_RATIO')
export const guildTags = () => byProps('GuildTagBadge', 'BaseGuildTagChiplet')
export const avatars = () => byProps('getUserAvatarURL', 'getDefaultAvatarURL')

export const me = (): string | undefined =>
	stores.UserStore?.getCurrentUser?.()?.id

const tokens = () => (Tokens as any).default ?? Tokens
export const colors = () => tokens().colors
export const useToken = (t: any) => (Design as any).useToken(t)

export function smooth() {
	try {
		LayoutAnimation.configureNext(
			LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'),
		)
	} catch {}
}

export function buzz(
	kind:
		| 'IMPACT_LIGHT'
		| 'IMPACT_MEDIUM'
		| 'NOTIFICATION_ERROR' = 'IMPACT_LIGHT',
) {
	try {
		const h = byProps('triggerHapticFeedback', 'HapticFeedbackTypes')
		const t =
			h?.HapticFeedbackTypes[kind] ?? h?.HapticFeedbackTypes.IMPACT_LIGHT
		if (t !== undefined) h.triggerHapticFeedback(t)
	} catch {}
}

const icons = new Map<string, any>()

export function assetIcon(name: string) {
	let Icon = icons.get(name)
	if (!Icon) {
		Icon = ({ size, color, style }: any) => {
			const Base = byProps('BaseIconImage')?.BaseIconImage
			const source = getAssetIdByName(name)
			if (Base) return createElement(Base, { source, size, color, style })
			const px = typeof size === 'number' ? size : 24
			return createElement(Image, {
				source,
				style: [{ width: px, height: px, tintColor: color }, style],
			})
		}
		icons.set(name, Icon)
	}
	return Icon
}

export function toast(text: string, Icon?: any) {
	try {
		ToastActionCreators.open(`reposts-${Date.now()}`, {
			text,
			icon: Icon,
		} as any)
	} catch {}
}

export function displayName(user: any) {
	return (
		user?.globalName || user?.global_name || user?.username || 'Unknown user'
	)
}

export function avatarUrl(user: any, size = 64): string | undefined {
	try {
		const a = avatars()
		if (user && a?.getUserAvatarURL)
			return a.getUserAvatarURL(user, false, size)
	} catch {}
}

export function defaultAvatar(id: string) {
	try {
		const n = Number((BigInt(id) >> 22n) % 6n)
		return `https://cdn.discordapp.com/embed/avatars/${n}.png`
	} catch {
		return 'https://cdn.discordapp.com/embed/avatars/0.png'
	}
}

export function canJump(entry: Entry, owner: string) {
	return (
		!!stores.ChannelStore?.getChannel?.(entry.c) && (!entry.p || owner === me())
	)
}

export function jump(entry: Entry) {
	try {
		const sheets = ActionSheetActionCreators as any
		if (sheets.hideAllActionSheets) sheets.hideAllActionSheets()
		else sheets.hideActionSheet()
	} catch {}
	try {
		const router = byProps('transitionTo', 'transitionToGuild', 'replaceWith')
		if (typeof router?.transitionTo === 'function')
			router.transitionTo(`/channels/${entry.g ?? '@me'}/${entry.c}/${entry.m}`)
		else nav()?.transitionToMessage(entry.c, entry.m)
	} catch {}
}

export function openProfile(id: string) {
	try {
		profiles()?.default({ userId: id })
	} catch {}
}

let bioMod: any
let bioTried = false

export function bio(): any {
	if (bioMod) return bioMod
	bioMod = byProps('parseBioReact', 'getOrParseBioAST')
	if (bioMod || bioTried) return bioMod
	bioTried = true
	try {
		const id = (...p: [string, ...string[]]) =>
			lookupModule(withProps<any>(...p))[1] as number | undefined
		const need = [
			id('parserFor', 'outputFor'),
			id('MarkupText'),
			id('hydrateUserMention'),
		]
		if (need.some(x => x === undefined)) return
		for (let m = 0; m < 80_000; m++) {
			const deps = isModuleInitialized(m) ? undefined : getModuleDependencies(m)
			if (!deps || deps.length > 16 || !need.every(x => deps.includes(x!)))
				continue
			try {
				__r(m)
			} catch {}
			bioMod = byProps('parseBioReact', 'getOrParseBioAST')
			if (bioMod) break
		}
	} catch {}
	return bioMod
}
