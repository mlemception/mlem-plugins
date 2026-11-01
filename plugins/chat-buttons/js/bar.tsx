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
import { createBar, inOrder, storage, useLive } from './store'
import type { ComponentType, ReactNode } from 'react'
import type { Bar as BarType, Entry } from './store'

const Bar = createContext<BarType | null>(null)
const Free = createContext(false)
const Slot = createContext<((v: boolean) => void) | null>(null)

function useHeld(entry: Entry) {
	const bar = useContext(Bar)
	const slot = useContext(Slot)
	const s = storage.use()
	const kept = !bar || !!s?.kept?.[entry.id]
	const ref = useRef(entry)
	ref.current = entry

	useLayoutEffect(() => bar?.add(ref), [bar, entry.id])
	useLayoutEffect(() => bar?.touch(ref.current), [bar, entry.on, entry.Icon])
	useLayoutEffect(() => {
		slot?.(!kept)
	}, [kept, slot])

	return kept
}

const hiddenStyle = { position: 'absolute', right: 56, opacity: 0 } as const

function Stash({ hidden, children }: { hidden: boolean; children: ReactNode }) {
	return (
		<View
			collapsable={false}
			pointerEvents={hidden ? 'none' : 'auto'}
			style={hidden ? hiddenStyle : undefined}
			accessibilityElementsHidden={hidden}
			importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
		>
			{children}
		</View>
	)
}

const stateOf = (p: any) =>
	p.accessibilityState?.checked ?? p.accessibilityState?.selected ?? p.active

let Button: any

export const setButton = (v: any) => {
	Button = v
}

export function Hold({ real: Real, ...props }: any) {
	const bar = useContext(Bar)
	const free = useContext(Free)
	return !bar || free ? <Real {...props} /> : <Held real={Real} {...props} />
}

function Held({ real: Real, ...props }: any) {
	const gift = !!useContext(Slot)
	const kept = useHeld({
		id: props.accessibilityLabel ?? props.IconComponent?.name ?? 'button',
		label: props.accessibilityLabel ?? 'Button',
		Icon: props.IconComponent,
		on: gift ? undefined : stateOf(props),
		press: props.onPress,
	})
	return (
		<Stash hidden={!kept}>
			<Real {...props} />
		</Stash>
	)
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
	return <Stash hidden={!kept}>{el}</Stash>
}

function Gift({ children }: { children: ReactNode }) {
	const [gone, setGone] = useState(false)
	return (
		<Slot.Provider value={setGone}>
			<Stash hidden={gone}>{children}</Stash>
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

const longPress = (node: any): boolean => {
	if (Array.isArray(node)) return node.some(longPress)
	if (!isValidElement(node)) return false
	const p = node.props as any
	return !!p.triggerOnLongPress || longPress(p.children)
}

const inner = (type: any) => {
	if (typeof type === 'function')
		return type.prototype?.isReactComponent ? undefined : type
	if (type?.type) return inner(type.type)
	return type?.render
}

function Foreign({ render, id, props }: any) {
	const out = render(props, props.ref)
	if (longPress(out)) return <Free.Provider value>{out}</Free.Provider>
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
	const kept = useHeld({
		id: name,
		label: name,
		Icon: hit.IconComponent ?? Drawn,
		on: stateOf(hit),
		press: hit.onPress,
	})
	return (
		<Free.Provider value>
			<Stash hidden={!kept}>{out}</Stash>
		</Free.Provider>
	)
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
			<Free.Provider key="send" value>
				{el}
			</Free.Provider>
		)
	if ('renderItem' in p) return <Gift key="gift">{el}</Gift>
	if ('showKeyboardIcon' in p) return <Emoji key="emoji" el={el} />
	return wrap(el)
}

const isRight = (x: any) =>
	isValidElement(x) && !!(x.props as any).children?.props?.onPressExpression

function Menu({ bar }: { bar: BarType }) {
	const { ContextMenu } = Design as any
	const s = storage.use()
	const rows = inOrder(useLive(bar), s).filter(x => !s?.kept?.[x.id])

	const manage = [
		{
			label: 'Manage buttons',
			IconComponent: tint(EditIcon),
			action: () => openManage(bar),
		},
	]

	const items = rows.map(x => ({
		label: s?.names?.[x.id] || x.label,
		IconComponent: x.Icon && tint(x.Icon),
		trailingIndicator:
			typeof x.on === 'boolean' ? (x.on ? On : Off) : undefined,
		action: () =>
			bar
				.list()
				.find(y => y.id === x.id)
				?.press(),
	}))

	return (
		<ContextMenu
			align="above"
			items={items.length ? [items, manage] : [manage]}
		>
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
	const [bar] = useState(createBar)
	const list = Children.toArray(children)
	const out = list.map(x => swap(x, As))
	if (!menu) return <As {...props}>{out}</As>

	out.splice(list.findIndex(isRight), 0, <Menu key="menu" bar={bar} />)
	return (
		<Bar.Provider value={bar}>
			<As {...props}>{out}</As>
		</Bar.Provider>
	)
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
