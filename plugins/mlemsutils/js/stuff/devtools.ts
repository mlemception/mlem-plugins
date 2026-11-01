import { Stores } from '@valenced/discord/flux'
import { before, instead } from '@valenced/patcher'
import { byProps, resolveSemanticColor, tokens } from '../lib/common'

export default function () {
	const patches: (() => void)[] = []

	const collected = new Map<
		string,
		{
			get: () => object
			unpatch: () => void
		}
	>()
	const g = globalThis as any
	const mlem: any = {
		get semantic() {
			const data: Record<string, any> = {}
			for (const [key, raw] of Object.entries(tokens().colors)) {
				data[key] = Object.fromEntries(
					['dark', 'darker', 'midnight', 'light'].map(x => [
						x,
						resolveSemanticColor(raw, x),
					]),
				)
			}
			return data
		},
		searchSemantic(query: string) {
			query ??= ''
			return Object.fromEntries(
				Object.entries(this.semantic).filter(([x]) =>
					query.startsWith('^') && query.endsWith('$')
						? x.toLowerCase() === query.toLowerCase().slice(1, -1)
						: query.startsWith('^')
							? x.toLowerCase().startsWith(query.toLowerCase().slice(1))
							: query.endsWith('$')
								? x.toLowerCase().endsWith(query.toLowerCase().slice(0, -1))
								: x.toLowerCase().includes(query.toLowerCase()),
				),
			)
		},
		findSemantic(hex: string) {
			hex ??= ''
			const { theme } = (Stores as any).ThemeStore

			return Object.fromEntries(
				Object.entries(this.semantic as Record<string, any>)
					.map(([x, y]) => [
						x,
						Object.fromEntries(
							Object.entries(y).filter(([k, z]) => k === theme && z === hex),
						),
					])
					.filter(([_, z]) => Object.entries(z)[0]),
			)
		},

		p: {
			wipe: () => {
				for (const x of patches) {
					x()
				}
				patches.length = 0
			},
			snipe: (
				prop: string,
				parent: any,
				callback?: (args: any[], ret: any) => any,
				oneTime?: boolean,
			) => {
				const patch = instead(parent, prop, (args: any, orig: any) => {
					if (oneTime) queueMicrotask(patch)
					const ret = orig.apply(parent, args)
					return callback
						? (callback(args, ret) ?? ret)
						: (console.log('[mlem]:', args, ret), ret)
				})
				patches.push(patch)
			},
			shotgun: (
				parent: any,
				callback?: (args: any[], ret: any) => any,
				oneTime?: boolean,
			) => {
				let p = 0
				for (const [key, val] of Object.entries(parent)) {
					if (typeof val === 'function') {
						mlem.p.snipe(key, parent, callback, oneTime)
						p++
					}
				}
				return p
			},
			props: {
				collect: (
					key: string,
					prop: string,
					parent: any,
					parser?: (obj: any) => any,
				) => {
					collected.get(key)?.unpatch()

					const ran: string[] = []
					const unpatch = before(parent, prop, (args: any) => {
						const props = parser?.(args) ?? args[0]
						const runFor = (propper: any, assign: any, tree = '.') => {
							if ('_value' in propper) return
							for (const p of Object.keys(propper)) {
								if (!assign[p] && ran.includes(tree)) {
									assign[p] ??= {
										kinds: ['undefined'],
										stuff: ['undefined'],
									}
								} else {
									assign[p] ??= {
										kinds: [],
										stuff: [],
									}
									ran.push(tree)
								}

								const stuff = Array.isArray(propper[p])
									? propper[p]
									: [propper[p]]
								for (const x of stuff) {
									const array = Array.isArray(x)
									const kind = array ? 'array' : typeof x

									if (typeof x === 'object' && x !== null) {
										let set = assign[p].stuff.find(
											(y: any) => typeof y === 'object' && y !== null,
										)
										if (!set) {
											set = assign[p].stuff[assign[p].stuff.push({}) - 1]
										}

										runFor(x, set, `${tree}${p}.`)
									} else if (
										!assign[p].stuff.find(
											(y: any) => JSON.stringify(y) === JSON.stringify(x),
										)
									) {
										assign[p].stuff.push(x)
									}
									if (!assign[p].kinds.includes(kind)) {
										assign[p].kinds.push(kind)
									}
								}
							}

							for (const r of Object.keys(assign)) {
								if (propper[r] === undefined) {
									if (!assign[r].kinds.includes('undefined')) {
										assign[r].kinds.push('undefined')
									}
									if (!assign[r].stuff.includes('undefined')) {
										assign[r].stuff.push('undefined')
									}
								}
							}
						}

						runFor(props, data)
						console.log(`[mlem]: Collected new prop for "${key}"`)
						return args
					})
					patches.push(unpatch)

					const data: object = {}
					collected.set(key, {
						unpatch,
						get: () => data,
					})
				},
				redeem: (key: string, save?: boolean) => {
					const coll = collected.get(key)
					if (!coll) return

					coll.unpatch()
					if (save) {
						console.log(
							`DEBUG\0SAVEFILE\0${JSON.stringify(`mlemsutils_${key}.json`)}\0${JSON.stringify(
								JSON.stringify(coll.get(), undefined, 3),
							)}`,
						)
					} else return coll.get()
				},
			},
		},
		q: {
			toggleTheme() {
				const { updateTheme } = byProps('updateTheme')
				if ((Stores as any).ThemeStore.theme === 'light') updateTheme('darker')
				else updateTheme('light')
			},
		},
	}
	g.mlem = mlem

	return () => {
		g.mlem?.p.wipe()
		g.mlem = undefined
	}
}
