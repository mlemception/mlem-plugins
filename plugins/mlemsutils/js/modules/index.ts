import BetterComponents from './BetterComponents'
import ColorfulChannels from './ColorfulChannels'
import Minimod from './Minimod'
import NoInviteToServers from './NoInviteToServers'
import SendSpotifyInvite from './SendSpotifyInvite'
import SpotifyListenAlong from './SpotifyListenAlong'
import TenorGifFix from './TenorGifFix'
import type { AnyModule } from '../stuff/Module'

export default [
	BetterComponents,
	ColorfulChannels,
	Minimod,
	NoInviteToServers,
	SendSpotifyInvite,
	SpotifyListenAlong,
	TenorGifFix,
].sort((a, b) => (a.id < b.id ? -1 : 1)) as unknown as AnyModule[]
