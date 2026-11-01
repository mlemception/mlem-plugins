import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { createElement } from 'react'
import { Module, ModuleCategory } from '../../stuff/Module'
import ClassicListenButton from './components/ClassicListenButton'
import { cancelPending } from './components/core'
import SimplifiedListenButton from './components/SimplifiedListenButton'
import dark from './dark.png'
import light from './light.png'
import type { ComponentType } from 'react'

const wrap =
	(Component: ComponentType<any>) =>
	(args: any[], orig: (...x: any[]) => any) => {
		const button = orig(...args)
		const activity = args[0]?.activity

		return activity?.party?.id
			? createElement(Component, { button, activity })
			: button
	}

export default new Module({
	id: 'spotify-listen-along',
	label: 'Add Listen Along',
	meta: {
		sublabel:
			'Adds the Spotify listen along button from desktop to Spotify activities on mobile',
		category: ModuleCategory.Useful,
		icon: 'MusicIcon',
		thumbnail: { dark: { uri: dark }, light: { uri: light } },
		extra: {
			credits: ['1001086404203389018'],
		},
	},
	handlers: {
		onStart() {
			this.patches.add(
				getModules(
					withProps<any>('SpotifyPlayButton'),
					mod => {
						this.patches.add(
							instead(mod, 'SpotifyPlayButton', wrap(ClassicListenButton)),
						)
					},
					{ max: 1 },
				),
			)
			this.patches.add(
				getModules(
					withProps<any>('PlayOnSpotifyButton'),
					mod => {
						this.patches.add(
							instead(mod, 'PlayOnSpotifyButton', wrap(SimplifiedListenButton)),
						)
					},
					{ max: 1 },
				),
			)
		},
		onStop() {
			cancelPending()
		},
	},
})
