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

adds a speed button next to mute when watching a video, from 0.25x to 2x. you can set a default speed in its settings

## message latency

shows how late a message arrived next to it, like "(3s late)", when it took longer than a few seconds to send. yellow when it's slow, red when it's really slow. also spots people on the old discord android app. based on [MessageLatency](https://github.com/Vendicated/Vencord/tree/main/src/plugins/messageLatency) by arHSM

## mlembar

puts any image or gif behind your youbar instead of your nameplate, or hides the nameplate. paste a link in its settings. based on BetterYouBar by j from [rain](https://codeberg.org/raincord/rain)
