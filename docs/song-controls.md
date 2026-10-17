# Song controls

The Song Requests page controls permissions per platform and user. The defaults for `skip` and `songremove` allow broadcasters and moderators. Existing saved permissions and overrides remain authoritative.

- `!skip`: advance the currently playing Spotify track. Requires connected Spotify, playback permissions and an active unrestricted device.
- `!songremove`: remove the most recent accepted request.
- `!songremove 123`: remove the request with ID 123 (shown beside its timestamp in the request table).

Removal uses the same playlist removal operation as the dashboard, then deletes the local request history entry. Spotify failures preserve the entry. Spotify has no arbitrary queue-item deletion endpoint: a song already queued remains queued, so use `!skip` when it plays. Skip alone does not remove playlist or history entries.

Controls work even when new song requests are closed. They obey the configured command cooldowns, serialize control operations and make no mutations in dry-run mode. The integration records command outcomes in analytics. Recognised broadcaster self messages are permitted through Streamer.bot; internal messages and other self song commands remain filtered.

API reference: https://developer.spotify.com/documentation/web-api/reference/skip-users-playback-to-next-track
