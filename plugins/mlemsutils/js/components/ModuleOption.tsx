import { Design } from '@valenced/discord/design'
import { useMemo } from 'react'
import { Forms, icon } from '../lib/common'
import { ActionSheet } from '../lib/components/ActionSheet'
import ChooseSheet from '../lib/components/sheets/ChooseSheet'
import { TrailingText } from '../lib/components/Text'
import type { AnyModule } from '../stuff/Module'

function call(val: any, ...args: any[]) {
	return typeof val === 'function' ? val(...args) : val
}

export function ModuleOption({
	module,
	id,
}: {
	module: AnyModule
	id: string
}) {
	const storage = module.storage.options as any
	const setting = useMemo(() => module.settings[id]!, [module, id])
	module.useRefresh()

	if (setting.predicate && !setting.predicate.bind(module)()) return null

	const { FormRow, FormSwitchRow } = Forms
	const leading = <FormRow.Icon source={icon(setting.icon ?? 'PencilIcon')} />
	const cfg = {
		disabled: setting.disabled,
		style: setting.disabled ? { opacity: 0.5 } : undefined,
	}

	if (setting.type === 'toggle') {
		return (
			<FormSwitchRow
				label={setting.label}
				subLabel={call(setting.subLabel, storage[id])}
				leading={leading}
				value={storage[id]}
				onValueChange={() => {
					if (cfg.disabled) return
					storage[id] = !storage[id]
					module.restart()
				}}
				{...cfg}
			/>
		)
	}

	if (setting.type === 'choose') {
		return (
			<FormRow
				label={setting.label}
				subLabel={call(setting.subLabel, storage[id])}
				leading={leading}
				trailing={<TrailingText>{storage[id]}</TrailingText>}
				onPress={() => {
					if (cfg.disabled) return
					ActionSheet.open(ChooseSheet, {
						title: setting.label,
						value: storage[id],
						options: setting.choices.map(x => ({ name: x, value: x })),
						callback: val => {
							storage[id] = val
							module.restart()
						},
					})
				}}
				{...cfg}
			/>
		)
	}

	if (setting.type === 'button') {
		const { Button } = Design as any
		return (
			<Button
				text={setting.label}
				icon={setting.icon ? icon(setting.icon) : undefined}
				onPress={() => !cfg.disabled && setting.action.bind(module)()}
				{...cfg}
				style={[cfg.style, { padding: 16 }]}
			/>
		)
	}

	return null
}
