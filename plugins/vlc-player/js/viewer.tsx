import { getAssetIdByName } from '@valenced/assets'
import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { getModules, lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { getModuleDependencies, isModuleInitialized } from '@valenced/modules/metro'
import { callNativeMethod } from '@valenced/modules/native'
import { before, instead } from '@valenced/patcher'
import { insteadJSX } from '@valenced/react/jsx-runtime'
import { cloneElement, useEffect, useRef, useState } from 'react'
import {
	DeviceEventEmitter,
	Dimensions,
	Image,
	StyleSheet,
	useWindowDimensions,
	View,
} from 'react-native'

const call = callNativeMethod as (name: string, args: unknown[]) => Promise<any>
const stage = (...args: unknown[]) => call('mlemvlc.stage', args)

const files = /\.(mp4|m4v|webm|mov|mkv|avi|flv|wmv|ts|mpg|mpeg|3gp|ogv)(\?|$)/i
const plain = /\.(mp4|m4v|webm|mov)(\?|$)/i
const hosts = /^https:\/\/(cdn|media)\.discordapp\.(net|com)\//

export const state = { all: true, up: false }

let current: string | null = null
let viewing = false
let count = 0
const spots = new Map<string, number>()
const frames = new Map<string, string>()

const ours = (url?: string | null) =>
	state.up && !!url && hosts.test(url) && files.test(url) && (state.all || !plain.test(url))

function VlcVideo({ controls, muted, onError, onLoad, onLoadStart, paused, source, style }: any) {
	const id = useRef(`mlemvlc${++count}`).current
	const [cover, setCover] = useState(() => frames.get(source.uri))

	useEffect(() => {
		let loaded = false
		let busy = false
		current = id
		onLoadStart?.()
		const from = spots.get(source.uri) ?? 0
		spots.delete(source.uri)
		stage('open', id, source.uri, from, !!paused, !!muted)
		if (from > 0) {
			loaded = true
			onLoad?.({ naturalSize: { width: source.width, height: source.height } })
		}
		controls.props.ref.current = {
			seek: (seconds: number) => stage('seek', id, seconds),
		}
		const timer = setInterval(async () => {
			if (busy) return
			busy = true
			const now = await stage('poll', id).finally(() => {
				busy = false
			})
			if (!now) return
			setCover(undefined)
			if (now.failed) {
				onError?.({})
				return
			}
			if (now.ready && !loaded) {
				loaded = true
				onLoad?.({
					duration: now.length,
					naturalSize: { width: now.width, height: now.height },
				})
			}
			if (now.length > 0) {
				controls.props.onProgress({
					currentTime: now.time,
					seekableDuration: now.length,
				})
				controls.props.onDownloadProgress?.({ progressPercent: now.loaded })
			}
		}, 250)
		return () => {
			clearInterval(timer)
			current = null
			viewing = false
			frames.delete(source.uri)
			stage('close', id)
		}
	}, [])

	useEffect(() => {
		stage('pause', id, !!paused)
	}, [paused])

	useEffect(() => {
		stage('mute', id, !!muted)
	}, [muted])

	return (
		<View style={style}>
			<View nativeID={id} collapsable={false} style={StyleSheet.absoluteFill} />
			{cover && (
				<Image
					source={{ uri: `file://${cover}` }}
					fadeDuration={0}
					resizeMode="contain"
					style={StyleSheet.absoluteFill}
				/>
			)}
		</View>
	)
}

function saved(id: any) {
	let [mod] = lookupModule(withProps<any>('presentVideoSaved'))
	for (const dep of (getModuleDependencies(id) ?? []) as any[]) {
		if (mod) break
		try {
			const loaded = (globalThis as any).__r(dep)
			if (loaded?.presentVideoSaved) mod = loaded
		} catch {}
	}
	mod?.presentVideoSaved()
}

function choose(title: string, rows: { label: string; onPress: () => void }[]) {
	const [mod] = lookupModule(withProps<any>('showSimpleActionSheet'))
	mod?.showSimpleActionSheet({
		key: 'mlemvlc',
		header: {
			title,
			onClose: () => lookupModule(withProps<any>('hideActionSheet'))[0]?.hideActionSheet('mlemvlc'),
		},
		options: rows,
	})
}

const lowest = 0.25
const highest = 2
const inset = 26
const stops = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

const place = (rate: number) =>
	rate <= 1
		? ((rate - lowest) / (1 - lowest)) * 0.5
		: 0.5 + ((rate - 1) / (highest - 1)) * 0.5

const nearest = (at: number) =>
	stops.reduce((best, stop) =>
		Math.abs(place(stop) - at) < Math.abs(place(best) - at) ? stop : best,
	)

function SpeedSheet({ id, start }: { id: string; start: number }) {
	const { ActionSheet, ActionSheetCloseButton, BottomSheetTitleHeader, Slider, Text } =
		Design as any
	const [rate, setRate] = useState(start)
	const [{ Gesture, GestureDetector }] = lookupModule(withProps<any>('Gesture', 'GestureDetector'))
	const box = useRef(0)
	const last = useRef(start)
	const move = (x: number) => {
		const next = nearest((x - inset) / (box.current - inset * 2))
		if (next === last.current) return
		last.current = next
		setRate(next)
		stage('rate', id, next)
		const [buzz] = lookupModule(withProps<any>('triggerHapticFeedback'))
		buzz?.triggerHapticFeedback(buzz.HapticFeedbackTypes.IMPACT_LIGHT)
	}
	const hold = useRef(
		Gesture.Pan()
			.runOnJS(true)
			.minDistance(0)
			.onBegin((event: any) => move(event.x))
			.onUpdate((event: any) => move(event.x)),
	).current
	const label = (value: number) => `${+value.toFixed(2)}x`

	return (
		<ActionSheet
			header={
				<BottomSheetTitleHeader
					title="Speed"
					trailing={
						<ActionSheetCloseButton
							onPress={() => ActionSheetActionCreators.hideActionSheet('mlemvlc')}
						/>
					}
				/>
			}
		>
			<View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
				<Text variant="heading-lg/semibold" color="text-strong" style={{ textAlign: 'center' }}>
					{label(rate)}
				</Text>
				<GestureDetector gesture={hold}>
					<View
						style={{ height: 40, justifyContent: 'center' }}
						collapsable={false}
						pointerEvents="box-only"
						onLayout={event => {
							box.current = event.nativeEvent.layout.width
						}}
					>
						<Slider value={place(rate)} minimumValue={0} maximumValue={1} />
					</View>
				</GestureDetector>
				<View style={{ flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: -14 }}>
					{[label(lowest), '1x', label(highest)].map(text => (
						<Text
							key={text}
							variant="text-sm/medium"
							color="text-muted"
							style={{ width: 60, textAlign: 'center' }}
						>
							{text}
						</Text>
					))}
				</View>
			</View>
		</ActionSheet>
	)
}

function Buttons({ mute }: { mute: any }) {
	const { width, height } = useWindowDimensions()
	const [tracks, setTracks] = useState<any>(null)

	useEffect(() => {
		let tries = 0
		const timer = setInterval(async () => {
			if (++tries > 12) clearInterval(timer)
			const all = current && (await stage('tracks', current))
			if (all?.audio) setTracks(all)
		}, 500)
		return () => clearInterval(timer)
	}, [])

	const pick = async (kind: 'audio' | 'subs', title: string) => {
		const id = current
		const all = await stage('tracks', id)
		choose(
			title,
			(all?.[kind] ?? []).map((track: any) => ({
				label: `${track.on ? '✓ ' : ''}${track.name.replace('Disable', 'Off')}`,
				onPress: () => stage('pick', id, kind, track.id),
			})),
		)
	}

	const speed = async () => {
		const id = current
		const all = await stage('tracks', id)
		ActionSheetActionCreators.openLazy(
			Promise.resolve({ default: SpeedSheet }) as any,
			'mlemvlc',
			{ id, start: Math.round((all?.rate ?? 1) * 100) / 100 } as any,
		)
	}

	const rows = [
		['SpeedometerIcon', 'Speed', speed],
		tracks?.subs?.length > 1 && ['ClosedCaptionsIcon', 'Subtitles', () => pick('subs', 'Subtitles')],
		tracks?.audio?.length > 2 && ['HeadphonesIcon', 'Audio', () => pick('audio', 'Audio')],
	].filter(Boolean) as [string, string, () => void][]

	return (
		<View>
			{mute}
			<View
				style={[
					{ position: 'absolute', gap: 12 },
					width > height
						? { bottom: 44, right: 0 }
						: { top: 0, right: 44, flexDirection: 'row', width: rows.length * 44 - 12 },
				]}
			>
				{rows.map(([name, label, onPress]) =>
					cloneElement(mute, {
						key: name,
						accessibilityLabel: label,
						source: getAssetIdByName(name),
						onPress,
					}),
				)}
			</View>
		</View>
	)
}

let modal: any
function viewerModule() {
	if (modal) return modal
	const [found] = lookupModule(withProps<any>('openMediaModal'))
	if (found) return (modal = found)
	const [, sheets] = lookupModule(withProps<any>('openLazy'))
	const [, screens] = lookupModule(withProps<any>('pushLazy'))
	for (let id = 0; id < 40000; id++) {
		const deps = getModuleDependencies(id as any) as any
		if (!deps || deps.length > 30 || isModuleInitialized(id as any)) continue
		if (!deps.includes(sheets) || !deps.includes(screens)) continue
		try {
			const loaded = (globalThis as any).__r(id)
			if (loaded?.openMediaModal) return (modal = loaded)
		} catch {}
	}
}

function openViewer(raw: string) {
	const at = JSON.parse(raw)
	if (at.type !== 'open') return
	try {
		showViewer(at)
	} catch {
		stage('missed')
	}
}

function showViewer(at: any) {
	const match = /attachments\/(\d+)\/(\d+)\/([^?]+)/.exec(at.url)
	if (!match) throw new Error('no attachment')
	const [, channelId, attachmentId, filename] = match
	const [store] = lookupModule(withProps<any>('getMessage', 'getMessages'))
	const [channels] = lookupModule(withProps<any>('getChannel', 'getBasicChannel'))
	const modal = viewerModule()
	const message = store
		?.getMessages?.(channelId)
		?.toArray?.()
		.find((item: any) => item.attachments?.some((a: any) => a.id === attachmentId))

	spots.set(at.url, at.at)
	if (at.frame) frames.set(at.url, at.frame)
	viewing = true
	modal.openMediaModal({
		onClose: () => stage('leaving'),
		disableDownload: false,
		initialIndex: 0,
		analyticsSource: 'Channel',
		channelId,
		originViewOrOriginLayout: {
			x: at.x,
			y: at.y,
			width: at.width,
			height: at.height,
			resizeMode: 'contain',
		},
		initialSources: [
			{
				uri: at.poster ? `file://${at.poster}` : at.url,
				videoURI: at.url,
				sourceURI: at.url,
				shareURI: at.url,
				messageId: message?.id,
				guildId: channels?.getChannel?.(channelId)?.guild_id ?? null,
				channelId,
				filename: decodeURIComponent(filename),
				mediaIndex: 0,
				mediaViewIndex: 0,
				width: Math.round(at.width * 3),
				height: Math.round(at.height * 3),
				contentType: 'video/mp4',
				accessoryType: 'attachment',
				spoiler: false,
				obscure: false,
				attachmentId,
			},
		],
	})
}

function watchTaps({ Gesture }: any) {
	const proto = Object.getPrototypeOf(Gesture.Tap())
	const real = proto.numberOfTaps
	proto.numberOfTaps = function (count: number) {
		const out = real.call(this, count)
		if (count !== 2) return out
		const start = this.onStart
		this.onStart = function (run: (event: any) => void) {
			return start.call(this, (event: any) => {
				const third = Dimensions.get('window').width / 3
				const side = event.absoluteX < third || event.absoluteX > third * 2
				if (current && side) stage('skip', current, event.absoluteX > third)
				else run(event)
			})
		}
		return out
	}
	return () => {
		proto.numberOfTaps = real
	}
}

export function watchViewer(cleanup: (...items: any[]) => void) {
	let wait: ReturnType<typeof setTimeout>
	const hello = () =>
		stage('ready', true).then(all => {
			if (all == null) {
				wait = setTimeout(hello, 2000)
				return
			}
			state.all = all
			state.up = true
		})
	hello()

	const events = DeviceEventEmitter.addListener('mlemvlc', openViewer)
	const save = (args: any[], real: (...args: any[]) => any, id: any) => {
		const source = args[0]
		const url = source?.videoURI ?? source?.sourceURI ?? source
		if (typeof url !== 'string' || !ours(url)) return real(...args)
		stage('save', url, source?.filename ?? decodeURIComponent(url.split('?')[0].split('/').pop() ?? 'video'))
		saved(id)
		return Promise.resolve(true)
	}

	cleanup(
		() => {
			clearTimeout(wait)
			state.up = false
			events.remove()
			stage('ready', false)
		},
		getModules(withProps<any>('Gesture', 'GestureDetector'), mod => cleanup(watchTaps(mod)), { max: 1 }),
		getModuleWithImportedPath<any>('components_native/common/Video.tsx', mod => {
			cleanup(
				insteadJSX(mod.VideoComponent, ([type, props, key], jsx: any) =>
					props.controls && ours(props.source?.uri)
						? jsx(VlcVideo, props, key)
						: jsx(type, props, key),
				),
			)
		}),
		getModuleWithImportedPath<any>(
			'modules/media_viewer/native/components/openMediaModal.tsx',
			mod => {
				cleanup(
					before(mod, 'openMediaModal', args => {
						const opts = args[0]
						if (opts?.initialSources?.some((s: any) => ours(s.videoURI))) viewing = true
						if (opts?.initialSources?.some((s: any) => s.portal && ours(s.videoURI))) {
							args[0] = {
								...opts,
								initialSources: opts.initialSources.map((s: any) =>
									ours(s.videoURI) ? { ...s, portal: undefined } : s,
								),
							}
						}
						return args
					}),
				)
			},
		),
		getModuleWithImportedPath<any>(
			'modules/media_viewer/native/MediaSourceUtil.tsx',
			(mod, moduleId) => {
				cleanup(
					instead(mod, 'downloadMediaAsset', (args, real) => save(args, real, moduleId)),
					instead(mod, 'downloadMediaAssetWithContentType', (args, real) =>
						save(args, real, moduleId),
					),
				)
			},
		),
		getModules(
			withProps<any>('SafeAreaPaddingView'),
			mod => {
				cleanup(
					insteadJSX(mod.SafeAreaPaddingView, ([type, props, key], jsx: any) => {
						const mute = props.children
						const ours = viewing && mute?.props?.accessibilityRole === 'button' && mute.props.onPress
						return jsx(
							type,
							ours ? { ...props, children: jsx(Buttons, { mute }) } : props,
							key,
						)
					}),
				)
			},
			{ max: 1 },
		),
	)
}
