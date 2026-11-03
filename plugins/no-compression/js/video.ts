import { callNativeMethod } from '@valenced/modules/native'

export const call = callNativeMethod as (
	name: string,
	args: unknown[],
) => Promise<any>

export const info = new Map<string, any>()

function side(meta: any, rate: number, fps: number) {
	const short = Math.min(meta.width, meta.height)
	const long = Math.max(meta.width, meta.height)
	const fit = Math.sqrt((rate / (fps * 0.045)) * (short / long))
	return Math.max(144, Math.round(Math.min(1080, short, fit) / 2) * 2)
}

function wait(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

async function run(uri: string, short: number, rate: number) {
	const id = await call('mlemnc.run', ['start', uri, short, Math.round(rate)])
	if (!id) throw new Error('no engine')
	for (;;) {
		await wait(250)
		const job = await call('mlemnc.run', ['status', id])
		if (!job) throw new Error('lost job')
		if (job.state === 'error') throw new Error(job.error || 'failed')
		if (job.state === 'done') return job
	}
}

export async function shrink(uri: string, limit: number) {
	const meta = info.get(uri)
	if (!meta?.durationMs || !meta.width) return null

	const fps = meta.frameRate || 30
	const seconds = meta.durationMs / 1000
	let rate = (limit * 0.92 * 8) / seconds - 256000
	if (meta.bitRate) rate = Math.min(rate, meta.bitRate)
	rate = Math.max(rate, 100000)

	try {
		let path = ''
		for (let tries = 0; tries < 3; tries++) {
			const job = await run(uri, side(meta, rate, fps), rate)
			path = `file://${job.path}`
			if (job.size <= limit) break
			rate = Math.max(rate * ((limit * 0.9) / job.size), 100000)
		}
		return path
	} catch {
		return null
	}
}
