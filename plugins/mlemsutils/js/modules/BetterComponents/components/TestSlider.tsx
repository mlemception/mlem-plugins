import { Design } from '@valenced/discord/design'
import { useState } from 'react'
import { View } from 'react-native'

export default function TestSlider() {
	const { AlertModal, AlertActionButton, Slider } = Design
	const [value, setValue] = useState(50)

	return (
		<AlertModal
			title="Slider"
			content={`${value}`}
			extraContent={
				<View style={{ height: 44 }}>
					<Slider
						value={value}
						minimumValue={0}
						maximumValue={100}
						step={5}
						onValueChange={setValue}
					/>
				</View>
			}
			actions={<AlertActionButton text="Dismiss" variant="secondary" />}
		/>
	)
}
