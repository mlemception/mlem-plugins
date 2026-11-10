const table = Array.from({ length: 256 }, (_, n) => {
	let c = n
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
	return c >>> 0
})

const u32 = (n: number) => [
	(n >>> 24) & 255,
	(n >>> 16) & 255,
	(n >>> 8) & 255,
	n & 255,
]

function crc(bytes: number[]) {
	let c = 0xffffffff
	for (const b of bytes) c = table[(c ^ b) & 255]! ^ (c >>> 8)
	return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: number[]) {
	const body = [...type].map(c => c.charCodeAt(0)).concat(data)
	return [...u32(data.length), ...body, ...u32(crc(body))]
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64(b: number[]) {
	let s = ''
	for (let i = 0; i < b.length; i += 3) {
		const n = (b[i]! << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0)
		s += B64[n >> 18]! + B64[(n >> 12) & 63]!
		s += i + 1 < b.length ? B64[(n >> 6) & 63] : '='
		s += i + 2 < b.length ? B64[n & 63] : '='
	}
	return s
}

const bars = [
	[1.6, 11.2, 4.8, 14.4],
	[6.4, 6.4, 9.6, 14.4],
	[11.2, 1.6, 14.4, 14.4],
] as const

const cache = new Map<string, string>()

export function barsIcon(colors: [string, string, string], size = 48) {
	const key = colors.join()
	const hit = cache.get(key)
	if (hit) return hit

	const rgb = colors.map(c => Number.parseInt(c.slice(1, 7), 16))
	const raw: number[] = []
	const ss = 4
	const scale = 16 / size
	const r = 0.64

	for (let y = 0; y < size; y++) {
		raw.push(0)
		for (let x = 0; x < size; x++) {
			const cover = [0, 0, 0]
			for (let sy = 0; sy < ss; sy++)
				for (let sx = 0; sx < ss; sx++) {
					const px = (x + (sx + 0.5) / ss) * scale
					const py = (y + (sy + 0.5) / ss) * scale
					bars.forEach(([a, b, c, d], i) => {
						if (px < a || px > c || py < b || py > d) return
						const cx = Math.min(Math.max(px, a + r), c - r)
						const cy = Math.min(Math.max(py, b + r), d - r)
						if ((px - cx) ** 2 + (py - cy) ** 2 <= r * r) cover[i]!++
					})
				}
			const i = cover.findIndex(Boolean)
			if (i < 0) raw.push(0, 0, 0, 0)
			else {
				const c = rgb[i]!
				raw.push(
					(c >> 16) & 255,
					(c >> 8) & 255,
					c & 255,
					Math.round((255 * cover[i]!) / (ss * ss)),
				)
			}
		}
	}

	const z = [0x78, 1]
	for (let i = 0; i < raw.length; i += 65535) {
		const part = raw.slice(i, i + 65535)
		const len = part.length
		z.push(
			i + 65535 >= raw.length ? 1 : 0,
			len & 255,
			len >> 8,
			~len & 255,
			(~len >> 8) & 255,
		)
		for (const b of part) z.push(b)
	}
	let a = 1
	let b = 0
	for (const x of raw) {
		a = (a + x) % 65521
		b = (b + a) % 65521
	}
	z.push(...u32(((b << 16) | a) >>> 0))

	const png = [
		137,
		80,
		78,
		71,
		13,
		10,
		26,
		10,
		...chunk('IHDR', [...u32(size), ...u32(size), 8, 6, 0, 0, 0]),
		...chunk('IDAT', z),
		...chunk('IEND', []),
	]
	const url = `data:image/png;base64,${base64(png)}`
	cache.set(key, url)
	return url
}
