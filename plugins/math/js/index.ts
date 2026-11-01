import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { before } from '@valenced/patcher'
import { solve } from './solve'

export default plugin({
	start({ cleanup }) {
		cleanup(
			getModules(
				withProps<any>('sendMessage', 'revealMessage'),
				mod => {
					cleanup(
						before(mod, 'sendMessage', args => {
							const msg = args[1]
							if (msg?.content)
								args[1] = { ...msg, content: solve(msg.content) }
							return args
						}),
					)
				},
				{ max: 1 },
			),
		)
	},
})
