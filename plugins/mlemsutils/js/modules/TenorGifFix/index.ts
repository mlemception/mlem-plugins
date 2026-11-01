import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { before } from '@valenced/patcher'
import { Module, ModuleCategory } from '../../stuff/Module'
import dark from './dark.png'
import light from './light.png'

function parseURL(url: string) {
	const path = url.split('/')
	const tenorIndex = path.findIndex(x => x.endsWith('.tenor.com'))
	if (tenorIndex === -1) return

	const [host, ...rest] = path.slice(tenorIndex)
	const prefix = rest[0] === 'm' ? 'm/' : ''
	const [id, file] = prefix ? rest.slice(1) : rest
	if (!host || !id || !file) return

	return `https://${host}/${prefix}${id.slice(0, -2)}AC/${file.split('.')[0]}.gif`
}

const fixDownload = (args: any) => {
	const url = args[0]
	if (!url || typeof url !== 'string') return args

	const parsed = parseURL(url)
	return parsed ? [parsed, 1, 'image/gif', ...args.slice(3)] : args
}

export default new Module({
	id: 'tenor-gif-fix',
	label: 'Tenor GIF Fix',
	meta: {
		sublabel:
			'Fixes a several-year old bug which downloads gifs from Tenor as videos instead of gif files',
		category: ModuleCategory.Fixes,
		icon: 'GifIcon',
		thumbnail: { dark: { uri: dark }, light: { uri: light } },
	},
	handlers: {
		onStart() {
			this.patches.add(
				getModules(
					withProps<any>(
						'downloadMediaAsset',
						'extractMediaSourcesFromMessage',
					),
					mod => {
						for (const name of [
							'downloadMediaAsset',
							'downloadMediaAssetWithContentType',
						]) {
							if (mod[name]) this.patches.add(before(mod, name, fixDownload))
						}
					},
					{ max: 1 },
				),
			)
			this.patches.add(
				getModules(
					withProps<any>('useMediaShareActions'),
					mod => {
						this.patches.add(
							before(mod, 'useMediaShareActions', args => {
								const source = args[0]?.source
								if (typeof source?.uri !== 'string') return args

								const parsed = parseURL(source.uri)
								if (!parsed) return args

								const { videoURI: _, ...rest } = source
								return [
									{ ...args[0], source: { ...rest, sourceURI: parsed } },
									...args.slice(1),
								] as any
							}),
						)
					},
					{ max: 1 },
				),
			)
		},
		onStop() {},
	},
})
