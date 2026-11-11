import { AppState, Linking } from 'react-native'
import { WIRE } from '../shared/wire'
import { ApiError, base, call, describe } from './api'
import { CLIENT_ID } from './config'
import { askConsent, offerBrowser } from './connect'
import { pullMine, refreshIndex } from './data'
import { assetIcon, http, me, toast } from './discord'
import { RepostIcon } from './icon'
import { account, bump, live, saveAccount, wipeAccount } from './store'
import { flushSoon, takePending } from './sync'

interface Login {
	v: number
	u: string
	token: string
	exp: number
	me: { r: string; n: number; o: boolean }
}

const randomState = () =>
	Array.from(
		{ length: 40 },
		() =>
			'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)],
	).join('')

const redirect = () => `${base()}/v1/auth/callback`

function finish(login: Login) {
	if (login.u !== me()) throw new Error('account')
	saveAccount({ token: login.token, exp: login.exp, optout: login.me.o })
	toast('Connected to Reposts', RepostIcon)
	refreshIndex(true)
	pullMine(true).then(() => {
		flushSoon()
		takePending()?.()
	})
}

export async function connect() {
	if (live.connecting || !me()) return
	live.connecting = true
	bump()
	const state = randomState()
	try {
		const h = http()
		if (!h) throw new Error('http')
		const query = {
			client_id: CLIENT_ID,
			response_type: 'code',
			redirect_uri: redirect(),
			scope: 'identify',
			state,
		}
		const info = (await h.get({ url: '/oauth2/authorize', query })).body as any
		if (!info?.authorized && !(await askConsent(info?.application))) return
		const r = (
			await h.post({
				url: '/oauth2/authorize',
				query,
				body: { permissions: '0', authorize: true },
			})
		).body as any
		const loc = String(r?.location ?? '')
		const code = loc.match(/[?&]code=([^&]+)/)?.[1]
		if (!code || loc.match(/[?&]state=([^&]+)/)?.[1] !== state)
			throw new Error('code')
		const s = await call<Login>('/v1/auth', {
			method: 'POST',
			auth: false,
			body: { code: decodeURIComponent(code) },
		})
		finish(s.body!)
	} catch (e: any) {
		if (e?.message === 'account')
			toast('Switched accounts while connecting. Try again.')
		else if (
			await offerBrowser(
				e instanceof ApiError
					? describe(e)
					: "Discord didn't accept the login request.",
			)
		)
			browserLogin(state)
	} finally {
		live.connecting = false
		bump()
	}
}

let polling: (() => void) | undefined

function browserLogin(state: string) {
	polling?.()
	const until = Date.now() + 5 * 60_000
	let busy = false
	const poll = async () => {
		if (busy || Date.now() > until) return
		busy = true
		try {
			for (let i = 0; i < 4; i++) {
				const r = await call<Login & { pending?: boolean }>('/v1/auth/poll', {
					method: 'POST',
					auth: false,
					body: { state },
				})
				if (r.body && !r.body.pending) {
					stop()
					finish(r.body)
					return
				}
				await new Promise(res => setTimeout(res, 1500))
			}
		} catch {
		} finally {
			busy = false
		}
	}
	const sub = AppState.addEventListener('change', s => {
		if (s === 'active') poll()
	})
	const stop = () => {
		sub.remove()
		polling = undefined
	}
	polling = stop
	Linking.openURL(`${base()}/v1/auth/start?state=${state}`).catch(stop)
}

export async function logout() {
	try {
		await call('/v1/logout', { method: 'POST', body: {} })
	} catch {}
	wipeAccount()
	toast('Logged out of Reposts', assetIcon('DoorExitIcon'))
}

export async function deleteEverything() {
	try {
		await call('/v1/me', { method: 'DELETE' })
	} catch (e) {
		toast(describe(e), assetIcon('CircleErrorIcon'))
		return false
	}
	wipeAccount()
	toast('Deleted all your reposts', assetIcon('TrashIcon'))
	return true
}

export async function setOptOut(o: boolean) {
	const before = account().optout
	saveAccount({ optout: o })
	try {
		await call('/v1/me', { method: 'PUT', body: { o } })
		refreshIndex(true)
	} catch (e) {
		saveAccount({ optout: before })
		toast(describe(e), assetIcon('CircleErrorIcon'))
	}
}

export async function refreshSession() {
	try {
		const r = await call<{
			v: number
			o: boolean
			token?: string
			exp?: number
		}>('/v1/me')
		const b = r.body!
		saveAccount({
			optout: b.o,
			...(b.token ? { token: b.token, exp: b.exp } : {}),
		})
		if (b.v > WIRE) live.outdated = true
	} catch {}
}
