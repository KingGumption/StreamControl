# Automatic credits photos

Every non-test capture now stores an atomic JSON sidecar beside its JPEG under
`DATA_DIR/polaroid-captures`. This preserves the original redeemer name and SHA-256.
Existing JPEGs are also listed using their timestamped filenames, without requiring
a database migration. Discord delivery continues unchanged.

The Render blueprint mounts a persistent disk at `/var/data` and sets `DATA_DIR`
to that path. Both photos and their sidecars must remain on that disk. Pruning
respects `keepLast` but additionally protects the most recent 48 hours of genuine
captures so a busy stream does not prune itself before credits run.

Authenticated read-only endpoints:

- `GET /api/polaroid-credits?start=<UTC>&end=<UTC>`: inclusive interval, at most 48 hours.
- `GET /api/polaroid-credits/photo/<filename>`: retrieve an individual JPEG.

Send `Authorization: Bearer <token>`. By default the token is HMAC-SHA256 of the
UTF-8 string `polaroid-credits-v1`, keyed by the existing `BRIDGE_TOKEN`, encoded
as lowercase hex. A separate `POLAROID_CREDITS_TOKEN` can override this on both
the cloud and credits server. Never place either secret in the OBS URL or frontend.
The derived read-only token does not disclose the bridge credential.

The local CinematicCredits server reads the existing connector `.env`, derives
the read-only token and downloads the matching photos before its playback clock
starts. Missing stream boundaries omit photos; an online failure without an exact
completed local snapshot blocks preparation with a visible retryable error.
A completed cache can replay the same stream offline. Empty online results do not
fall back to another stream. Discord scraping is not part of the live workflow.

Streamer.bot must run the start marker once alongside the actual broadcast reset,
then generate the credits JSON at the end. Reconnecting within one broadcast must
not rerun the start marker. The credits JSON needs `streamStartedAt` and
`streamEndedAt` in UTC, and all captures for the stream should finish before export.
