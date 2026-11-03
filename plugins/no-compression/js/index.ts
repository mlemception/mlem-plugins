import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after, before, instead } from '@valenced/patcher'
import { TurboModuleRegistry } from 'react-native'
import { call, info, shrink } from './video'

let sizes: any
let files: any
let limits: any
let label = ''

async function sizeOf(uri: string) {
	try {
		return await files.getFileSize(uri)
	} catch {
		return 0
	}
}

function limit() {
	try {
		return limits.getEffectiveUploadLimit(sizes.maxFileSize())
	} catch {
		return Number.POSITIVE_INFINITY
	}
}

export default plugin({
	start({ cleanup }) {
		const media = TurboModuleRegistry.get<any>('NativeMediaManagerModule')

		cleanup(
			getModuleWithImportedPath<any>(
				'modules/messages/native/renderer/RowGenerator.tsx',
				mod => {
					cleanup(
						after(mod.default.prototype, 'generate', (row: any) => {
							const text = row?.message?.timestamp
							if (
								typeof text === 'string' &&
								text &&
								text !== label &&
								!/\d/.test(text)
							) {
								label = text
								call('mlemnc.run', ['label', text]).catch(() => {})
							}
							return row
						}),
					)
				},
			),
			getModules(
				withProps<any>('maxFileSize', 'classifyFile'),
				mod => {
					sizes = mod
				},
				{ max: 1 },
			),
			getModules(
				withProps<any>('getFileSize', 'getVideoQuality'),
				mod => {
					files = mod
					cleanup(
						before(mod.default, 'openImagePicker', args => {
							if (args[0]?.size === 256) args[0] = { ...args[0], size: 1024 }
							return args
						}),
					)
				},
				{ max: 1 },
			),
			getModules(
				withProps<any>('getEffectiveUploadLimit'),
				mod => {
					limits = mod
				},
				{ max: 1 },
			),
			getModules(
				withProps<any>('shouldCheckUploadSizeOnlyAfterCompression'),
				mod => {
					cleanup(
						instead(
							mod,
							'shouldCheckUploadSizeOnlyAfterCompression',
							() => true,
						),
					)
				},
				{ max: 1 },
			),
			instead(media, 'getVideoMetadata', async (args: any[], real: any) => {
				const meta = await real(...args)
				info.set(args[0], meta)
				return meta
			}),
			instead(
				media,
				'resolveToMediaFilePath',
				async ([uri, options]: any[], real: any) => {
					const max = limit()
					const size = await sizeOf(uri)
					if (options?.encodingConfig) {
						if (size <= max)
							return real(uri, { ...options, skipVideoTranscode: true })
						return (await shrink(uri, max)) ?? real(uri, options)
					}
					if (size > max) return real(uri, options)
					return real(uri, {
						...options,
						allowOptimization: false,
						isLowQuality: false,
						compressionQuality: 1,
					})
				},
			),
		)
	},
})
