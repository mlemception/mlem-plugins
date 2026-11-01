import { useState } from 'react'
import { Forms } from '../../common'
import { ActionSheet } from '../ActionSheet'

type Value = string | number | boolean | null

export default function ChooseSheet({
	title,
	value: initial,
	options,
	callback,
}: {
	title: string
	value: Value
	options: { name: string; description?: string; value: Value }[]
	callback: (v: any) => void
}) {
	const [value, setValue] = useState(initial)
	const { FormRow } = Forms

	return (
		<ActionSheet title={title}>
			{options.map(x => (
				<FormRow
					key={String(x.value)}
					label={x.name}
					subLabel={x.description}
					leading={<FormRow.Radio selected={x.value === value} />}
					onPress={() => {
						setValue(x.value)
						callback(x.value)
					}}
				/>
			))}
		</ActionSheet>
	)
}
