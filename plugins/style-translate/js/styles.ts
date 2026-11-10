import { transforms } from './local'

export type Kind = 'at' | 'fx' | 'ai'

export interface Style {
	id: string
	name: string
	emoji: string
	kind: Kind
	group: string
	post?: number
	fx?: string
	prompt?: string
	sample?: string
}

export interface Custom {
	id: string
	name: string
	emoji: string
	prompt: string
}

export interface Saved {
	post: number
	name: string
}

const at = (
	group: string,
	id: string,
	name: string,
	emoji: string,
	post: number,
	sample: string,
): Style => ({ id, name, emoji, kind: 'at', group, post, sample })

const fx = (id: string, name: string, emoji: string): Style => ({
	id: `fx:${id}`,
	name,
	emoji,
	kind: 'fx',
	group: 'Instant',
	fx: id,
	sample: transforms[id]('Hello there'),
})

export const groups = [
	'Classics',
	'Internet',
	'Characters',
	'Moods',
	'Fancy',
	'Accents',
	'Instant',
]

export const builtin: Style[] = [
	at('Classics', 'pirate', 'Pirate', '🏴‍☠️', 17189, 'Ahoy, me hearties!'),
	at('Classics', 'shakespeare', 'Shakespeare', '🎭', 19793, 'Prithee, hear me'),
	at('Classics', 'yoda', 'Yoda', '🟢', 260645, 'Strong with this one'),
	at('Classics', 'medieval', 'Medieval', '⚔️', 17757, 'Hark, good sir'),
	at('Classics', 'old-english', 'Old English', '📜', 337, 'Hwæt! Wes hāl'),
	at('Classics', 'caveman', 'Caveman', '🦴', 17190, 'Me hungry. Ugh.'),
	at('Classics', 'cowboy', 'Cowboy', '🤠', 16077, 'Howdy, partner'),
	at(
		'Classics',
		'victorian',
		'Victorian',
		'🎩',
		20963,
		'How perfectly dreadful',
	),
	at('Classics', 'knight', 'Knight', '🛡️', 16122, 'For honour!'),

	at('Internet', 'uwu', 'UwU', '🥺', 16453, 'hewwo fwiends >w<'),
	at('Internet', 'owo', 'OwO', '🐾', 24236, 'OwO whats this'),
	at('Internet', 'gen-z', 'Gen Z', '💅', 16308, 'no cap fr fr'),
	at('Internet', 'gen-alpha', 'Gen Alpha', '📱', 17105, 'thats so skibidi'),
	at('Internet', 'brainrot', 'Brainrot', '🧠', 16156, 'ohio rizz gyatt'),
	at('Internet', 'rizz', 'Rizz', '😏', 18441, 'you dropped this 👑'),
	at('Internet', 'sigma', 'Sigma', '🗿', 20297, 'grindset only'),
	at('Internet', 'valley-girl', 'Valley Girl', '💁‍♀️', 21686, 'like, totally'),
	at('Internet', 'emoji', 'Emoji', '😂', 315, '👋😃🎉'),
	at('Internet', 'boomer', 'Boomer', '👴', 25167, 'Back in my day...'),

	at('Characters', 'gollum', 'Gollum', '💍', 42122, 'my precioussss'),
	at('Characters', 'minion', 'Minion', '🍌', 22000, 'Bello! Banana!'),
	at('Characters', 'villain', 'Villain', '😈', 27215, 'You fool...'),
	at('Characters', 'vampire', 'Vampire', '🧛', 26221, 'I vant to...'),
	at('Characters', 'wizard', 'Wizard', '🧙', 20147, 'By my beard!'),
	at(
		'Characters',
		'dungeon-master',
		'Dungeon Master',
		'🎲',
		328172,
		'Roll for initiative',
	),
	at(
		'Characters',
		'noir',
		'Noir Detective',
		'🕵️',
		316399,
		'The rain never stops',
	),
	at('Characters', 'robot', 'Robot', '🤖', 17218, 'BEEP. GREETINGS.'),
	at('Characters', 'cat', 'Cat', '🐱', 16011, 'meow meow mrrp'),
	at('Characters', 'dog', 'Dog', '🐶', 17243, 'woof! hi! ball?'),

	at('Moods', 'dramatic', 'Dramatic', '😱', 38022, 'I cannot go on'),
	at(
		'Moods',
		'passive-aggressive',
		'Passive-aggressive',
		'🙂',
		31033,
		'Per my last message',
	),
	at('Moods', 'sarcastic', 'Sarcastic', '🙄', 19368, 'Oh, wonderful'),
	at('Moods', 'angry', 'Angry', '😤', 16070, 'ARE YOU KIDDING'),
	at('Moods', 'flirty', 'Flirty', '😘', 20253, 'hey you ;)'),
	at('Moods', 'cute', 'Cute', '🌸', 17461, 'hiii friend!!'),
	at('Moods', 'therapist', 'Therapist', '🛋️', 44522, 'And how does that feel?'),
	at('Moods', 'drunk', 'Drunk', '🍺', 16710, 'i lovv yu guys'),

	at('Fancy', 'formal', 'Formal', '👔', 16459, 'I hereby inform you'),
	at('Fancy', 'posh', 'Overly posh', '🫖', 20657, 'Most splendid indeed'),
	at('Fancy', 'verbose', 'Mega verbose', '📚', 256121, 'Allow me to elaborate'),
	at('Fancy', 'corporate', 'Corporate', '💼', 202656, "Let's circle back"),
	at('Fancy', 'linkedin', 'LinkedIn', '📈', 296831, "I'm humbled to announce"),
	at('Fancy', 'poetic', 'Poetic', '🪶', 19632, 'O gentle evening'),
	at('Fancy', 'haiku', 'Haiku', '🍃', 38725, 'five, seven, then five'),
	at('Fancy', 'rhyme', 'Rhyme', '🎶', 16709, 'a rhyme every time'),
	at('Fancy', 'news', 'News Anchor', '📺', 36801, 'Breaking news tonight'),

	at('Accents', 'australian', 'Australian', '🦘', 18103, "G'day mate"),
	at('Accents', 'british', 'British', '💂', 17270, 'Fancy a cuppa?'),
	at('Accents', 'scottish', 'Scottish', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 16140, 'Och aye'),
	at('Accents', 'cockney', 'Cockney', '🫖', 23029, "Apples an' pears"),
	at('Accents', 'southern', 'Southern', '🍑', 19746, "Bless your heart, y'all"),
	at('Accents', 'surfer', 'Surfer', '🏄', 54036, 'Gnarly, dude'),

	fx('mock', 'Mocking', '🧽'),
	fx('small', 'Small caps', 'ᴀ'),
	fx('wide', 'Vaporwave', '🌴'),
	fx('cursive', 'Cursive', '𝓐'),
	fx('gothic', 'Gothic', '𝕬'),
	fx('bold', 'Bold', '𝐁'),
	fx('bubble', 'Bubbles', 'Ⓐ'),
	fx('flip', 'Upside down', '🙃'),
	fx('back', 'Backwards', '🔁'),
	fx('leet', 'L33t', '👾'),
	fx('clap', 'Clap', '👏'),
	fx('spaced', 'Spaced', '↔️'),
	fx('strike', 'Strikethrough', '✂️'),
	fx('zalgo', 'Cursed', '👹'),
]

const byId = new Map(builtin.map(s => [s.id, s]))

export function fromCustom(c: Custom): Style {
	return {
		id: c.id,
		name: c.name || 'Untitled',
		emoji: c.emoji || '✨',
		kind: 'ai',
		group: 'Yours',
		prompt: c.prompt,
		sample: c.prompt,
	}
}

export function fromSaved(s: Saved): Style {
	return {
		id: `at:${s.post}`,
		name: s.name,
		emoji: '',
		kind: 'at',
		group: 'Saved',
		post: s.post,
	}
}

export function findStyle(
	id: string | undefined,
	customs: Custom[] = [],
	saved: Saved[] = [],
): Style | undefined {
	if (!id) return
	const b = byId.get(id)
	if (b) return b
	const c = customs.find(x => x.id === id)
	if (c) return fromCustom(c)
	const s = saved.find(x => `at:${x.post}` === id)
	if (s) return fromSaved(s)
}
