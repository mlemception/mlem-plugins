import {
	ActionSheetActionCreators,
	AlertActionCreators,
} from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { ReactNativeSafeAreaContext } from '@valenced/externals/react-native-safe-area-context'
import { createElement, Fragment, useEffect } from 'react'
import { Image, View } from 'react-native'
import { assetIcon, colors, useToken } from './discord'
import { RepostIcon } from './icon'

const KEY = 'RepostsConnect'

export function askConsent(app: any): Promise<boolean> {
	return new Promise(resolve => {
		let settled = false
		const finish = (v: boolean) => {
			if (settled) return
			settled = true
			resolve(v)
		}
		ActionSheetActionCreators.openLazy(
			Promise.resolve({ default: Consent }) as any,
			KEY,
			{ app, finish },
		)
	})
}

function Point({
	ok,
	title,
	sub,
}: {
	ok: boolean
	title: string
	sub?: string
}) {
	const { Text } = Design as any
	const c = colors()
	const good = useToken(c.STATUS_POSITIVE)
	const muted = useToken(c.ICON_MUTED ?? c.TEXT_MUTED)
	const Icon = assetIcon(ok ? 'CircleCheckIcon' : 'CircleXIcon')
	return (
		<View
			style={{
				flexDirection: 'row',
				gap: 12,
				alignItems: sub ? 'flex-start' : 'center',
			}}
		>
			<Icon size="md" color={ok ? good : muted} />
			<View style={{ flex: 1, gap: 2 }}>
				<Text
					variant="text-md/semibold"
					color={ok ? 'text-strong' : 'text-default'}
				>
					{title}
				</Text>
				{!!sub && (
					<Text variant="text-sm/medium" color="text-muted">
						{sub}
					</Text>
				)}
			</View>
		</View>
	)
}

function Consent({ app, finish }: { app: any; finish: (v: boolean) => void }) {
	const { ActionSheet, Text, Button, Card } = Design as any
	const c = colors()
	const brand = useToken(c.BACKGROUND_BRAND ?? c.BRAND_500)
	useEffect(() => () => finish(false), [finish])
	const bottom =
		(ReactNativeSafeAreaContext as any).useSafeAreaInsets?.().bottom ?? 24

	const close = (v: boolean) => {
		finish(v)
		ActionSheetActionCreators.hideActionSheet(KEY)
	}
	const icon = app?.icon
		? `https://cdn.discordapp.com/app-icons/${app.id}/${app.icon}.png?size=128`
		: undefined

	return (
		<ActionSheet startExpanded onDismiss={() => finish(false)}>
			<View
				style={{
					paddingHorizontal: 16,
					paddingTop: 8,
					paddingBottom: 16 + bottom,
					gap: 20,
				}}
			>
				<View style={{ alignItems: 'center', gap: 12 }}>
					<View
						style={{
							width: 72,
							height: 72,
							borderRadius: 22,
							backgroundColor: brand,
							alignItems: 'center',
							justifyContent: 'center',
							overflow: 'hidden',
						}}
					>
						{icon ? (
							<Image source={{ uri: icon }} style={{ width: 72, height: 72 }} />
						) : (
							<RepostIcon size={40} color="#fff" />
						)}
					</View>
					<View style={{ alignItems: 'center', gap: 4 }}>
						<Text variant="heading-xl/bold" color="text-strong">
							Connect Reposts
						</Text>
						<Text
							variant="text-md/medium"
							color="text-muted"
							style={{ textAlign: 'center' }}
						>
							{app?.name
								? `${app.name} will know who you are, nothing else.`
								: 'Reposts will know who you are, nothing else.'}
						</Text>
					</View>
				</View>
				<Card style={{ gap: 16 }}>
					<Point
						ok
						title="Your Discord ID"
						sub="So only you can add or remove your reposts"
					/>
					<Point ok={false} title="Can't read your messages, servers or DMs" />
					<Point ok={false} title="Can't post or do anything as you" />
				</Card>
				<View style={{ gap: 8 }}>
					<Button
						text="Authorize"
						variant="primary"
						size="lg"
						onPress={() => close(true)}
					/>
					<Button
						text="Not now"
						variant="secondary"
						size="lg"
						onPress={() => close(false)}
					/>
				</View>
				<Text
					variant="text-xs/medium"
					color="text-muted"
					style={{ textAlign: 'center' }}
				>
					You can log out or delete everything any time in the plugin's
					settings.
				</Text>
			</View>
		</ActionSheet>
	)
}

export function offerBrowser(reason: string): Promise<boolean> {
	return new Promise(resolve => {
		const { AlertModal, AlertActionButton } = Design as any
		AlertActionCreators.openAlert(
			'reposts-browser',
			createElement(AlertModal, {
				title: "Couldn't connect in the app",
				content: `${reason} You can finish connecting in your browser instead, then come back here.`,
				onDismiss: () => resolve(false),
				actions: createElement(
					Fragment,
					null,
					createElement(AlertActionButton, {
						text: 'Open browser',
						variant: 'primary',
						onPress: () => resolve(true),
					}),
					createElement(AlertActionButton, {
						text: 'Cancel',
						variant: 'secondary',
						onPress: () => resolve(false),
					}),
				),
			}),
		)
	})
}

export function confirm(
	title: string,
	body: string,
	yes: string,
	run: () => void,
) {
	const { AlertModal, AlertActionButton } = Design as any
	AlertActionCreators.openAlert(
		'reposts-confirm',
		createElement(AlertModal, {
			title,
			content: body,
			actions: createElement(
				Fragment,
				null,
				createElement(AlertActionButton, {
					text: yes,
					variant: 'destructive',
					onPress: run,
				}),
				createElement(AlertActionButton, {
					text: 'Cancel',
					variant: 'secondary',
				}),
			),
		}),
	)
}

export function explain(title: string, body: string) {
	const { AlertModal, AlertActionButton } = Design as any
	AlertActionCreators.openAlert(
		'reposts-info',
		createElement(AlertModal, {
			title,
			content: body,
			actions: createElement(AlertActionButton, {
				text: 'Got it',
				variant: 'primary',
			}),
		}),
	)
}
