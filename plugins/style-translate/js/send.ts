import { Stores } from '@valenced/discord/flux'
import { chatInput, draftOf, putText, toast } from './common'
import { message, restyle } from './engine'
import { activeFor, dropJob, jobFor, options, putJob } from './store'
import type { Style } from './styles'

const passThrough = new WeakSet<object>()
const reviewed = new Map<string, string>()

const limit = () => {
	try {
		return (Stores as any).UserStore.getCurrentUser()?.premiumType === 2
			? 4000
			: 2000
	} catch {
		return 2000
	}
}

function decorate(out: string, original: string) {
	const o = options().original
	if (o === 'off' || out.trim() === original.trim()) return out
	const extra =
		o === 'small'
			? `\n-# ${original.replace(/\n+/g, ' ')}`
			: `\n||${original.replace(/\|\|/g, '| |')}||`
	return out.length + extra.length > limit() ? out : out + extra
}

const skip = (text: string) =>
	!text.trim() || /^[/!.?$%]\w/.test(text.trim()) || !/[\p{L}\p{N}]/u.test(text)

export function markReviewed(channelId: string, text: string) {
	reviewed.set(channelId, text)
}

export function stage(
	channelId: string,
	style: Style,
	original: string,
	text: string,
) {
	putJob({ channelId, style, phase: 'review', original })
	markReviewed(channelId, text)
	putText(channelId, text)
}

export function onSend(args: any[], real: (...a: any[]) => any) {
	const [channelId, msg] = args
	if (!msg || passThrough.has(msg) || typeof msg.content !== 'string')
		return real(...args)
	const r = reviewed.get(channelId)
	if (r !== undefined) {
		reviewed.delete(channelId)
		return real(...args)
	}
	const style = activeFor(channelId)
	if (!style || skip(msg.content)) return real(...args)
	return run(channelId, style, args, real)
}

function run(
	channelId: string,
	style: Style,
	args: any[],
	real: (...a: any[]) => any,
) {
	const original: string = args[1].content
	const abort = new AbortController()
	const job = putJob({
		channelId,
		style,
		phase: 'work',
		original,
		args,
		real,
		abort,
	})
	return restyle(style, original, abort.signal).then(
		out => {
			if (jobFor(channelId)?.id !== job.id) return
			const text = decorate(out, original)
			if (text.length > limit()) {
				putJob({
					...job,
					phase: 'fail',
					error: `Too long after restyling (${text.length}/${limit()})`,
				})
				return
			}
			if (options().send === 'review') {
				dropJob(channelId, job.id)
				stage(channelId, style, original, text)
				return
			}
			dropJob(channelId, job.id)
			return fire(args, real, text)
		},
		e => {
			if (jobFor(channelId)?.id !== job.id) return
			putJob({ ...job, phase: 'fail', error: message(e), abort: undefined })
		},
	)
}

function fire(args: any[], real: (...a: any[]) => any, content?: string) {
	const msg = content === undefined ? args[1] : { ...args[1], content }
	passThrough.add(msg)
	return real(args[0], msg, ...args.slice(2))
}

export function retry(channelId: string) {
	const j = jobFor(channelId)
	if (!j?.args || !j.real) return
	dropJob(channelId, j.id)
	run(channelId, j.style, j.args, j.real)
}

export function sendAsIs(channelId: string) {
	const j = jobFor(channelId)
	if (!j?.args || !j.real) return
	dropJob(channelId, j.id)
	fire(j.args, j.real)
}

export function giveBack(channelId: string) {
	const j = jobFor(channelId)
	if (!j) return
	dropJob(channelId, j.id)
	reviewed.delete(channelId)
	if (j.phase === 'review') {
		markReviewed(channelId, j.original)
		putText(channelId, j.original)
		return
	}
	if (!draftOf(channelId).trim()) putText(channelId, j.original)
	else toast('Kept what you typed since')
}

export function settle(channelId: string, draft: string) {
	const j = jobFor(channelId)
	if (draft.trim()) return
	if (j?.phase === 'review') dropJob(channelId, j.id)
	const r = reviewed.get(channelId)
	if (r === undefined) return
	setTimeout(() => {
		if (reviewed.get(channelId) === r && !draftOf(channelId).trim())
			reviewed.delete(channelId)
	}, 1500)
}

export function sendNow(channelId: string, text: string) {
	const i = chatInput(channelId)
	if (!i?.setText || !i.handleSend) return false
	markReviewed(channelId, text)
	i.setText(text)
	let tries = 0
	const go = () => {
		if (i.getText?.() !== text && tries++ < 20) return setTimeout(go, 25)
		i.handleSend()
	}
	setTimeout(go, 0)
	return true
}
