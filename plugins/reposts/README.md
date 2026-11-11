# reposts

hold a message, tap repost, and it shows up in a reposts tab on your profile. other people with the plugin see that tab on your profile too. repost anonymously to leave out who wrote it.

## using it

- hold any message: **Repost** or **Repost Anonymously** sit right under Forward. tap again later to remove it
- your reposts are in the **Reposts** tab on your profile (the sheet and the You tab)
- tap a repost to jump to the original when you can see it. long ones open in a sheet with jump to message (verified only) and copy text
- tap a picture or video to open it in discord's own viewer, with the author and message underneath like in chat
- link embeds (youtube, articles, images, catbox videos and so on) are kept with the repost and drawn like discord draws them
- hold a repost for copy, jump to message, view author, hide author, remove
- on someone else's reposts you can hide one just for you or report it. if you wrote the message you can take it off their profile
- settings has log out, "let people repost my messages", and delete everything

each repost shows whether it checks out against the original:

- **Verified**: you can see the original and it matches
- **Edited since**: the original was edited after the repost
- **Original deleted**
- **Doesn't match**: you can see the original and it's different, so it was faked or changed
- **Unverified**: you can't see the original channel, so there's nothing to check against

names, avatars and channel names are looked up live, so renames just work. attachment links are refreshed through discord when they expire. deleted files show a placeholder

## setup

you need a cloudflare account (free plan is fine) and a discord application.

1. **discord app**: go to https://discord.com/developers/applications, make a new application. under OAuth2 add a redirect: `https://<your worker url>/v1/auth/callback`. copy the client id and client secret
2. **kv**: in `worker/`, run `bun install`, then `npx wrangler kv namespace create reposts` and put the id in `wrangler.jsonc` under `kv_namespaces`
3. **url**: set `PUBLIC_URL` in `wrangler.jsonc` to where the worker will live. a custom domain on a zone you own is best (`reposts.example.com`). edge caching does nothing on workers.dev, everything still works there, just with more kv reads
4. **secrets**:
   ```
   npx wrangler secret put DISCORD_CLIENT_ID
   npx wrangler secret put DISCORD_CLIENT_SECRET
   npx wrangler secret put SESSION_KEY
   ```
   `SESSION_KEY` is any random string of 32+ chars, e.g. `openssl rand -base64 48`. changing it logs everyone out
5. **deploy**: `npx wrangler deploy`. if you went with a custom domain, add it under the worker's domains and routes. check `https://<url>/v1/health` says ok
6. **plugin**: set `API_URL` and `CLIENT_ID` in `js/config.ts`, then build like the other plugins

never set `DEV_LOGIN` on the deployed worker. it's only for `wrangler dev` (see `worker/.dev.vars.example`) and lets anyone log in as anyone.

### local testing

```
cd worker
cp .dev.vars.example .dev.vars
bun run dev
bun run test
```

the tests run against the local worker and cover auth, private reposts, opt out, takedowns, reports, logout, delete everything and rate limits.

## how it works

**login**: the plugin asks discord for an oauth code with the `identify` scope through your own discord session, after you agree in a sheet that shows the real app. the worker swaps the code for your user id and revokes the discord token straight away. you get a signed session good for 60 days that renews itself while you use it. if the in-app login fails it offers the normal browser login instead.

**storage**: one kv value per user holds all their reposts. each repost is ids plus the text, attachment names and a trimmed copy of its link embeds (title, description, provider, color and media). embed media is only kept if it's on discord's own media proxy, so opening a profile never loads anything from a random site. names, avatars, guild and channel names are never stored. message ids already have the time in them. anonymous reposts never store the author id, not on the server and not on your phone. the plugin sends the author id once so the worker can check they haven't opted out, then it's dropped.

**caching**: reposting is instant, it changes the ui right away and syncs in the background (batched, retried with backoff, rolled back with a toast if the server says no). there's one small index of who has reposts, keyed by a salted hash of their id, so opening a profile with no reposts costs nothing. each person's list is cached on the phone with a revision from the index, so reopening is instant and only refetches when something changed. your own reposts show up instantly. other people's can lag up to a few minutes. verification results and refreshed attachment links are cached too.

**free tier**: kv allows 1,000 writes a day. each batch of reposting costs one write, and each user is capped at 150 writes a day plus 20 a minute. reads are 100k a day and the index is one list call per 5 minutes per data center. tens of users won't get anywhere near it. past a few hundred active users the writes are the first wall, and the fix is workers paid or moving storage to a durable object.

**wire format**: everything has a version. the worker refuses requests from a newer format with a clear error, and the plugin tells you to update if the worker is newer. unknown fields are ignored on both sides so small additions don't break old installs.

## what's protected and what isn't

- every read and write needs a reposts login, which needs a discord account. you can only ever change your own reposts
- the endpoints are rate limited per user, and per ip for login
- read responses are scrambled and the index only has hashed ids, so you can't just open the url in a browser or proxy and read everything as json
- that scrambling is not encryption. the key is in the plugin. someone who logs in and reads the plugin can decode it and look up the reposts of anyone whose id they know. treat reposts like anything else you post in a place lots of people can see
- private messages you repost publicly can be seen by anyone with the plugin who looks at your profile. that's on the person reposting, the same as a screenshot
- verification only works if the viewer can see the original. if they can't it says unverified, it never pretends
- the worker checks ids look real (message not from the future, author older than the message), but it can't read discord messages itself, so a faked repost of a channel nobody can see stays "unverified"
- opting out blocks new reposts of your messages, private ones included, and hides existing public reposts of you. existing anonymous reposts can't be found because nothing links them to you, so they stay until reported
- reports hide something for the reporter right away and for everyone after 3 reports. there's no admin ui. reports are kept 90 days as `rep:` keys in kv

## credits

repost icon drawn for this plugin in the style of discord's icon set
