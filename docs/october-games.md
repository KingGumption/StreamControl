# Game controls and Halloween release

## Quick Games in OBS

Add an OBS Custom Browser Dock with URL `https://streamengagement.onrender.com/admin/games/quick` and sign in. The dock provides all eight games, launch presets, current state, Start quiz now, Next/reveal and Stop. Owner accounts also see the persistent moderator switch and device-key setup. A width of around 320 pixels is suitable.

The owner always retains control. Moderator dashboard accounts and verified platform moderators can operate games while **Allow moderator game controls** is enabled. It persists through restarts until switched off. Switching it off does not stop an active game. Existing timed permissions retain their old expiry until the owner first uses the new switch.

## Chat commands

Broadcasters always have access; moderators require the switch. Viewer chat cannot launch or stop games. Roles come from the connected platform event, not names typed in chat.

- `!launch quiz`: open joining and automatically start after 30 seconds (configurable 5–300 in Launch presets).
- `!start quiz`: start an open lobby early after at least one player joins.
- `!launch hill`, `!launch snacks`, `!launch escape`, `!launch higher`, `!launch split`, `!launch boss`, `!launch number`.
- `!stop gamename`: stop the named active game.
- `!games`: list game IDs and usage.

Only one game accepts chat at a time. Repeated launches cannot reset it. The manual quiz page remains available. Empty automatic quiz lobbies close without starting; the dock shows the reason. Existing quiz passes, grace period and speed rewards are unchanged.

## New games

All new games use the same transparent-when-idle OBS browser source: `https://streamengagement.onrender.com/chat-games`. Use around 760×700 for the source, then resize it in OBS. Each game has 3–10 rounds (default 5), 10–60 seconds per turn (default 20), and a five-second reveal. First valid vote per platform account per round locks; vote totals stay hidden until reveal. Results remain visible until Stop or a new launch.

| ID | Rules |
|---|---|
| snacks | British snacks and sweets versus world snacks and sweets. Vote 1 or 2. Each unique matchup displays country of origin. A round win adds one team point; ties and empty rounds score neither side. Highest team score wins the match; equal scores draw. |
| escape | Vote 1–3 on an authored haunted-house scenario. Majority selects the route; ties are randomly resolved. Collect at least one escape clue per configured round while retaining courage to escape together. |
| higher | A random card from 1–100 is shown. Vote 1 for higher or 2 for lower. The next card cannot be equal. Each correct player earns one point. |
| split | Choose 1 or 2. The smaller non-empty group earns one point each. Equal groups or everyone picking one side gives no points. Scores decide the leaderboard. |
| boss | Type attack, defend or heal. The mix of actions determines damage, protection and healing, scaled by participation so small streams can play. Defeat the boss before team health or rounds run out. |
| number | One guess from 1–100 per player per round. Reveal tightens the range around the secret number. All exact guesses in the winning round share the win. |

Snack origins describe product origins, not current factory locations or company ownership. The initial bank has 12 British entries and 10 international entries, enough for a maximum-length match without repeating either side. Sources are recorded for each entry in `src/snack-bank.json`, using manufacturer histories including [Tunnock’s](https://www.tunnock.co.uk/about-us/), [Swizzels](https://swizzels.com/about/our-history/), [Pocky](https://www.pocky.com/about/), [Haribo](https://www.haribo.com/en/about-us/history) and [Calbee](https://www.calbee.co.jp/en/corporate/history/product.php).

Hill now includes 57 topics, each with ten options. Launch presets can restrict topics to Halloween, gaming, food, screen, debates or general. Recently offered topics are avoided where the selected pool permits. New topics use locally generated title-and-icon cards; the original topics retain their existing cached artwork.

## URL colour variants

Append `?theme=halloween`, `?theme=ghost` or `?theme=slime` to `/quiz`, `/king-of-the-hill`, `/chat-games`, `/polaroid` or `/overlay`. If the URL already has parameters, use `&theme=...`. Omit the parameter for existing branding. The dock has themed overlay links. Themes alter presentation colours, not photo pixels or gameplay; correctness and platform identity colours remain distinguishable.

## Stream Deck

1. In the owner’s Quick Games dock, expand **Stream Deck setup**, then create a device key. Only its hash is stored on the server. A replacement revokes the old key. The key controls games only; it cannot access photos, account settings or tests.
2. Create `%USERPROFILE%\.streamcontrol-device.json` with this JSON, pasting the key locally:

   ```json
   {"baseUrl":"https://streamengagement.onrender.com","token":"PASTE_DEVICE_KEY_HERE"}
   ```

3. In Stream Deck, use a System → Open action pointing to a launcher in `scripts/streamdeck`, such as `launch-snacks.cmd` or `launch-quiz.cmd`. They call the installed Node helper; no extra Stream Deck plugin is required. Keep the local JSON private. For an alternative location, set `STREAMCONTROL_DEVICE_CONFIG` to its absolute path.

The helper also supports `node scripts/game-control.cjs launch snacks` and `stop snacks`. Direct integrations can POST JSON `{"action":"launch","game":"snacks"}` to `/api/games/action` with `Authorization: Bearer YOUR_KEY`. Never put keys in URLs. Browser GET requests cannot launch a game.

## Polaroid capture

Normal redeems require OBS streaming output to be active and not reconnecting. Recording or virtual camera alone is insufficient. Unknown status blocks capture. Checks occur before accepting the request, after any queue delay, and at the local connector immediately before taking the screenshot. Queued jobs are invalidated when OBS disconnects or the stream ends. They are not saved for the next broadcast.

Only the authenticated owner’s test route can bypass live status. Sending `isTest`, changing a username, or using a moderator account cannot bypass it. Both cloud and PC connector need this release. Test photos remain marked as tests in the existing capture pipeline.
