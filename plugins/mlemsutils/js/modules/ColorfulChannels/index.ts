import { AssetsRegistry } from '@valenced/assets'
import { getModules } from '@valenced/modules/finders'
import { withName, withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { afterJSX } from '@valenced/react/jsx-runtime'
import { createElement, Fragment } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import announcementLock from '../../../assets/ColorfulChannels/announcement/lock.png'
import announcementWarning from '../../../assets/ColorfulChannels/announcement/warning.png'
import controller from '../../../assets/ColorfulChannels/controller.png'
import forumLock from '../../../assets/ColorfulChannels/forum/lock.png'
import forumWarning from '../../../assets/ColorfulChannels/forum/warning.png'
import imageLock from '../../../assets/ColorfulChannels/image/lock.png'
import imageWarning from '../../../assets/ColorfulChannels/image/warning.png'
import lock from '../../../assets/ColorfulChannels/lock.png'
import lockBottom from '../../../assets/ColorfulChannels/lockBottom.png'
import stageLock from '../../../assets/ColorfulChannels/stage/lock.png'
import textController from '../../../assets/ColorfulChannels/text/controller.png'
import textLock from '../../../assets/ColorfulChannels/text/lock.png'
import textWarning from '../../../assets/ColorfulChannels/text/warning.png'
import voiceLock from '../../../assets/ColorfulChannels/voice/lock.png'
import voiceWarning from '../../../assets/ColorfulChannels/voice/warning.png'
import warning from '../../../assets/ColorfulChannels/warning.png'
import warningBottom from '../../../assets/ColorfulChannels/warningBottom.png'
import { resolveSemanticColor, semanticColors } from '../../lib/common'
import TextBadge from '../../lib/components/TextBadge'
import { Module, ModuleCategory } from '../../stuff/Module'
import dark from './dark.png'
import light from './light.png'

enum GlyphKind {
	Lock = 'Lock',
	Warning = 'Warning',
	Controller = 'Controller',
}

function getGlyphOverlay(kind: GlyphKind, bottom?: boolean) {
	if (kind === GlyphKind.Lock) return bottom ? lockBottom : lock
	if (kind === GlyphKind.Warning) return bottom ? warningBottom : warning
	return controller
}

const glyphColors = {
	[GlyphKind.Lock]: ['#f0b232', 'STATUS_WARNING'],
	[GlyphKind.Warning]: ['#f23f43', 'STATUS_DANGER'],
	[GlyphKind.Controller]: ['#23a55a', 'STATUS_POSITIVE'],
} as const

const glyphs: {
	name: string
	kind: GlyphKind
	bottom?: boolean
	base: string
}[] = [
	{ name: 'Announcements', kind: GlyphKind.Lock, base: announcementLock },
	{ name: 'Announcements', kind: GlyphKind.Warning, base: announcementWarning },
	{ name: 'Text', kind: GlyphKind.Lock, base: textLock },
	{ name: 'Text', kind: GlyphKind.Warning, base: textWarning },
	{ name: 'Text', kind: GlyphKind.Controller, base: textController },
	{ name: 'Voice', kind: GlyphKind.Lock, base: voiceLock },
	{ name: 'Voice', kind: GlyphKind.Warning, base: voiceWarning },
	{ name: 'Forum', kind: GlyphKind.Lock, base: forumLock },
	{ name: 'Forum', kind: GlyphKind.Warning, base: forumWarning },
	{ name: 'Stage', kind: GlyphKind.Lock, bottom: true, base: stageLock },
	{ name: 'Image', kind: GlyphKind.Lock, bottom: true, base: imageLock },
	{ name: 'Image', kind: GlyphKind.Warning, bottom: true, base: imageWarning },
]

const glyphName = ({ source, IconComponent }: any): string | undefined => {
	if (typeof IconComponent?.name === 'string' && IconComponent.name)
		return IconComponent.name
	const id =
		typeof source?.original === 'number'
			? source.original
			: typeof source === 'number'
				? source
				: undefined
	return id === undefined ? undefined : AssetsRegistry.getAssetByID(id)?.name
}

export default new Module({
	id: 'colorful-channels',
	label: 'Colorful Channels',
	meta: {
		sublabel:
			'Gives channel icons with symbols colors to make them more aesthetically pleasing',
		category: ModuleCategory.Useful,
		icon: 'LockIcon',
		thumbnail: { dark: { uri: dark }, light: { uri: light } },
	},
	settings: {
		nsfwTag: {
			label: 'NSFW tag',
			subLabel: 'Adds a red NSFW tag next to channel names',
			type: 'toggle',
			default: true,
		},
		colorIcons: {
			label: 'Colored icon symbols',
			subLabel: 'Turns locked channel symbols yellow, NSFW channel symbols red',
			type: 'toggle',
			default: true,
		},
		colorIconsFallback: {
			label: 'Fallback colors for colored icon symbols',
			subLabel: 'Uses yellow, red and green colors regardless of theme',
			type: 'toggle',
			default: false,
		},
	},
	handlers: {
		onStart() {
			if (this.storage.options.nsfwTag) {
				this.patches.add(
					getModules(
						withName<any>('ChannelInfo'),
						ChannelInfo => {
							this.patches.add(
								afterJSX(ChannelInfo, (el: any) =>
									el?.props?.channel?.nsfw_
										? createElement(
												Fragment,
												{ key: el.key },
												createElement(
													TextBadge,
													{ variant: 'destructive' },
													'nsfw',
												),
												el,
											)
										: el,
								),
							)
						},
						{ max: 1 },
					),
				)
			}

			if (this.storage.options.colorIcons) {
				this.patches.add(
					getModules(
						withProps<any>('BaseChannelIcon'),
						exports => {
							this.patches.add(
								instead(
									exports,
									'BaseChannelIcon',
									(args: any[], orig: any) => {
										const ret = orig(...args)

										try {
											const name = glyphName(args[0] ?? {})
											const glyph = glyphs.find(
												x => name === `${x.name}${x.kind}Icon`,
											)
											if (!glyph || !ret?.props) return ret

											const color = glyphColors[glyph.kind]
											const overlay = getGlyphOverlay(glyph.kind, glyph.bottom)

											const rawColor = ret.props.color
											const iconColor =
												typeof rawColor === 'string'
													? rawColor.replace(/-/g, '_').toUpperCase()
													: undefined
											const styled = StyleSheet.flatten([
												args[0].style,
												ret.props.style,
												{
													width: 18,
													height: 18,
													tintColor: resolveSemanticColor(
														semanticColors[iconColor as string] ??
															semanticColors.CHANNEL_ICON,
													),
												},
											])

											return createElement(
												View,
												null,
												createElement(Image, {
													style: styled,
													source: { uri: glyph.base },
												}),
												createElement(
													View,
													{
														style: {
															position: 'absolute',
															right: 0,
															bottom: 0,
														},
													},
													createElement(Image, {
														style: {
															...styled,
															tintColor: this.storage.options.colorIconsFallback
																? color[0]
																: resolveSemanticColor(
																		semanticColors[color[1]],
																	),
														},
														source: { uri: overlay },
													}),
												),
											)
										} catch (e: any) {
											console.error(`[${this.label}]`, e?.stack ?? e)
											return ret
										}
									},
								),
							)
						},
						{ max: 1 },
					),
				)
			}
		},
		onStop() {},
	},
})
