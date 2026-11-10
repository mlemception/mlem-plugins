import { getAssetIdByName } from '@valenced/assets'
import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { afterJSX } from '@valenced/react/jsx-runtime'
import {
	cloneElement,
	createContext,
	createElement,
	useContext,
	useEffect,
} from 'react'
import { useWindowDimensions, View } from 'react-native'
import { openSheet, speed, useOpen, useRate } from './speed'

const Viewer = createContext(false)

function Rated({ real, ...props }: any) {
	const inside = useContext(Viewer)
	const rate = useRate()

	useEffect(() => {
		if (inside) return speed.enter()
	}, [inside])

	return createElement(real, inside ? { ...props, rate } : props)
}

function Mute({ mute }: any) {
	const open = useOpen()
	const { width, height } = useWindowDimensions()
	if (!open) return mute

	return (
		<View>
			{mute}
			<View
				style={[
					{ position: 'absolute' },
					width > height ? { bottom: 44, right: 0 } : { top: 0, right: 44 },
				]}
			>
				{cloneElement(mute, {
					accessibilityLabel: 'Speed',
					source: getAssetIdByName('SpeedometerIcon'),
					onPress: openSheet,
				})}
			</View>
		</View>
	)
}

export function watchViewer(cleanup: (...items: any[]) => void) {
	cleanup(
		getModules(
			withProps<any>('FilterType', 'DRMType', 'TextTrackType'),
			mod => {
				cleanup(
					afterJSX(mod.default, el =>
						createElement(Rated, { ...el.props, real: el.type, key: el.key }),
					),
				)
			},
			{ max: 1 },
		),
		getModuleWithImportedPath<any>(
			'components_native/common/Video.tsx',
			mod => {
				cleanup(
					afterJSX(mod.VideoComponent, el =>
						el.props?.controls
							? createElement(Viewer.Provider, { value: true, key: el.key }, el)
							: el,
					),
				)
			},
		),
		getModules(
			withProps<any>('SafeAreaPaddingView'),
			mod => {
				cleanup(
					afterJSX(mod.SafeAreaPaddingView, el => {
						const mute = el.props.children
						const ours =
							mute?.props?.accessibilityRole === 'button' && mute.props.onPress
						return ours
							? createElement(el.type, {
									...el.props,
									key: el.key,
									children: createElement(Mute, { mute }),
								})
							: el
					}),
				)
			},
			{ max: 1 },
		),
	)
}
