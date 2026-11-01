import { Design } from '@valenced/discord/design'
import {
	Children,
	cloneElement,
	createContext,
	createElement,
	isValidElement,
	useContext,
	useLayoutEffect,
	useRef,
	useState,
} from 'react'
import { View } from 'react-native'
import { EditIcon, EmojiIcon, MenuIcon, Off, On, tint } from './icons'
import { openManage } from './manage'
import { press, refresh, storage, track, useLive } from './store'
import type { ComponentType, ReactNode } from 'react'
import type { Entry } from './store'

const Slot = createContext<((v: boolean) => void) | null>(null)

function useHeld(entry: Entry) {
	const s = storage.use()
	const kept = !!s?.kept?.[entry.id]
	const slot = useContext(Slot)
	const ref = useRef(entry)
	ref.current = entry

	useLayoutEffect(() => track(ref), [entry.id])
	useLayoutEffect(() => refresh(ref.current), [entry.on, entry.Icon])
	useLayoutEffect(() => {
		slot?.(!kept)
	}, [kept, slot])

	return kept
}

let Button: any

export const setButton = (v: any) => {
	Button = v
}

const Free = createContext(false)

export function Hold({ real: Real, ...props }: any) {
	return useContext(Free) ? (
		<Real {...props} />
	) : (
		<Held real={Real} {...props} />
	)
}

function Held({ real: Real, ...props }: any) {
	const gift = !!useContext(Slot)
	const kept = useHeld({
		id: props.accessibilityLabel ?? props.IconComponent?.name ?? 'button',
		label: props.accessibilityLabel ?? 'Button',
		Icon: props.IconComponent,
		on: gift ? undefined : props.active,
		press: props.onPress,
	})
	return kept ? <Real {...props} /> : null
}

export const skips = (p: any) =>
	p.keep || !p.onPress || !!p.accessibilityActions

function Emoji({ el }: { el: any }) {
	const kept = useHeld({
		id: 'emoji',
		label: 'Emoji',
		Icon: EmojiIcon,
		press: el.props.onPress,
	})
	return kept ? el : null
}

function Gift({ children }: { children: ReactNode }) {
	const [gone, setGone] = useState(false)
	return (
		<Slot.Provider value={setGone}>
			<View style={gone ? { display: 'none' } : undefined}>{children}</View>
		</Slot.Provider>
	)
}

const pressable = (node: any): any => {
	if (Array.isArray(node)) {
		for (const x of node) {
			const hit = pressable(x)
			if (hit) return hit
		}
		return
	}
	if (!isValidElement(node)) return
	const p = node.props as any
	return typeof p.onPress === 'function' ? p : pressable(p.children)
}

const inner = (type: any) => {
	if (typeof type === 'function')
		return type.prototype?.isReactComponent ? undefined : type
	if (type?.type) return inner(type.type)
	return type?.render
}

function Foreign({ render, id, props }: any) {
	const out = render(props, props.ref)
	const hit = pressable(out)
	return hit ? <Picked id={id} out={out} hit={hit} /> : out
}

function Picked({ id, out, hit }: any) {
	const name = hit.accessibilityLabel ?? id
	const icon = useRef(hit.children)
	icon.current = hit.children
	const [Drawn] = useState(() => ({ style }: any) => {
		const x = icon.current
		return isValidElement(x)
			? cloneElement(x as any, { style: [(x.props as any).style, style] })
			: x
	})
	const state = hit.accessibilityState
	const kept = useHeld({
		id: name,
		label: name,
		Icon: hit.IconComponent ?? Drawn,
		on: hit.active ?? state?.checked ?? state?.selected,
		press: hit.onPress,
	})
	return kept ? out : null
}

const wrapped = new WeakMap<object, ComponentType<any>>()

function wrap(el: any) {
	const render = inner(el.type)
	if (!render) return el

	let Comp = wrapped.get(el.type)
	if (!Comp) {
		Comp = ({ id, props }: any) => (
			<Foreign render={render} id={id} props={props} />
		)
		wrapped.set(el.type, Comp)
	}

	const name = el.type.displayName ?? render.displayName ?? render.name
	const id = name?.length > 2 ? name : (el.key ?? 'Button')
	return createElement(Comp, { key: el.key, id, props: el.props })
}

function swap(el: any, As: any) {
	if (!isValidElement(el)) return el
	const p = el.props as any
	if (el.type === As) return el
	if ('onSendMessage' in p)
		return (
			<Free.Provider key={el.key} value>
				{el}
			</Free.Provider>
		)
	if ('renderItem' in p) return <Gift key={el.key}>{el}</Gift>
	if ('showKeyboardIcon' in p) return <Emoji key={el.key} el={el} />
	return wrap(el)
}

const isRight = (x: any) =>
	isValidElement(x) && !!(x.props as any).children?.props?.onPressExpression

function Menu() {
	const { ContextMenu } = Design as any
	const s = storage.use()
	const rows = useLive().filter(x => !s?.kept?.[x.id])

	const items = [
		rows.map(x => ({
			label: s?.names?.[x.id] || x.label,
			IconComponent: x.Icon && tint(x.Icon),
			trailingIndicator:
				typeof x.on === 'boolean' ? (x.on ? On : Off) : undefined,
			action: () => press(x.id),
		})),
		[
			{
				label: 'Manage buttons',
				IconComponent: tint(EditIcon),
				action: openManage,
			},
		],
	]

	return (
		<ContextMenu align="above" items={items}>
			{(p: any) => (
				<Button
					{...p}
					keep
					accessibilityLabel="Buttons"
					IconComponent={MenuIcon}
				/>
			)}
		</ContextMenu>
	)
}

export function Row({ as: As, menu, children, ...props }: any) {
	const list = Children.toArray(children)
	const out = list.map(x => swap(x, As))
	if (menu) out.splice(list.findIndex(isRight), 0, <Menu key="menu" />)
	return <As {...props}>{out}</As>
}

export function swapRow(node: ReactNode): ReactNode {
	if (!isValidElement(node)) return node

	const { children } = node.props as any
	const list = Array.isArray(children) ? children : [children]

	if (list.some(isRight))
		return {
			...node,
			type: Row,
			props: { ...(node.props as any), as: node.type, menu: true },
		} as any

	for (const [i, child] of list.entries()) {
		const patched = swapRow(child)
		if (patched === child) continue

		const next = [...list]
		next[i] = patched
		return {
			...node,
			props: {
				...(node.props as any),
				children: Array.isArray(children) ? next : patched,
			},
		}
	}

	return node
}
