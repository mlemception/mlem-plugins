import { Alert, NativeModules } from 'react-native'

const api = 'https://catbox.moe/user/api.php'

function pick(): Promise<any> {
	const picker = NativeModules.ImagePickerManager
	if (!picker?.launchImageLibrary)
		return Promise.reject(new Error("couldn't open the photo picker"))

	return new Promise(done =>
		picker.launchImageLibrary(
			{
				mediaType: 'photo',
				videoQuality: 'high',
				quality: 1,
				maxWidth: 0,
				maxHeight: 0,
				includeBase64: false,
				cameraType: 'back',
				selectionLimit: 1,
				saveToPhotos: false,
				durationLimit: 0,
				includeExtra: false,
				presentationStyle: 'pageSheet',
				selection: [],
				useNewIOSPicker: true,
				forceGetContent: false,
				enableAndroidPhotoPicker: false,
			},
			done,
		),
	)
}

async function send(file: { uri: string; name: string; type: string }) {
	let text = ''
	let status = 0
	for (let i = 0; i < 3; i++) {
		if (i) await new Promise(r => setTimeout(r, 1500))
		const body = new FormData()
		body.append('reqtype', 'fileupload')
		body.append('fileToUpload', file as any)
		const res = await fetch(api, { method: 'POST', body })
		status = res.status
		text = (await res.text()).trim()
		if (res.ok && /^https:\/\/\S+$/.test(text)) return text
		if (status === 412 || status === 413)
			throw new Error('too big for catbox (200 MB max)')
		if (status >= 400 && status < 500) break
	}
	if (status >= 500 || /<html/i.test(text))
		throw new Error('catbox is down right now, try again later')
	throw new Error(text.slice(0, 100) || 'catbox sent back nothing, try again')
}

export async function uploadImage(onStart: () => void) {
	try {
		const res = await pick()
		if (res?.didCancel) return
		if (res?.errorCode) throw new Error(res.errorMessage ?? res.errorCode)
		const a = res?.assets?.[0]
		if (!a?.uri) return

		onStart()
		return await send({
			uri: a.uri,
			name: a.fileName ?? 'image.png',
			type: a.type ?? 'image/png',
		})
	} catch (e: any) {
		Alert.alert('Upload failed', String(e?.message ?? e))
	}
}
