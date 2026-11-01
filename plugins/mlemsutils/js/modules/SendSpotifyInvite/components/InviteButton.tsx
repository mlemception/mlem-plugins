import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { useEffect, useReducer } from 'react'
import { byProps, fluxSubscribe, icon } from '../../../lib/common'

const stores = Stores as any

const sendInvite = () => {
	const activity = stores.SpotifyStore?.getActivity?.()
	if (!activity?.party?.id) return

	const sendMessage = byProps('sendMessage', 'revealMessage')?.sendMessage
	const clearDraft = byProps('clearDraft')?.clearDraft
	if (!sendMessage || !clearDraft) return

	const channel = stores.SelectedChannelStore.getChannelId()
	sendMessage(
		channel,
		{
			content: stores.DraftStore.getDraft(channel, 0),
			tts: false,
			invalidEmojis: [],
			validNonShortcutEmojis: [],
		},
		true,
		{
			activityAction: {
				activity,
				type: 3,
			},
		},
	)

	clearDraft(channel, 0)
}

export default function InviteButton() {
	const [, forceUpdate] = useReducer(x => ~x, 0)
	useEffect(() => fluxSubscribe('SPOTIFY_PLAYER_STATE', forceUpdate))

	const { IconButton } = Design as any

	return (
		<IconButton
			variant="secondary"
			size="md"
			icon={icon('ic_spotify_white_16px')}
			disabled={!stores.SpotifyStore?.getActivity?.()?.party?.id}
			onPress={sendInvite}
		/>
	)
}
