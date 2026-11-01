import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withDependencies, withProps } from '@valenced/modules/finders/filters'
import { useEffect, useMemo, useReducer, useState } from 'react'
import { fluxSubscribe, showToast } from '../../../lib/common'

const stores = Stores as any

interface Activity {
	party?: { id?: `${string}:${string}` }
}
export interface ListenButtonProps {
	button: any
	activity: { party: { id: `${string}:${string}` } }
}

let actions: any
let pending: (() => void) | undefined

export function cancelPending() {
	pending?.()
	pending = undefined
}

function getActions() {
	if (actions) return actions

	const { unordered } = withDependencies
	const [, store] = lookupModule(withProps('getActiveSocketAndDevice'))
	const [, protocol] = lookupModule(withProps('isProtocolRegistered'))
	if (store === undefined || protocol === undefined) return

	const [, utils] = lookupModule(
		withDependencies(unordered([store, protocol])).and(
			withProps('ensureSpotifyPlayable'),
		),
	)
	if (utils === undefined) return

	;[actions] = lookupModule(
		withDependencies(unordered([utils])).and(withProps('play', 'sync')),
	)
	return actions
}

export function doSync(
	disabled: string | false,
	activity: Activity,
	userId: string,
) {
	if (typeof disabled === 'string') return showToast(disabled)

	const spotify = getActions()
	if (!spotify) return showToast('Spotify is not detected')

	if (stores.SpotifyStore?.getActivity?.()) {
		return spotify.sync(activity, userId)
	}

	cancelPending()
	pending = fluxSubscribe(
		'SPOTIFY_PLAYER_STATE',
		() => {
			pending = undefined
			spotify.sync(activity, userId)
		},
		true,
	)
	spotify.play(activity, userId)
}

export function useListenButton(activity: ListenButtonProps['activity']): {
	disabled: false | string
	userId: string
} {
	const [val, forceUpdate] = useReducer(x => ~x, 0)
	useEffect(() => fluxSubscribe('SPOTIFY_PLAYER_STATE', forceUpdate))

	const userId = activity.party.id.split(':')[1]!
	const logic = useMemo(() => {
		const selfUserId = stores.UserStore?.getCurrentUser?.()?.id
		const selfActivity: Activity | undefined =
			stores.SpotifyStore?.getActivity?.()
		const selfPartyId = selfActivity?.party?.id
		const hasConnectedAccount = stores.SpotifyStore?.hasConnectedAccount?.()
		const canPlaySpotify =
			!!stores.SpotifyStore?.getActiveSocketAndDevice?.() ||
			stores.SpotifyProtocolStore?.isProtocolRegistered?.()

		return {
			isYou: selfUserId === userId,
			isListeningAlong: !!selfPartyId && selfPartyId === activity.party.id,
			isPlayable: !!hasConnectedAccount && !!canPlaySpotify,
		}
	}, [userId, activity, val])

	let disabled: false | string = false
	if (logic.isYou) disabled = 'Listen along with someone else, not yourself.'
	else if (logic.isListeningAlong) {
		disabled = "You're already along for this ride."
	} else if (!logic.isPlayable) disabled = 'Spotify is not detected'

	return { disabled, userId }
}

export function useLoading() {
	const [loading, setLoading] = useState(false)

	return {
		loading,
		trigger: () => (
			setLoading(true), setTimeout(() => setLoading(false), 5_000)
		),
	}
}
