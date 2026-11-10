const chars = (s: string) => Array.from(s)

function shift(s: string, upper: number, lower: number, digit?: number) {
	return chars(s)
		.map(c => {
			const n = c.charCodeAt(0)
			if (c.length > 1) return c
			if (n >= 65 && n <= 90) return String.fromCodePoint(upper + n - 65)
			if (n >= 97 && n <= 122) return String.fromCodePoint(lower + n - 97)
			if (digit !== undefined && n >= 48 && n <= 57)
				return String.fromCodePoint(digit + n - 48)
			return c
		})
		.join('')
}

const table = (from: string, to: string) => {
	const a = chars(from)
	const b = chars(to)
	const m = new Map<string, string>()
	a.forEach((c, i) => m.set(c, b[i]))
	return (s: string) =>
		chars(s)
			.map(c => m.get(c) ?? m.get(c.toLowerCase()) ?? c)
			.join('')
}

const small = table('abcdefghijklmnopqrstuvwxyz', 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ')

const flip = table(
	'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?\'"()[]{}<>&_;',
	"ɐqɔpǝɟƃɥᴉɾʞlɯuodbɹsʇnʌʍxʎz∀ᗺƆᗡƎℲ⅁HIſꞰ˥WNOԀῸᴚS⊥∩ΛMX⅄Z0ƖᄅƐㄣϛ9ㄥ86˙'¡¿,„)(][}{><⅋‾؛",
)

const leet = table('aeiost', '431057')

const marks = Array.from({ length: 0x36f - 0x300 + 1 }, (_, i) =>
	String.fromCharCode(0x300 + i),
)

function wide(s: string) {
	return chars(s)
		.map(c => {
			const n = c.charCodeAt(0)
			if (c === ' ') return '　'
			if (c.length === 1 && n >= 33 && n <= 126)
				return String.fromCharCode(n + 0xfee0)
			return c
		})
		.join('')
}

function mock(s: string) {
	let up = false
	return chars(s)
		.map(c => {
			if (c.toLowerCase() === c.toUpperCase()) return c
			up = !up
			return up ? c.toLowerCase() : c.toUpperCase()
		})
		.join('')
}

function bubble(s: string) {
	return chars(s)
		.map(c => {
			const n = c.charCodeAt(0)
			if (c.length > 1) return c
			if (n >= 65 && n <= 90) return String.fromCodePoint(0x24b6 + n - 65)
			if (n >= 97 && n <= 122) return String.fromCodePoint(0x24d0 + n - 97)
			if (c === '0') return '⓪'
			if (n >= 49 && n <= 57) return String.fromCodePoint(0x2460 + n - 49)
			return c
		})
		.join('')
}

function zalgo(s: string) {
	return chars(s)
		.map(c => {
			if (!/\p{L}/u.test(c)) return c
			let out = c
			const n = 1 + Math.floor(Math.random() * 3)
			for (let i = 0; i < n; i++)
				out += marks[Math.floor(Math.random() * marks.length)]
			return out
		})
		.join('')
}

export const transforms: Record<string, (s: string) => string> = {
	mock,
	small,
	wide,
	bubble,
	zalgo,
	leet,
	cursive: s => shift(s, 0x1d4d0, 0x1d4ea),
	gothic: s => shift(s, 0x1d56c, 0x1d586),
	bold: s => shift(s, 0x1d400, 0x1d41a, 0x1d7ce),
	flip: s => chars(flip(s)).reverse().join(''),
	back: s => chars(s).reverse().join(''),
	clap: s => s.trim().split(/\s+/).join(' 👏 '),
	spaced: s => chars(s).join(' '),
	strike: s =>
		chars(s)
			.map(c => (c === ' ' ? c : `${c}̶`))
			.join(''),
}
