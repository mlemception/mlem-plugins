import { Stores } from '@valenced/discord/flux'
import { useEffect, useState } from 'react'
import { byProps } from '../common'
import Text from './Text'
import type { PropsWithChildren } from 'react'

export default function SmartMention({
	userId,
	color,
	loadUsername,
	children,
}: PropsWithChildren<{
	userId: string
	color?: string
	loadUsername?: boolean
}>) {
	const UserStore = (Stores as any).UserStore
	const [name, setName] = useState<string | null>(null)

	useEffect(() => {
		if (name || !loadUsername) return
		const user = UserStore.getUser(userId)
		if (user) setName(user.username)
		else
			byProps('get', 'post', 'HTTPResponseError')
				?.get({ url: `/users/${userId}` })
				.then((x: any) => setName(x.body.username))
				.catch(() => {})
	}, [loadUsername])

	return (
		<Text variant="text-md/bold" color={color ?? 'TEXT_DEFAULT'}>
			{loadUsername ? `@${name ?? '...'}` : children}
		</Text>
	)
}
