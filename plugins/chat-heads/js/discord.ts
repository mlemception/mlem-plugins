import { lookupModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { lookupModule, lookupModules } from '@valenced/modules/finders'
import { withDependencies, withProps } from '@valenced/modules/finders/filters'
import { TurboModuleRegistry } from 'react-native'

const warned = new Set<string>()
export function warn(what: string, e?: unknown) {
	if (warned.has(what)) return
	warned.add(what)
	console.warn(`[chat heads] ${what}`, e ?? '')
}

export function byProps<T = any>(...props: string[]): T | undefined {
	try {
		const m = lookupModule((withProps(...(props as [string])) as any).scope(4, 2))[0] as
			| T
			| undefined
		if (!m) warn(`missing module with ${props.join(', ')}`)
		return m
	} catch (e) {
		warn(`lookup failed for ${props.join(', ')}`, e)
	}
}

function idOf(...props: string[]): number | undefined {
	try {
		return lookupModule(withProps(...(props as [string])))[1] as
			| number
			| undefined
	} catch {}
}

const lazies = new Map<string, any>()
export function lazy<T = any>(
	path: string,
	anchors: string[][],
	min = 0,
	max = 0,
): T | undefined {
	if (lazies.has(path)) return lazies.get(path)
	const known = lookupModuleWithImportedPath(path)[0]
	if (known) {
		lazies.set(path, known)
		return known
	}
	const ids = anchors.map(a => idOf(...a))
	if (ids.some(i => i == null)) {
		warn(`no anchors for ${path}`)
		return
	}
	const { unordered, partial, atLeast, atMost } = withDependencies as any
	let deps = unordered(partial(ids as number[]))
	if (min) deps = atLeast(min, deps)
	if (max) deps = atMost(max, deps)
	try {
		for (const [exports, id] of lookupModules(
			withDependencies(deps),
		) as Iterable<[any, number]>) {
			if (lookupModuleWithImportedPath(path)[1] === id) {
				lazies.set(path, exports)
				return exports
			}
		}
	} catch (e) {
		warn(`lazy lookup failed for ${path}`, e)
		return
	}
	warn(`not found: ${path}`)
}

export const D = {
	get tokens() {
		return byProps('unsafe_rawColors', 'colors')
	},
	get mana() {
		return byProps(
			'SegmentedControl',
			'ToastContainer',
			'ThemeContextProvider',
			'useToken',
		)
	},
	get reanimated() {
		return byProps('useSharedValue', 'withSpring', 'useAnimatedStyle')
	},
	get sheet() {
		return byProps(
			'BottomSheetFlatList',
			'BottomSheetView',
			'useBottomSheetInternal',
		)
	},
	get gesture() {
		const g = globalThis as any
		if (g._RNGH_MODULE_ID == null)
			try {
				TurboModuleRegistry.getEnforcing('RNGestureHandlerModule')
			} catch (e) {
				warn('gesture handler module', e)
			}
		if (g._RNGH_MODULE_ID == null) {
			warn('no gesture handler module id')
			return
		}
		return byProps('GestureHandlerRootView')
	},
	get startup() {
		return byProps('initHeadlessTask', 'applicationReady')
	},
	get portal() {
		return byProps('PortalProvider', 'PortalHost')
	},
	get intl() {
		return byProps('intl', 't')
	},
	get keyboardStore() {
		return byProps('setKeyboardContext', 'addKeyboardTypeChangedListener')
			?.default
	},
	get refresh() {
		return byProps(
			'isMobileVisualRefreshEnabled',
			'MobileVisualRefreshExperiment',
		)
	},
	get dates() {
		return byProps('calendarFormat', 'accessibilityLabelCalendarFormat')
	},
	get fontScale() {
		return byProps('getFontScale', 'useFontScale')
	},
	get preview() {
		return byProps('formatMessagePreview', 'useFormattedMessagePreview')
	},
	get markup() {
		return byProps('renderMessagePreviewMarkup', 'getMessagePreviewASTParser')
	},
	get avatars() {
		return byProps('getDefaultAvatarURL', 'DEFAULT_AVATARS')
	},
	get ExpressionPicker() {
		return lazy('modules/expression_picker/native/ExpressionPicker.tsx', [
			['EmojiDisabledReasons'],
			['setKeyboardContext'],
			['KeyboardTypes'],
			['GIFPickerResultTypes'],
		])?.default
	},
	get messages() {
		return lazy(
			'actions/MessageActionCreators.tsx',
			[['GIFPickerResultTypes'], ['intl', 't']],
			80,
		)?.default
	},
	get parser() {
		return lazy(
			'modules/messages/MessageParser.tsx',
			[
				['EmojiDisabledReasons'],
				['GIFPickerResultTypes'],
				['GifAutoPlay'],
				['intl', 't'],
			],
			28,
			36,
		)?.default
	},
}

const hash = (s: string) => {
	let h = 5381
	for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) % 2147483647
	return 9000000000000 + h
}

export function worklet<T extends (...a: any[]) => any>(
	code: string,
	closure: Record<string, unknown>,
	js: T,
): T {
	const f = js as any
	f.__closure = closure
	f.__workletHash = hash(code)
	f.__initData = { code }
	return js
}
