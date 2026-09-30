# Content Coach

Owner-only `/admin/content-coach` is independent of live-stream analytics. Data is stored under `content_coach_v1` in the existing SQLite config store on the persistent Render disk; no stream sessions, chat identities or game events are queried.

## Available now

- Short-form and edited long-form library for YouTube, Instagram and Twitch clips/highlights.
- Manual observations, a strict 25-column CSV template, validation preview, atomic upsert, CSV export and complete raw JSON backup.
- One cumulative observation per canonical post URL and window (24 hours, 7 days, 28 days, lifetime). Fixed-age windows have documented tolerances; other ages must use lifetime. Updates never silently replace newer observations with older ones.
- Own-platform benchmarks using earlier organic posts of the same format, duration band and fixed window, with at least five measured peers **per metric**. No pooled cross-platform view score. Suggestions flag watch percentage, CTR, shares or follower conversion below 80% of the relevant median; view outliers at 1.5× median get a follow-up experiment. These are transparent product heuristics, not statistical significance tests. Missing metrics stay null.
- Cross-platform content-group comparison and cumulative-view snapshot charts with exact table values. Average percentage watched is derived from duration, not presented as completion or a retention curve.
- Rule-based, explicitly non-causal experiments tied to supporting metrics. Research references and their manually recorded observations are kept separate from personal statistics. Experiment groups require different comparable posts and display sample counts, medians and observed differences.
- Owner authentication, same-origin mutation protection, no-store responses, revision conflicts, escaped output, platform URL allowlists and bounded records/import sizes.

## Account status and remaining integrations

The owner identified KingGumption on all platforms and confirmed Instagram is a Creator account. Profile links are shown; **no account is connected automatically by entering a handle**.

This release does not implement OAuth, scheduled API sync, AI video/transcript analysis, automatic similar-post discovery or pre-publication video review. It does not represent public competitor engagement as private retention or causal evidence. No external model calls, scraping or new paid services are enabled.

Automatic connectors require developer-app registration and account authorisation (Google/YouTube, Meta/Instagram and Twitch), scoped read-only tokens, encrypted refresh-token storage, refresh/revocation handling, sync jobs and platform-specific metric mapping. Configure these through secure provider/deployment settings, never by pasting secrets into chat or storing them in the content notes. AI creative analysis additionally needs a chosen provider, a bounded spend policy and authorised media access. Keep these integrations visibly disconnected until implemented and authorised.

## Import rules

Use the template from Data & imports. Timestamps must be ISO 8601 with a timezone. Numeric blanks are unavailable, measured zero is `0`. `format` is `short` or `long`; `traffic` is `organic`, `paid` or `unknown`. `source` describes the actual source of measured data. `views` uses native platform views consistently (not YouTube engaged views). Full stream replays must not be entered as edited long-form.

Imports allow 100 rows / 80 KB in the UI; server JSON limits also apply. 2,000 observations, 300 references and 100 experiments are supported. Post identity/window duplicates within one import are rejected. Format, publication timestamp, duration, traffic and content group must agree across all windows of the same post; to correct these across windows, export, edit the related rows together and reimport. Used observations cannot be deleted until dependent experiments are removed.

JSON backups retain all three collections for safekeeping; there is no JSON restore UI. CSV observations can be reimported. Preview fixtures are local only and are never seeded into production.

## Validation

`node --test test/content-coach.test.js test/content-coach-http.test.js` covers sample boundaries, cohort separation, missing/zero metrics, timestamps, URL canonicalisation, atomic writes, stale revisions, CSV quoting, experiment constraints and owner-only HTTP routes. Use the repository's supported Node version (Node 22 for the local native SQLite build).
