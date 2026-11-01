import { useEffect, useReducer } from 'react'
import type { ReactNode } from 'react'

type Jsx = (type: any, props: any) => ReactNode
type Resolver = (type: any, props: any, jsx: Jsx) => ReactNode

const listeners = new Set<() => void>()
let resolver: Resolver | undefined

export function setSwitchResolver(value?: Resolver) {
	resolver = value
	for (const listener of listeners) listener()
}

export default function SwitchHost({
	component,
	jsx,
	...props
}: {
	component: any
	jsx: Jsx
	[key: string]: any
}) {
	const [, update] = useReducer(x => x + 1, 0)

	useEffect(() => {
		listeners.add(update)
		return () => {
			listeners.delete(update)
		}
	}, [])

	return resolver ? resolver(component, props, jsx) : jsx(component, props)
}
