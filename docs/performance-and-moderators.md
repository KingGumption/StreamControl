# Performance and moderator handoff

## Games-only access

On the cloud dashboard, sign in as `owner` with the existing admin password. Old sessions need to sign in again after this release. Open **Manage moderators** from Games, or visit `/admin/moderators`.

1. Create an individual moderator username and password (12–256 characters). Share those credentials privately with that moderator.
2. Give them the normal `/admin/login` link. They land on `/admin/games` and can view Quiz and King of the Hill.
3. Enable handoff for 1–720 minutes when you want them to run games. They can start, advance, stop and configure the live games. Owner control remains available throughout.
4. Disable handoff to stop moderator actions immediately, or revoke an account to invalidate all its sessions. Expiry is enforced by the server, even on an already-open page.

Spotify, permissions, analytics, Polaroid, moderator management and preview/practice routes remain owner-only. Hiding links is only presentation: a central server allowlist rejects direct requests to those routes. Minimal connection readiness is exposed without integration configuration. Game mutations use a state token to reject stale/double actions. The management page shows recent control actions and who made them.

Handoff starts disabled. No real moderator accounts are shipped or created automatically. Local mode remains the trusted, loopback-only owner workflow; remote moderator access uses cloud mode and HTTPS.

## Responsiveness

- Quiz and Hill controls receive state updates through server-sent events. Quiz changes are coalesced over 30 ms; countdown animation stays local. Initial state and reconnect recovery use the same stream.
- Quiz and Polaroid share the six-hour avatar URL cache. Downloads are bounded/cached, and identified interactions warm avatars with two background workers. Anonymous interactions cannot be warmed; YouTube/TikTok need an image URL in the event.
- Polaroid capture runs alongside avatar lookup. The avatar budget defaults to 400 ms; a missing/slow avatar cannot hold the capture for the old multi-second lookup. The next interaction can use the completed cache entry.
- JPEG screenshots at the existing resolution reduce connector transfer bytes. Set `POLAROID_CAPTURE_FORMAT=png` for lossless source transport. Set `POLAROID_CAPTURE_DELAY_MS=0` to override older saved capture delays. The Blueprint contains that override; existing services must have it applied in their environment.
- The paper texture is cached and warmed at startup. Captures are announced before the separate bounded Discord/Twitch delivery queue. Discord requests have a 15-second deadline; uncertain deliveries are not blindly retried. Pruning is coalesced, preserves the last 48 hours for credits, and keeps attribution sidecars in step with images.
- The overlay preloads the next three images. Its intentional eleven-second display and 750 ms gap remain: a burst still waits for earlier photos to finish. This is separate from capture processing and platform playback delay.
- Analytics reports run in a worker with a read-only SQLite connection and a coherent snapshot. A bounded five-second cache serves search/pages; if the snapshot changes, the whole response is refreshed together. A busy or stalled worker produces a retryable error instead of blocking chat/game processing.
- Matching date-expression indexes, reused prepared statements, cached permission settings and cached quiz categories remove repeated work. Permissions are authoritative in SQLite after one-time legacy import.
- Spotify calls have deadlines and share token refresh work. Connector queues are bounded by count, bytes and age; replayed chat records history without running old commands or games. Replayed OBS transitions are ignored in favour of fresh connection status.

## Measure and operate

`/admin/performance` exposes owner-only recent stage timings (median/p95), event-loop delay and Polaroid queues. In the overlay browser console, `window.polaroidLastTiming` contains processing and image-loading durations. These describe application processing, not Twitch/YouTube playback delay. The last 256 samples are in memory and reset on restart.

`npm run benchmark` creates its own temporary database with 10,000 events. Local development measurements were approximately 148 ms for a cold report and 3.4 ms for cached activity search. On a separate 1920×1080 image fixture, transport was 3.38 MB PNG versus 0.236 MB JPEG, and warm rendering improved from about 618 ms to 193 ms. These are fixture results, not measured Render or live-stream latency guarantees.

Tests use `node --test --test-concurrency=1` because older test files share a database. Always set `DATA_DIR` to a disposable directory before testing. Never run the production server against the connector `.env`; use `npm run connector` for the streaming PC.

## Release and recovery

Deploy outside an active game: live game state and capture/delivery queues are in memory and a service restart can interrupt them. Let captures/deliveries finish first. The new database tables and indexes are additive; existing game history, credits and permissions are retained. Back up the persistent database before deployment using the established service backup procedure.

Verify the deployed Git revision in Render, check `/health`, then sign in, check integrations and make a controlled test capture. Refresh OBS browser sources to load the new client code. Restart the existing connector once to activate the connector queue changes; do not launch a duplicate. Set the capture delay override on the existing Render service if its Blueprint settings have not been synced.

Confirmed unused wrappers/imports and duplicate SSE setup were removed. The obsolete Hill artwork/downloader are archived under ignored `backups/legacy-hill-art-2026-09-18/` before removal from tracked deployment files. The active official artwork, SVG fallback and attribution remain. Compatibility endpoints/analytics response fields and exported legacy token helpers are retained for external consumers; legacy tokens do not authenticate the new sessions.
