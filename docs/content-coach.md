# Content Coach

Owner-only `/admin/content-coach` is independent of live-stream analytics. Data is stored under `content_coach_v1` in the existing SQLite config store on the persistent Render disk; no stream sessions, chat identities or game events are queried.

## Available now

- Short-form and edited long-form library for YouTube, Instagram, Twitch clips/highlights and TikTok.
- Manual observations, a strict 25-column CSV template, validation preview, atomic upsert, CSV export and complete raw JSON backup.
- One cumulative observation per canonical post URL and window (24 hours, 7 days, 28 days, lifetime). Fixed-age windows have documented tolerances; other ages must use lifetime. Updates never silently replace newer observations with older ones.
- Own-platform benchmarks using earlier organic posts of the same format, duration band and fixed window, with at least five measured peers **per metric**. No pooled cross-platform view score. Suggestions flag watch percentage, CTR, shares or follower conversion below 80% of the relevant median; view outliers at 1.5× median get a follow-up experiment. These are transparent product heuristics, not statistical significance tests. Missing metrics stay null.
- Cross-platform content-group comparison and cumulative-view snapshot charts with exact table values. Average percentage watched is derived from duration, not presented as completion or a retention curve.
- Rule-based, explicitly non-causal experiments tied to supporting metrics. Research references and their manually recorded observations are kept separate from personal statistics. Experiment groups require different comparable posts and display sample counts, medians and observed differences.
- Owner authentication, same-origin mutation protection, no-store responses, revision conflicts, escaped output, platform URL allowlists and bounded records/import sizes.

## Account connections

The owner identified KingGumption on YouTube, Instagram, Twitch and TikTok and confirmed Instagram is a Creator account. Profile links are shown; **no account is connected automatically by entering a handle**.

TikTok, YouTube and Instagram offer owner-only OAuth connection and daily automatic sync on the existing Render web service. The process catches up after a restart and records provider-specific errors without stopping other connections. Tokens are encrypted at rest using the deployment session secret. Unavailable metrics remain blank. Twitch clips, full streams, video footage and transcripts are excluded from automated analysis.

Post packaging (title, description/caption, tags/hashtags, category when exposed, and cover URL) and dated metric snapshots are stored separately from manual observations. Content Coach compares each post with earlier own posts of the same platform, format, duration band and similar observed age; fewer than five peers or historical lifetime-only data produce no baseline. The Opportunities tab shows an AI-generated summary and up to three changes to test when `OPENAI_API_KEY` is configured. AI requests are cached by post stage and major metric changes and reserve £0.03 each against `CONTENT_COACH_AI_BUDGET_GBP` (capped at £10); the app guard is conservative, not a billing guarantee. New posts are analyzed before older backfill, up to ten per day. No post is edited or published automatically.

Related public YouTube examples use official search results and raw public figures. They are links, not matched benchmarks; no competitor private analytics are available. AI-derived competitor patterns remain off unless `CONTENT_COACH_COMPETITOR_AI_APPROVED=true` is explicitly set after the YouTube use-case audit. Public example records expire after 30 days. Cover URLs are sent to OpenAI only for known platform CDN hosts, and API inputs instruct the model to treat post text as untrusted content.

To connect TikTok: register a TikTok for Developers app with Login Kit and Display API (approved `user.info.basic` and `video.list` scopes), register `https://streamengagement.onrender.com/admin/content-coach/tiktok/callback`, set `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET` in Render, then use **Connect TikTok** in Data & imports. Sync pages through up to 12 months of public videos with view/like/comment/share counts; retention and per-video follower conversion are unavailable from this API. Disconnect revokes the provider token and keeps observations.

To connect YouTube: create a Google Cloud OAuth **web application**, enable **YouTube Data API v3** and **YouTube Analytics API**, register `https://streamengagement.onrender.com/admin/content-coach/youtube/callback`, and configure `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET` in Render. The app requests `youtube.readonly` and `yt-analytics.readonly` with offline access. Connect the Google account that owns the channel, then sync from Data & imports. Up to 12 months of public, non-live uploads are checked, processing the newest 40 and a rotating batch of 160 older videos daily. Public view/like/comment counts come from YouTube Data API. Where available, Analytics adds shares, subscribers gained and average view duration through the previous day. YouTube Shorts are classified by a duration heuristic (up to 180 seconds); correct the format in the library when that does not match the actual post. Disconnect revokes the refresh token and keeps observations.

To connect Instagram: use a Meta developer app with **Instagram API with Instagram Login**, register `https://streamengagement.onrender.com/admin/content-coach/instagram/callback`, request `instagram_business_basic` and `instagram_business_manage_insights`, and configure `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET` in Render. Authorise the KingGumption Creator account, then sync from Data & imports. Up to 12 months of videos/Reels are checked, processing the newest 20 and a rotating batch of 30 older posts daily. Available views, reach, likes, comments, shares, saves and Reel average watch time are imported. Instagram does not reliably return video duration here, so leave it unknown or enter the actual duration in the Content library. Until duration is known, only lifetime observations are saved and matched baselines are excluded. Disconnect removes the local token; app access may also be revoked in Instagram settings.

The Twitch connection used for stream/game activity is not a Content Coach clip-analytics connection. Twitch clips and edited highlights remain manual/CSV. No full stream replays are imported. Configure developer credentials through secure provider/deployment settings, never by pasting secrets into chat or storing them in content notes.

## Import rules

Use the template from Data & imports. Timestamps must be ISO 8601 with a timezone. Numeric blanks are unavailable, measured zero is `0`. `format` is `short` or `long`; `traffic` is `organic`, `paid` or `unknown`. `source` describes the actual source of measured data. `views` uses native platform views consistently (not YouTube engaged views). Full stream replays must not be entered as edited long-form.

Imports allow 100 rows / 80 KB in the UI; server JSON limits also apply. 12,000 observations, 300 references and 100 experiments are supported. Post identity/window duplicates within one import are rejected. Format, publication timestamp, duration, traffic and content group must agree across all windows of the same post; to correct these across windows, export, edit the related rows together and reimport. Used observations cannot be deleted until dependent experiments are removed.

JSON backups retain all three collections for safekeeping; there is no JSON restore UI. CSV observations can be reimported. Preview fixtures are local only and are never seeded into production.

## Validation

`node --test test/content-coach.test.js test/content-coach-http.test.js test/content-tiktok.test.js test/content-social.test.js` covers sample boundaries, cohort separation, missing/zero metrics, timestamps, URL canonicalisation, atomic writes, stale revisions, CSV quoting, experiment constraints, OAuth state/token storage, provider import mapping and owner-only HTTP routes. Use the repository's supported Node version (Node 22 for the local native SQLite build).
