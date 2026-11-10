import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores } from '@valenced/discord/flux'
import { AppState } from 'react-native'
import { DAILY_CAP, HEARTBEAT_MS, MAX_GAP, newCredit, report } from './credit'
import { activityImage, fetchIcon } from './games'
import { bump, data, remember, save } from './store'
import type { Credit, Game, Stored } from './store'

const SOCKET = 'mlem-game-session'
const PID = 31337

let cur: Stored | null = null
let endTimer: any
let beatTimer: any
let gen = 0

export const status: { sent?: number; error?: string; capped?: boolean } = {}

export const current = () => cur

const D = () => Dispatcher as any

function activity(s: Stored) {
	const o = data()
	const timestamps: Record<string, number> = { start: s.start }
	if (o.showEnd && s.endsAt) timestamps.end = s.endsAt
	const a: Record<string, any> = {
		name: s.game.name,
		type: 0,
		application_id: s.game.id,
		timestamps,
		flags: 0,
	}
	if (o.art && s.image)
		a.assets = { large_image: s.image, large_text: s.game.name }
	return a
}

export function publish() {
	D().dispatch({
		type: 'LOCAL_ACTIVITY_UPDATE',
		socketId: SOCKET,
		pid: PID,
		activity: cur ? activity(cur) : null,
	})
	ensureImage()
}

function persist() {
	save({
		session: cur && {
			game: { ...cur.game },
			start: cur.start,
			endsAt: cur.endsAt,
			credit: cur.credit && { ...cur.credit },
			image: cur.image,
		},
	})
}

const limit = (s: Stored, at = Date.now()) =>
	s.endsAt ? Math.min(at, s.endsAt) : at

const today = () => new Date().toDateString()

export const usedToday = () => {
	const d = data()
	return d.creditDay === today() ? d.creditToday : 0
}

function credited(ms: number) {
	if (ms > 0)
		save({
			creditedMs: data().creditedMs + ms,
			creditDay: today(),
			creditToday: usedToday() + ms,
		})
	status.sent = Date.now()
	status.error = undefined
	bump()
}

function failed(e: any) {
	status.error =
		e?.message === 'blocked'
			? 'No Track blocked it'
			: (e?.body?.message ?? e?.message ?? 'Could not reach Discord')
	bump()
}

function finish(s: Stored, until = limit(s)) {
	const c = s.credit
	if (!c || c.finished) return Promise.resolve()
	const room = Math.max(0, DAILY_CAP - usedToday())
	const end = Math.min(until, c.creditedUntil + Math.min(room, MAX_GAP))
	return report(s.game, c, end, true).then(credited, failed)
}

export function syncCredit() {
	const s = cur
	if (!s) return
	const room = DAILY_CAP - usedToday()
	const was = status.capped
	status.capped = data().credit && room <= 0
	if (was !== status.capped) bump()
	if (!data().credit || room <= 0) {
		if (s.credit && !s.credit.finished)
			finish(s).then(() => cur === s && persist())
		return
	}
	const now = limit(s)
	if (
		s.credit &&
		!s.credit.finished &&
		now - s.credit.creditedUntil > MAX_GAP
	) {
		finish(s, s.credit.creditedUntil)
		s.credit = undefined
	}
	if (!s.credit || s.credit.finished) s.credit = newCredit(now)
	report(s.game, s.credit, Math.min(now, s.credit.creditedUntil + room))
		.then(credited, failed)
		.then(() => cur === s && persist())
}

function schedule() {
	clearTimeout(endTimer)
	endTimer = undefined
	if (!cur?.endsAt) return
	const at = cur.endsAt
	endTimer = setTimeout(() => advance(at), Math.max(0, at - Date.now()))
}

function begin(
	g: Game,
	start: number,
	endsAt: number,
	credit?: Credit,
	image?: string,
) {
	const prev = cur
	if (prev) finish(prev)
	gen++
	cur = {
		game: { id: g.id, name: g.name, exe: g.exe, icon: g.icon ?? null },
		start,
		endsAt,
		credit,
		image,
	}
	remember(cur.game)
	persist()
	publish()
	schedule()
	syncCredit()
}

let imaging = false

function ensureImage() {
	const s = cur
	if (!s || s.image || imaging || !data().art) return
	imaging = true
	const my = gen
	;(async () => {
		try {
			if (!s.game.icon) s.game.icon = await fetchIcon(s.game.id)
			const img = await activityImage(s.game.id, s.game.icon)
			if (my !== gen || cur !== s || !img) return
			s.image = img
			persist()
			publish()
		} finally {
			imaging = false
		}
	})()
}

export function play(g: Game, minutes: number, playedFor = 0) {
	const now = Date.now()
	begin(g, now - playedFor * 60_000, minutes ? now + minutes * 60_000 : 0)
}

export function stopSession() {
	gen++
	clearTimeout(endTimer)
	endTimer = undefined
	const s = cur
	cur = null
	persist()
	publish()
	if (s) finish(s)
	bump()
}

export function stopAll() {
	save({ queue: [] })
	stopSession()
}

export function advance(from: number) {
	const prev = cur
	if (prev) {
		finish(prev, Math.min(from, limit(prev)))
		cur = null
	}
	let at = from
	let queue = [...data().queue]
	while (queue.length) {
		const [next, ...rest] = queue
		queue = rest
		const endsAt = next.minutes ? at + next.minutes * 60_000 : 0
		if (!endsAt || endsAt > Date.now()) {
			save({ queue })
			begin(next, at, endsAt)
			return next
		}
		at = endsAt
	}
	save({ queue: [] })
	stopSession()
}

export const skip = () => advance(Date.now())

export function extend(minutes: number) {
	if (!cur) return
	if (!cur.endsAt) return
	cur.endsAt = Math.max(cur.endsAt, Date.now()) + minutes * 60_000
	persist()
	publish()
	schedule()
	bump()
}

export function setForever() {
	if (!cur) return
	cur.endsAt = 0
	persist()
	publish()
	schedule()
	bump()
}

export function startQueue() {
	if (cur || !data().queue.length) return
	return advance(Date.now())
}

export function tick() {
	if (cur?.endsAt && Date.now() >= cur.endsAt) advance(cur.endsAt)
}

export function shown() {
	const S = Stores as any
	const id = cur?.game.id
	if (!id) return 'off'
	try {
		const P = S.SelfPresenceStore
		if (P.getStatus?.() === 'invisible') return 'invisible'
		if (P.getActivities().some((a: any) => a.application_id === id))
			return 'shown'
		if (P.getHiddenActivities?.()?.some?.((a: any) => a.application_id === id))
			return 'hidden'
		const local = S.LocalActivityStore?.getActivities?.() ?? []
		if (local.some((a: any) => a.application_id === id)) return 'waiting'
	} catch {}
	return 'missing'
}

export function init() {
	if (data().credit && !data().creditAck) save({ credit: false })
	const s = data().session
	if (s?.game?.id) {
		const restored: Stored = {
			game: s.game,
			start: s.start,
			endsAt: s.endsAt,
			credit: s.credit && { ...s.credit },
			image: s.image,
		}
		if (restored.endsAt && restored.endsAt <= Date.now()) {
			cur = restored
			advance(restored.endsAt)
		} else
			begin(
				restored.game,
				restored.start,
				restored.endsAt,
				restored.credit,
				restored.image,
			)
	}

	beatTimer = setInterval(syncCredit, HEARTBEAT_MS)

	const app = AppState.addEventListener('change', st => {
		if (st === 'active') {
			tick()
			publish()
		}
		syncCredit()
	})

	const reopen = () => setTimeout(() => cur && publish(), 500)
	const out = () => {
		clearTimeout(endTimer)
		const s = cur
		cur = null
		gen++
		if (s) finish(s, limit(s)).then(() => persist())
	}
	D().subscribe('CONNECTION_OPEN', reopen)
	D().subscribe('LOGOUT', out)

	return () => {
		clearInterval(beatTimer)
		clearTimeout(endTimer)
		app.remove()
		D().unsubscribe('CONNECTION_OPEN', reopen)
		D().unsubscribe('LOGOUT', out)
		stopSession()
	}
}
