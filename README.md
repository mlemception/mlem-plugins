# mlem plugins

plugins for valenced

## mlem's utils

based on [NexxUtils](https://github.com/nexpid/RevengePlugins/tree/main/src/plugins/nexxutils)


## vlc player

plays discord videos in vlc. the engine is unmodified [libVLC](https://code.videolan.org/videolan/libvlcjni) 3.7.7, LGPL 2.1, and downloads on first use

## chat buttons

puts the chat bar buttons in one menu, like the + one. you can give them nicknames or keep some on the bar

## no compression

sends images and videos as they are if they fit your upload limit, and stops avatars getting cropped to 256px. videos over the limit get squeezed down on your phone to just under it, keeping the full framerate, with an eta next to sending. uses [media3](https://github.com/androidx/media) (apache 2.0)

## playback speed

adds a speed button next to mute when watching a video, from 0.25x to 2x. the default speed in its settings also goes for videos playing in chat

## message latency

puts little signal bars next to someone's name when their message took a while to send. tap them to see how late it was. yellow when it's slow, red when it's really slow, green for people on the old discord android app. you can turn on always show to get green bars on every message too. based on [MessageLatency](https://github.com/Vendicated/Vencord/tree/main/src/plugins/messageLatency) by arHSM

## mlembar

puts any image or gif behind your youbar instead of your nameplate, or hides the nameplate. paste a link in its settings. based on BetterYouBar by j from [rain](https://codeberg.org/raincord/rain)

## hide welcome messages

hides the "x is here." messages when someone joins a server. can also hide the wave sticker replies to them and just show how many got hidden, in its settings

## better folders

opens server folders in their own column next to your server list, and the channel list slides over to make room the same way discord slides its panels. hold a server or the folder in it for the usual menu, swipe left on it to close. can also keep one folder open at a time, close folders when you pick a server, show folder icons in the server list and more in its settings. based on [BetterFolders](https://github.com/Vendicated/Vencord/tree/main/src/plugins/betterFolders) by juby, AutumnVN and Nuckyz
