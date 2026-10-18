# Music overlay

The permanent `/overlay` source now combines Spotify Now Playing, four-second
song-request confirmations, and a full-size `!song artist – title` reminder.
The reminder appears for six seconds after one minute without a request. Request
confirmations take priority, and always return to the latest playback state.

The **Song Requests** switch hides the entire live overlay immediately. Turning
it off discards pending confirmations, cancels animations, and stops Spotify
polling. Reopening starts fresh. Paused/unavailable Spotify playback is hidden;
newly accepted requests can still be acknowledged while playback is unavailable.
Partial requests are labelled **Added to playlist**, not **Added to queue**.

## OBS setup

Select a style under **Music Overlay** in the dashboard, then copy the plain
`/overlay` URL. Use a **570 × 125 Browser Source** and position or scale it
freely in OBS. Every source uses the compact, top-left layout; no URL layout
parameters are needed. Existing URLs with `?layout=compact` continue to work.

Style changes are saved on the server and update all connected sources without
changing their URLs. Classic uses the original cyan/pink and dark navy, Halloween orange/plum, Ghost icy
blue, and Slime acid green/purple. These are restrained colour variants of the
same print transition. Artwork retains its original colours outside transitions.

The dashboard's isolated preview uses sample tracks and does not connect to
Spotify. Live tests are unavailable while Song Requests is off. `?theme=` is an
initial fallback for live sources; the saved style takes precedence.

## Implementation

`music-overlay.js` implements the approved distressed print animation using
native browser animation, with a fade for reduced motion. Labels use text nodes
and artwork uses validated HTTPS URLs. Missing artwork collapses cleanly.

`MusicOverlay` polls `GET /me/player` using the existing
`user-read-playback-state` scope. All open sources share one poll, normally every
five seconds. There is no polling without connected sources or while requests
are off. Errors clear stale playback; 429 responses respect Retry-After.
Public events expose only the enabled flag, style, and sanitized display fields.
No access tokens, devices, or user profile metadata are exposed.

The print texture is reused from the supplied pig-print stinger; the former
mascot alert stylesheet and its two decorative seasonal assets were removed.
