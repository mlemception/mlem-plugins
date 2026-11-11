# mlem plugins

plugins for valenced

## mlem's utils

based on [NexxUtils](https://github.com/nexpid/RevengePlugins/tree/main/src/plugins/nexxutils)


## vlc player

plays discord videos in vlc. the engine is unmodified [libVLC](https://code.videolan.org/videolan/libvlcjni) 3.7.7, LGPL 2.1, and downloads on first use

## chat buttons

puts the chat bar buttons in one menu, like the + one. you can give them nicknames or keep some on the bar. a little dot shows on the menu when something in it is turned on

## no compression

sends images and videos as they are if they fit your upload limit, and stops avatars getting cropped to 256px. videos over the limit get squeezed down on your phone to just under it, keeping the full framerate, with an eta next to sending. uses [media3](https://github.com/androidx/media) (apache 2.0)

## playback speed

adds a speed button next to mute when watching a video, from 0.25x to 2x. the default speed in its settings also goes for videos playing in chat

## message latency

puts little signal bars next to someone's name when their message took a while to send. tap them to see how late it was. yellow when it's slow, red when it's really slow, green for people on the old discord android app. you can turn on always show to get green bars on every message too. based on [MessageLatency](https://github.com/Vendicated/Vencord/tree/main/src/plugins/messageLatency) by arHSM

## mlembar

puts any image or gif behind your youbar instead of your nameplate, or hides the nameplate. paste a link in its settings or upload a pic from your phone, it goes to catbox. based on BetterYouBar by j from [rain](https://codeberg.org/raincord/rain)

## hide welcome messages

hides the "x is here." messages when someone joins a server. can also hide the wave sticker replies to them and just show how many got hidden, in its settings

## better folders

opens server folders in their own column next to your server list, and the channel list slides over to make room the same way discord slides its panels. hold a server or the folder in it for the usual menu, swipe left on it to close. can also keep one folder open at a time, close folders when you pick a server, show folder icons in the server list and more in its settings. based on [BetterFolders](https://github.com/Vendicated/Vencord/tree/main/src/plugins/betterFolders) by juby, AutumnVN and Nuckyz

## catbox upload

attach stuff like normal. if something is over your upload limit it goes up to catbox when you hit send, and the message waits in a little card until it is done, then posts with the link. reply stays on whoever you replied to. the link can be pasted as is, hidden so only the preview shows, or as a tiny dot. litterbox works too if you want links that expire

## style translate

rewrites your messages as a pirate, shakespeare, yoda, uwu and a bunch more before they send. tap the button in the chat bar to pick one and see how it comes out, or keep one on for a chat. you can search anythingtranslate for more styles or describe your own and have ai write it. based on [StyleTranslate](https://github.com/Myarcer/vencord-styletranslate) by Nyarc

## game session spoofer

shows you as playing any game discord can detect, for however long you want, without it running. you can say you already played for a while, line up a queue of games or throw random ones in. can also send the time to discord like a real game would so it counts toward the playtime badges. that part is off by default and can get your account banned, so only turn it on for an account you dont mind losing. just showing the game is the same as any custom status app. it's under valenced in settings. based on [gameSessionSpoofer](https://github.com/Accentaro/gameSessionSpoofer) by benjii

## chat heads

messenger style chat heads. when someone messages you while discord is in the background their pfp pops up as a bubble over whatever you're doing. tap it to jump to the chat, drag it around or throw it on the x to get rid of it. needs display over other apps, there's a button for it in its settings
