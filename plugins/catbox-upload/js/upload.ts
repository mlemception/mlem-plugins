import { Stores } from '@valenced/discord/flux'
import { getNativeModule } from '@valenced/modules/native'
import { useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { byProps, chatInput } from './common'
import { options } from './store'
import type { Host } from './store'

const MB = 1024 * 1024

export const hosts = {
	catbox: {
		name: 'Catbox',
		api: 'https://catbox.moe/user/api.php',
		max: 200 * MB,
	},
	litterbox: {
		name: 'Litterbox',
		api: 'https://litterbox.catbox.moe/resources/internals/api.php',
		max: 1024 * MB,
	},
}

export const size = (n: number) =>
	n >= 1024 * MB
		? `${+(n / 1024 / MB).toFixed(1)} GB`
		: n >= MB
			? `${+(n / MB).toFixed(1)} MB`
			: `${Math.max(1, Math.round(n / 1024))} KB`

export interface Item {
	id: number
	uri: string
	name: string
	type: string
	size: number
	host: Host
	status: 'wait' | 'up' | 'done' | 'fail'
	url?: string
	error?: string
}

export interface Job {
	id: number
	channelId: string
	args: any[]
	files: Item[]
	error?: string
}

export interface State {
	jobs: Job[]
	progress: number
}

let state: State = { jobs: [], progress: 0 }
const listeners = new Set<() => void>()

function set(next: Partial<State>) {
	state = { ...state, ...next }
	for (const l of listeners) l()
}

function patch(id: number, fn: (j: Job) => Job) {
	set({ jobs: state.jobs.map(j => (j.id === id ? fn(j) : j)) })
}

const listen = (l: () => void) => {
	listeners.add(l)
	return () => {
		listeners.delete(l)
	}
}

export const useUploads = () => useSyncExternalStore(listen, () => state)

let ids = 0
let xhr: XMLHttpRequest | null = null
let current: { job: number; file: number } | null = null
let running = false

export const bypass = new WeakSet<object>()

let messages: any

export const setMessages = (m: any) => {
	messages = m
}

async function sizeOf(uri: string) {
	try {
		const fs = getNativeModule<any>('NativeFileModule')
		return Number(await fs?.getSize(uri)) || 0
	} catch {
		return 0
	}
}

const boosts: Record<number, number> = { 2: 50 * MB, 3: 100 * MB }

function uploadLimit(channelId: string) {
	try {
		const S = Stores as any
		const user = S.UserStore.getCurrentUser()
		const m = byProps('getUserMaxFileSize')
		const fn = m?.getUserMaxFileSize ?? m?.default?.getUserMaxFileSize
		const mine = typeof fn === 'function' ? Number(fn(user)) || 0 : 0
		const guildId = S.ChannelStore.getChannel(channelId)?.guild_id
		const tier = guildId ? S.GuildStore.getGuild(guildId)?.premiumTier : 0
		const base = Math.max(mine, boosts[tier] ?? 0)
		const eff = byProps('getEffectiveUploadLimit')?.getEffectiveUploadLimit
		return typeof eff === 'function'
			? Number(eff(base)) || Math.max(base, 20 * MB)
			: Math.max(base, 20 * MB)
	} catch {
		return 0
	}
}

export async function split(channelId: string, uploads: any[]) {
	const limit = uploadLimit(channelId)
	const catbox: { upload: any; size: number }[] = []
	const keep: any[] = []
	for (const u of uploads) {
		const uri = u?.item?.uri
		if (!uri) {
			keep.push(u)
			continue
		}
		const bytes = await sizeOf(uri)
		const go = !!limit && bytes > limit
		if (go) catbox.push({ upload: u, size: bytes })
		else keep.push(u)
	}
	return { catbox, keep }
}

export function hold(
	channelId: string,
	args: any[],
	files: { upload: any; size: number }[],
) {
	const { host } = options()
	const h = hosts[host]
	const tooBig = files.find(f => f.size > h.max)
	const job: Job = {
		id: ++ids,
		channelId,
		args,
		files: files.map(({ upload, size: bytes }) => ({
			id: ++ids,
			uri: upload.item.uri,
			name: upload.filename || upload.item.filename || 'file',
			type:
				upload.mimeType || upload.item.mimeType || 'application/octet-stream',
			size: bytes,
			host,
			status: 'wait',
		})),
	}
	if (tooBig) {
		job.error = `Over ${size(h.max)}, too big for ${h.name}`
		job.files = job.files.map(f =>
			f.size > h.max ? { ...f, status: 'fail', error: job.error } : f,
		)
	}
	set({ jobs: [...state.jobs, job] })
	if (!tooBig && !running) run()
}

function next() {
	for (const j of state.jobs) {
		if (j.error) continue
		const f = j.files.find(x => x.status === 'wait')
		if (f) return { job: j, file: f }
	}
}

async function run() {
	running = true
	for (let n = next(); n; n = next()) {
		const { job, file } = n
		current = { job: job.id, file: file.id }
		const mark = (f: Partial<Item>) =>
			patch(job.id, j => ({
				...j,
				files: j.files.map(x => (x.id === file.id ? { ...x, ...f } : x)),
			}))
		mark({ status: 'up' })
		set({ progress: 0 })
		try {
			const url = await upload(file)
			mark({ status: 'done', url: mask(url, file) })
		} catch (e: any) {
			if (e === cancelled) continue
			mark({ status: 'fail', error: String(e?.message ?? e) })
		}
		const fresh = state.jobs.find(j => j.id === job.id)
		if (
			fresh &&
			!fresh.files.some(f => f.status === 'wait' || f.status === 'up')
		)
			settle(fresh)
	}
	current = null
	set({ progress: 0 })
	running = false
}

function settle(job: Job) {
	const failed = job.files.find(f => f.status === 'fail')
	if (failed) {
		patch(job.id, j => ({
			...j,
			error: `Upload failed · ${failed.error ?? 'try again'}`,
		}))
		return
	}
	if (AppState.currentState !== 'active') {
		patch(job.id, j => ({ ...j, error: 'Not sent, you left the app' }))
		return
	}
	set({ jobs: state.jobs.filter(j => j.id !== job.id) })
	const [channelId, msg, promise, opts, ...rest] = job.args
	const links = job.files.map(f => f.url).filter(Boolean)
	const content = [String(msg?.content ?? '').trim(), ...links]
		.filter(Boolean)
		.join(' ')
	const out = { ...msg, content }
	bypass.add(out)
	messages?.sendMessage(channelId, out, promise, opts, ...rest)
}

const cancelled = new Error('cancelled')

export function retry(jobId: number) {
	const job = state.jobs.find(j => j.id === jobId)
	if (!job) return
	const { host } = options()
	const again = job.files.some(f => f.status === 'fail')
	patch(jobId, j => ({
		...j,
		error: undefined,
		files: j.files.map(f =>
			f.status === 'fail'
				? { ...f, status: 'wait', error: undefined, host }
				: f,
		),
	}))
	if (again) {
		if (!running) run()
	} else {
		const fresh = state.jobs.find(j => j.id === jobId)
		if (fresh) settle(fresh)
	}
}

export function discard(jobId: number) {
	const job = state.jobs.find(j => j.id === jobId)
	if (!job) return
	if (current?.job === jobId) xhr?.abort()
	set({ jobs: state.jobs.filter(j => j.id !== jobId) })
	const text = String(job.args[1]?.content ?? '').trim()
	const input = chatInput(job.channelId)
	try {
		if (text && input && !input.getText?.()?.trim()) input.insertText(text)
	} catch {}
}

const masks = { hidden: '\u{E0020}', dot: '˙' }

function mask(raw: string, item: Item) {
	const { paste } = options()
	const mode = paste === 'hidden' && item.host === 'litterbox' ? 'dot' : paste
	return mode === 'hidden' || mode === 'dot' ? `[${masks[mode]}](${raw})` : raw
}

function upload(item: Item) {
	const h = hosts[item.host]
	const { expiry, userhash } = options()

	return new Promise<string>((resolve, reject) => {
		const req = new XMLHttpRequest()
		xhr = req

		const body = new FormData()
		body.append('reqtype', 'fileupload')
		if (item.host === 'litterbox') body.append('time', expiry)
		else if (userhash.trim()) body.append('userhash', userhash.trim())
		body.append('fileToUpload', {
			uri: item.uri,
			name: item.name,
			type: item.type,
		} as any)

		req.upload.onprogress = e => {
			if (!e.total) return
			const p = Math.min(0.99, e.loaded / e.total)
			if (p - state.progress >= 0.01) set({ progress: p })
		}
		req.onload = () => {
			xhr = null
			const text = String(req.responseText ?? '').trim()
			if (req.status === 200 && /^https:\/\/\S+$/.test(text)) {
				set({ progress: 1 })
				return resolve(text)
			}
			if (req.status === 412 || req.status === 413)
				return reject(new Error(`too big for ${h.name}`))
			if (req.status >= 500)
				return reject(new Error(`${h.name} is down right now`))
			reject(new Error(text.slice(0, 100) || `${h.name} said ${req.status}`))
		}
		req.onerror = () => {
			xhr = null
			reject(new Error(`couldn't reach ${h.name}`))
		}
		req.onabort = () => {
			xhr = null
			reject(cancelled)
		}

		req.open('POST', h.api)
		req.send(body)
	})
}
