import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { callNativeMethod } from '@valenced/modules/native'
import { before, instead } from '@valenced/patcher'

const call = callNativeMethod as (name: string, args: unknown[]) => Promise<any>
const D = () => Dispatcher as any

const LEVEL = 0.38

let soundUrl = (id: string) => `https://cdn.discordapp.com/soundboard-sounds/${id}`

let ready = false
let canUse: ((user: any, sound: any, channel: any, available?: boolean) => boolean) | undefined
const fetched = new Set<string>()

let held = 0
let wanted = false
let unforce: (() => void) | undefined

function connections(fn: (c: any) => void) {
	const engine = (Stores.MediaEngineStore as any)?.getMediaEngine?.()
	engine?.eachConnection?.((c: any) => {
		if (c?.context === 'default' && typeof c.setForceAudioInput === 'function') fn(c)
	})
}

function watchForce() {
	if (unforce) return
	connections(c => {
		if (unforce) return
		const proto = Object.getPrototypeOf(c)
		if (typeof proto?.setForceAudioInput === 'function')
			unforce = before(proto, 'setForceAudioInput', (args: any[]) => {
				wanted = !!args[0]
				if (held > 0) args[0] = true
				return args
			})
	})
}

function hold(ms: number) {
	watchForce()
	held++
	connections(c => c.setForceAudioInput(wanted))
	setTimeout(() => {
		held = Math.max(0, held - 1)
		if (!held) connections(c => c.setForceAudioInput(wanted))
	}, ms + 300)
}

function me() {
	return (Stores.UserStore as any)?.getCurrentUser?.()?.id as string | undefined
}

function allowed(sound: any, channelId: string) {
	try {
		const user = (Stores.UserStore as any).getCurrentUser()
		const channel = (Stores.ChannelStore as any).getChannel(channelId)
		return canUse ? canUse(user, sound, channel, true) : true
	} catch {
		return true
	}
}

function prefetch(sound: any) {
	const id = String(sound?.soundId ?? '')
	if (!id || fetched.has(id)) return
	fetched.add(id)
	call('mlemsbmic.prefetch', [id, soundUrl(id)]).catch(() => fetched.delete(id))
}

async function viaMic(channelId: string, sound: any, logger: any) {
	const id = String(sound.soundId)
	const ms = await call('mlemsbmic.play', [id, soundUrl(id), (sound.volume ?? 1) * LEVEL]).catch(() => -1)
	if (typeof ms !== 'number' || ms < 0) {
		logger.warn(`soundboard mic: couldn't play ${id}`)
		return
	}
	hold(ms)
	D().dispatch({
		type: 'VOICE_CHANNEL_EFFECT_SEND',
		emoji: sound.emojiId || sound.emojiName ? { id: sound.emojiId ?? null, name: sound.emojiName ?? null, animated: false } : null,
		channelId,
		userId: me(),
		animationType: 1,
		animationId: 0,
		soundId: /^\d{1,5}$/.test(id) ? Number(id) : id,
		soundVolume: sound.volume ?? 1,
		isEcho: false,
		...(sound.guildId && sound.guildId !== '0' ? { sourceGuildId: sound.guildId } : {}),
	})
}

export default plugin({
	start({ cleanup, logger }) {
		call('mlemsbmic.state', [])
			.then(() => {
				ready = true
			})
			.catch(e => logger.warn('soundboard mic: native part missing, sounds stay locked', e))

		const stopAll = () => {
			call('mlemsbmic.stopAll', []).catch(() => {})
		}
		const stops = ['AUDIO_TOGGLE_SELF_DEAF', 'AUDIO_TOGGLE_SELF_MUTE', 'VOICE_CHANNEL_SELECT']
		for (const t of stops) D().subscribe(t, stopAll)
		D().subscribe('RTC_CONNECTION_STATE', watchForce)
		cleanup(() => {
			for (const t of stops) D().unsubscribe(t, stopAll)
			D().unsubscribe('RTC_CONNECTION_STATE', watchForce)
		})
		watchForce()

		cleanup(
			getModules(
				withProps<any>('canUseSoundboardSound', 'canMakeSound'),
				mod => {
					canUse = mod.canUseSoundboardSound
					cleanup(
						instead(mod, 'canUseSoundboardSound', (args: any[], real: any) => {
							if (real(...args)) return true
							if (!ready) return false
							prefetch(args[1])
							return true
						}),
					)
				},
				{ max: 1 },
			),
			getModules(
				withProps<any>('isSoundboardSectionNitroLocked'),
				mod => {
					cleanup(instead(mod, 'isSoundboardSectionNitroLocked', (args: any[], real: any) => (ready ? false : real(...args))))
				},
				{ max: 1 },
			),
			getModules(
				withProps<any>('getSoundboardSoundURL'),
				mod => {
					const real = mod.getSoundboardSoundURL
					soundUrl = (id: string) => {
						try {
							return real(id) || `https://cdn.discordapp.com/soundboard-sounds/${id}`
						} catch {
							return `https://cdn.discordapp.com/soundboard-sounds/${id}`
						}
					}
				},
				{ max: 1 },
			),
			getModules(
				withProps<any>('sendVoiceChannelSoundboardEffect', 'sendVoiceChannelSoundboardEcho'),
				mod => {
					cleanup(
						instead(mod, 'sendVoiceChannelSoundboardEffect', (args: any[], real: any) => {
							const [channelId, sound] = args
							if (!ready || !sound || allowed(sound, channelId)) return real(...args)
							viaMic(channelId, sound, logger).catch(e => logger.error('soundboard mic: play failed', e))
							return Promise.resolve()
						}),
					)
				},
				{ max: 1 },
			),
			() => {
				call('mlemsbmic.stopAll', []).catch(() => {})
				held = 0
				if (unforce) {
					connections(c => c.setForceAudioInput(wanted))
					unforce()
					unforce = undefined
				}
				ready = false
				canUse = undefined
				fetched.clear()
			},
		)
	},
})
