# KingGumption Stream Control

This Node.js application provides song requests, stream games, the Polaroid channel-point redeem, overlays, and shared analytics/admin controls. It supports both the original all-local workflow and a hybrid deployment with a hosted web service plus a tiny streaming-PC connector. Runtime settings are loaded from the project-root `.env` file by `src/app-config.js`.

Copy `.env.example` to `.env` when setting up another machine. The local `.env` file is deliberately ignored by Git and must never be committed.

Run everything with one command:

```powershell
npm start
```

The shared admin is at `http://127.0.0.1:8787/admin`.

## Hybrid cloud deployment

Hybrid mode keeps the dashboard, analytics database, Spotify integration, overlays, rendered Polaroids, and command logic online. The streaming PC runs only `src/connector.js`, which maintains one authenticated outbound WebSocket to the hosted service and relays OBS, Streamer.bot, and TikFinity traffic. No local ports are exposed to the internet, and OBS credentials remain on the streaming PC.

```text
Phone/browser -> hosted StreamEngagement + persistent data
                              |
                    authenticated WSS bridge
                              |
                 auto-starting PC connector
                    /          |          \
                  OBS    Streamer.bot   TikFinity
```

### 1. Deploy the hosted service on Render

1. Put this project in a private Git repository that Render can access.
2. In Render, create a Blueprint from [`render.yaml`](render.yaml). The Blueprint provisions a Node web service and a 1 GB persistent disk mounted at `/var/data`. A persistent disk requires a paid Render service and limits the service to one instance, which is appropriate for the SQLite database.
3. Supply `PUBLIC_BASE_URL` as the final HTTPS Render/custom-domain origin, with no path, for example `https://stream.example.com`.
4. Supply a long unique `ADMIN_PASSWORD` and the Spotify credentials. Render generates `SESSION_SECRET` and `BRIDGE_TOKEN`; reveal and securely copy the bridge token for the connector setup.
5. If Streamer.bot WebSocket authentication is enabled, set `STREAMERBOT_WS_PASSWORD` on Render. Set `STREAMERBOT_TIKTOK_REPLY_ACTION_ID` there if TikTok replies use that action.
6. Add `${PUBLIC_BASE_URL}/callback` to the Spotify developer application's redirect URI list. `SPOTIFY_REDIRECT_URI` defaults to that value automatically.
7. Open `${PUBLIC_BASE_URL}/admin`, sign in, and reconnect Spotify after migration if required.

The hosted service will refuse to start if its public URL is not HTTPS, the admin/session secrets are weak, or the bridge token is missing. Admin routes use a signed, HTTP-only, secure, same-site session cookie. Public overlay, event-stream, and Polaroid image URLs intentionally remain accessible so OBS and Discord can load them.

### 2. Migrate existing analytics and Polaroids

Run this locally while the current data is available:

```powershell
npm run export:cloud
```

The command creates an ignored `backups/cloud-migration-*` directory containing a consistent SQLite backup, the Polaroid configuration, and archived captures. Stop the Render service and securely copy the exported contents into `/var/data`, then restart it. Treat the export as sensitive because `polaroid-config.json` can contain webhook or OBS credentials. Once migration is confirmed, remove the OBS password from the cloud copy; the hosted runtime does not require it.

### 3. Install the streaming-PC connector

1. Keep Node.js, OBS, Streamer.bot, and TikFinity installed on the streaming PC.
2. Copy `.env.connector.example` to `.env` and set:

   ```env
   APP_MODE=connector
   CONNECTOR_CLOUD_URL=wss://your-host.example/bridge
   BRIDGE_TOKEN=<the exact Render bridge token>
   STREAMERBOT_WS_URL=ws://127.0.0.1:8080/
   TIKFINITY_WS_URL=ws://127.0.0.1:21213/
   POLAROID_OBS_PASSWORD=<local OBS WebSocket password>
   ```

3. Test it interactively with `npm run connector`. The hosted Dashboard should show **Connector**, **Streamer.bot**, and **TikFinity** as connected.
4. Install hidden Windows logon auto-start:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\install-connector-autostart.ps1
   ```

   Remove it later with the same command plus `-Remove`.
5. Change OBS browser-source URLs to `${PUBLIC_BASE_URL}/overlay`, `${PUBLIC_BASE_URL}/king-of-the-hill`, and `${PUBLIC_BASE_URL}/polaroid`.

The connector automatically reconnects to the cloud and each local WebSocket. When the PC is off, the hosted admin and historical analytics remain available; live OBS/TikFinity/Streamer.bot actions correctly show as offline.

## Polaroid redeem

Polaroid Redeem is integrated into this service. Its admin page is at `http://127.0.0.1:8787/admin/polaroid`, and its transparent OBS browser source is `http://127.0.0.1:8787/polaroid` at 1920 × 1080. The former port `8791` service is no longer required.

The existing Polaroid settings have been migrated to the ignored `data/polaroid-config.json`, archived captures are in `data/polaroid-captures`, and the custom wow audio is under `public/polaroid/audio`. Use `polaroid-config.example.json` as the safe template for future installations. Never commit `data/polaroid-config.json`, because it can contain the OBS password and Discord webhook.

The Polaroid feature shares this application's authenticated Streamer.bot connection. Configure its URL and optional password with `STREAMERBOT_WS_URL` and `STREAMERBOT_WS_PASSWORD` in `.env`. The reward name, camera source, rendering, overlay, Discord, avatar helper, and Twitch-link settings remain in `data/polaroid-config.json`. Environment variables `POLAROID_OBS_PASSWORD`, `POLAROID_CAMERA_SOURCE`, and `POLAROID_DISCORD_WEBHOOK` can override the corresponding sensitive settings.

The Polaroid OBS connection retries automatically every five seconds after startup failures or unexpected disconnects. Set `obs.reconnectDelayMs` in `data/polaroid-config.json` to change that interval.

After confirming the merged version works, remove the old `PolaroidRedeem` Browser Source and use the new `/polaroid` URL. The original sibling folder can remain as a backup but must not be started alongside this service, or each redemption will be processed twice.

## Spotify Setup

1. Create a Spotify developer application (already done for the current setup).
2. Add this exact redirect URI to the Spotify developer application:

   ```text
   http://127.0.0.1:8787/callback
   ```

3. Open `.env` in the project root.
4. Enter your own values in `.env`:

   ```env
   SPOTIFY_CLIENT_ID=<my client ID>
   SPOTIFY_CLIENT_SECRET=<my client secret>
   SPOTIFY_PLAYLIST_ID=<my playlist ID>
   ```

5. Keep `SPOTIFY_REDIRECT_URI=http://127.0.0.1:8787/callback` unchanged and save `.env`.
6. Start the application with `npm start`.
7. Click **Connect Spotify** on the Dashboard.
8. Approve the requested Spotify permissions.
9. Verify that the application reports Spotify as connected.

After the first approval, the refresh token is stored only in the ignored local SQLite database. The application validates the saved authorization on startup and refreshes expiring access tokens automatically. Spotify may require approval again if the authorization is revoked or the refresh token expires.

Do not put credentials in `.env.example`, chat messages, source code, or logs. Spotify access and refresh tokens are stored in the local SQLite runtime database and are never returned by the admin API.

`SPOTIFY_PLAYLIST_ID` supplies the initial target playlist. There is currently no runtime playlist-selection feature in this repository; if one is added later, it should override this default without hard-coding an ID.

## Other configuration

- `PORT`: localhost admin server port; defaults to `8787`.
- `TIKFINITY_WS_URL`: local TikFinity WebSocket endpoint.
- `STREAMERBOT_WS_URL`: local Streamer.bot WebSocket server endpoint.
- `STREAMERBOT_WS_PASSWORD`: optional Streamer.bot WebSocket password. Set it when authentication is enabled so the app can send Twitch/YouTube replies.
- `STREAMERBOT_TIKTOK_REPLY_ACTION_ID`: optional Streamer.bot action GUID used to forward confirmation messages to TikFinity.
- `SPOTIFY_CLEAN_ONLY`: supplies the initial explicit-track setting and defaults to `true`. The Dashboard's **Allow Explicit Tracks** toggle then saves the live setting locally and takes effect without a restart.
- `SPOTIFY_QUEUE_ENABLED`: defaults to `true`; accepted requests are also appended to the active Spotify device's live playback queue.
- `USER_COOLDOWN_SECONDS`: per-user command cooldown.
- `GLOBAL_COOLDOWN_SECONDS`: command-wide cooldown.
- `PLAYLIST_COMMAND_PUBLIC`: whether the playlist command is public by default.
- `DRY_RUN`: enables non-mutating behavior when supported by command integrations.

## Connection indicators

The admin page polls live connection state for TikFinity and Streamer.bot. A service is shown as connected only after its WebSocket emits an `open` event; disconnects and errors update the indicator immediately, and the service retries automatically. The page also shows the most recent connection and event timestamps.

Spotify is shown as connected only after its saved access token has been accepted by Spotify's profile API. Configuration and request-playlist readiness are reported separately from the authenticated connection.

## Analytics Studio

The shared analytics page is available at `http://127.0.0.1:8787/admin/analytics`. It combines Song Requests, King of the Hill, and Polaroid Redeem into selectable 7-day, 30-day, 90-day, yearly, and all-time reports. The overview includes period comparisons, daily engagement, real stream roundups, viewer/watch-time/retention signals, follow and subscription outcomes, platform mix, and per-tool viewer correlations. Dedicated views provide request outcomes and tracks, Hill games and round results, Polaroid reliability and captures, cross-tool audience overlap, role segments, stable viewer identities, and a searchable activity ledger.

Existing song request rows and archived Polaroid captures are included immediately. New telemetry records Twitch and YouTube broadcast lifecycle and outcomes through Streamer.bot, TikTok viewer/outcome events through TikFinity, and OBS stream state as a lifecycle fallback. Viewer samples are reduced to minute-level rows when reports are loaded, and chat reach is grouped in SQLite, so all-time reports no longer depend on the old 50,000-event cap. Exact sessions, viewer counts, roles, follows/subscriptions/raids/shares, and cross-tool impact begin accumulating after this version starts. Analytics remain local in `data/permissions.db`; no viewer data is sent to an external analytics service.

## Song request commands

- `!song <title and artist>` searches Spotify, selects the best result Spotify marks as non-explicit by default, rejects a track already accepted by this application, adds it to the configured playlist and active Spotify playback queue, and records the result. If Spotify does not return a non-explicit result, the request is rejected rather than falling back to an explicit track.
- `!playlist` posts the configured Spotify playlist link.
- `!songlast` posts the most recently accepted request.

Every command is checked against the current per-platform permission configuration immediately before it runs. Explicit user overrides, per-user cooldowns, the global cooldown, and `DRY_RUN` are applied centrally. Recent outcomes are visible in the admin page without exposing Spotify tokens.

The **Allow Explicit Tracks** Dashboard toggle controls Spotify result selection live. When it is off, the request is rejected if Spotify returns no non-explicit version. When it is on, explicit results may be accepted. Changes apply to the next request without restarting the service.

The **Song Requests** Dashboard toggle opens and closes `!song` submissions. When closed, the application replies that requests are closed before searching Spotify, changing the request playlist, or touching the live queue. The setting is saved locally and survives restarts.

The recent-request table has a fixed-height scroll area. Removing an accepted request removes the track from the configured request playlist and deletes its local request-history entry. Spotify's Web API does not provide an operation for removing an arbitrary item from the live playback queue, so a copy already queued in Spotify remains there; the admin page states this limitation before and after removal.

Live queueing requires Spotify Premium, an active unrestricted Spotify playback device, and the playback OAuth permissions requested by this application. After enabling this feature for an existing installation, disconnect and reconnect Spotify once from the admin page to approve the new permissions. If the active device disappears after the playlist update, the request is recorded as partial rather than incorrectly reported as a total failure.

The app subscribes directly to `Twitch.ChatMessage` and `YouTube.Message` events through Streamer.bot. It uses explicit event booleans and Twitch badges for role normalization. It does not infer Twitch follower status, TikTok `followRole`, or any other role whose meaning is not reliably exposed by the chat event.

## OBS song-added overlay

The app includes a transparent browser-source overlay at `http://127.0.0.1:8787/overlay`. It slides in after Spotify accepts a request and shows the song title, artist, requester, and Spotify album art held by the pig mascot. Requests that reach the playlist but miss the live queue also appear; dry-run requests do not.

1. Start the app and open the admin Dashboard.
2. In **Song Added Overlay**, click **Send preview** to check the animation.
3. In OBS, add a **Browser** source and use `http://127.0.0.1:8787/overlay` as its URL.
4. Set the source width to `1920` and height to `1080`. Leave custom CSS empty.

The overlay stays transparent between requests and reconnects to the app automatically. Its default display time is eight seconds. To change it, append a duration in milliseconds to the URL, for example `http://127.0.0.1:8787/overlay?duration=6000`; values from 3000 to 20000 are supported. The generated crowned-pig asset is stored at `public/pig-frame-crowned-v2.png`.

Requester profile pictures are read directly from TikFinity or Streamer.bot when their event includes one. Because Twitch chat events do not consistently include profile images, the overlay uses DecAPI as a cached Twitch-avatar fallback. If an avatar cannot be loaded, a themed circle containing the requester's initial is shown instead.

## King of the Hill chat game

The dedicated **King of the Hill** admin page is at `http://127.0.0.1:8787/admin/king-of-the-hill`. It controls a second transparent OBS browser source at `http://127.0.0.1:8787/king-of-the-hill`. Use the navigation at the top of either admin page to switch between Song Requests and the game.

Click **Start game** to open a vote between two randomly selected topics. Viewers vote by sending a message containing only `1` or `2`. The winning topic moves into a configurable series of head-to-head rounds: each round winner keeps the crown and faces a new challenger. Each platform user gets one vote during the topic selection and one vote in every round. Live totals and percentages appear on the overlay. By default, the game runs for five rounds, topic selection and battle rounds last 30 seconds, and the champion is shown for eight seconds before a new topic vote begins automatically.

Vote bars are split by platform: Twitch votes are purple, YouTube votes are red, and TikTok votes are cyan. A labelled count below each bar and a persistent colour key keep the breakdown readable without relying on colour alone; the combined total still determines each winner.

The admin page's **Game Setup** controls can select 1–9 rounds and change the topic-vote, battle-round, and champion-screen durations. Values are stored locally across restarts. Timing changes apply at the next stage without interrupting the current countdown; round-count changes apply with the next selected topic.

Included topic pools cover Monster flavours, MCU characters, video game franchises, takeaways, superpowers, gaming platforms, cinema snacks, desserts, animals, music genres, holiday types, ways to travel, breakfasts, fantasy creatures, spectator sports, world landmarks, and crisp flavours. Each of the 17 topics has ten possible answers. **End vote now** advances the current stage early, while **Stop** immediately hides the game overlay.

Every answer card uses locally cached artwork so OBS does not depend on remote image hosts during a stream. Branded cards use official promotional pages where the publisher makes a suitable image available; Monster cards use recognizable product packshots because Monster blocks automated downloads; generic categories use curated reference photography. Source and ownership information for all 170 active images is stored in `public/hill-art-official/manifest.json` and displayed under **Image sources** on the game admin page. Run `node scripts/fetch-official-hill-images.js` to restore missing cached files; pass `--refresh=answer-id` to deliberately replace a particular answer image. The earlier Commons search cache remains in `public/hill-art` as an inactive backup.

## Streamer.bot setup

1. Enable the WebSocket Server in Streamer.bot and keep its URL aligned with `STREAMERBOT_WS_URL` (default `ws://127.0.0.1:8080/`).
2. If WebSocket authentication is enabled, put the password in local `.env` as `STREAMERBOT_WS_PASSWORD`. Never put it in `.env.example`.
3. Restart this Node.js application. The Dashboard should report that Twitch and YouTube chat events are subscribed.

No Streamer.bot commands need to be created for Twitch or YouTube. The application consumes chat events directly and sends responses with Streamer.bot's `SendMessage` request.

## TikFinity setup

1. Run TikFinity Desktop, sign in, connect it to the active TikTok LIVE, and keep its Event API aligned with `TIKFINITY_WS_URL` (default `ws://127.0.0.1:21213/`).
2. Song requests can be received without additional actions.
3. To post confirmation messages back to TikTok, enable **Allow Streamer.bot to push messages to TikFinity** in TikFinity's Chatbot settings.
4. Create a Streamer.bot action that broadcasts TikFinity's `sendChatbotMessage` payload using its incoming `message` argument, following TikFinity's Streamer.bot integration guide.
5. Put that action's GUID in local `.env` as `STREAMERBOT_TIKTOK_REPLY_ACTION_ID`, then restart Node.js.

The TikTok reply action is optional: requests are still processed and recorded when it is absent, but the viewer will not receive a TikTok chat confirmation.
