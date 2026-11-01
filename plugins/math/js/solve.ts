const num = String.raw`-?\d+(?:\.\d+)?`
const op = String.raw`[ \t]*[+\-*÷][ \t]*`
const skip = String.raw`\x60{3}[\s\S]*?\x60{3}|\x60[^\x60\n]*\x60|<[^>\n]*>|https?:\/\/\S+`
const start = String.raw`(?<![\p{L}\p{N}_.,:/\\#@$€£%=+\-*÷~])`
const end = String.raw`(?![\p{L}\p{N}_%$€£°+\-*÷~]|[.,:/][\p{L}\p{N}]|[ \t]*=)`

const expr = new RegExp(`(${skip})|${start}${num}(?:${op}${num})+${end}`, 'gu')
const tokens = /(?<![\d.])-?\d+(?:\.\d+)?|[+\-*÷]/g
const dashes = /^\d+(?:-\d+){2,}$/
const max = 1e15

const calc = (m: string) => {
	if (dashes.test(m)) return m

	const t = m.replace(/[ \t]/g, '').match(tokens)!
	const parts = [Number(t[0])]
	if (Math.abs(parts[0]) >= max) return m

	for (let i = 1; i < t.length; i += 2) {
		const n = Number(t[i + 1])
		if (Math.abs(n) >= max) return m

		const last = parts.length - 1
		if (t[i] === '*') parts[last] *= n
		else if (t[i] === '÷') parts[last] /= n
		else parts.push(t[i] === '-' ? -n : n)
	}

	const r = parts.reduce((a, b) => a + b, 0)
	if (!Number.isFinite(r) || Math.abs(r) >= max) return m

	let n = Number(r.toPrecision(15))
	if (t.includes('÷') && String(n).replace(/\D|^\D*0+/g, '').length >= 13)
		n = Number(r.toFixed(3)) || Number(r.toPrecision(3))

	const s = String(n)
	return s.includes('e') ? m : s
}

export const solve = (text: string) =>
	text.replace(expr, (m, skipped) => (skipped ? m : calc(m)))
