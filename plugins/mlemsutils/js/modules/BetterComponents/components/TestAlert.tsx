import { Design } from '@valenced/discord/design'

export default function TestAlert() {
	const { AlertModal, AlertActionButton } = Design

	return (
		<AlertModal
			title="Confirm"
			content="The quick brown fox would like to jump over the lazy dog. Allow?"
			actions={
				<>
					<AlertActionButton
						text="Allow"
						variant="primary"
						onPress={() =>
							new Promise<void>(res => {
								setTimeout(res, 5000)
							})
						}
					/>
					<AlertActionButton text="Dismiss" variant="secondary" />
					<AlertActionButton text="Tell off" variant="secondary" />
				</>
			}
		/>
	)
}
