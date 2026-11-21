# Game controls and Halloween release

## Quick Games in OBS

Open **Games**, choose **Prepare game**, and adjust its settings. Launching uses the values on screen for that run. Choose **Save as default** to reuse them for future launches, including chat and Stream Deck. Launching the quiz opens its timed joining lobby. Once someone joins, you can start the first question early. Stop the active game to clear its overlay before launching another.

For the same controls inside OBS, add a Custom Browser Dock pointing to `https://streamengagement.onrender.com/admin/games/quick` and sign in. A width of around 320 pixels works for the dock. The separate browser source that viewers see is `https://streamengagement.onrender.com/games`, at 1080 × 640.

The owner always retains control. Moderator dashboard accounts and verified platform moderators can operate games while **Allow moderator game controls** is enabled. It persists through restarts until switched off. Switching it off immediately blocks all moderator control commands in chat and the dashboard, including stop and next. Viewers can still join, answer and vote. Switching it off does not stop an active game. Existing timed permissions retain their old expiry until the owner first uses the new switch.

## Heist Night and Seasonal Rival

Open either game in Games and launch it on the shared OBS source. Twitch, YouTube and TikTok messages enter the same vote. Each platform account gets one ballot per voting stage.

**Heist Night.** The crew starts with 100 points. Vote 1�3 to set a GTA rule for each of three jobs. The operator marks success or sends a failed job to Chat Court. Viewers submit one short line with `!defend`. Only the operator can select a submission for broadcast. Chat votes 1 for a pardon or 2 for a fine and a commentary challenge. After the third job, chat banks the pot or risks it for double. Ties favour a pardon and banking.

**Seasonal Rival.** The active Graphics theme picks the opponent: the Grinch at Christmas, the Neon Bandit in Vice City, the Candy Phantom at Spooktober, and the Prize Bandit in Classic. Each death adds one item to the rival�s stash. Chat recovers one for each puzzle won. By default the host opens the next challenge between missions. Auto pacing is also available. The side with the winning haul picks the final on-stream challenge.

Automatic death scoring uses the streaming PC connector and its local counter. The first reading establishes a baseline. A reset does not add deaths. Select manual entry before launch or switch to manual from the live controls if the counter becomes unavailable. Completing either game holds its final score until the operator clears the overlay.

## Chat commands

Broadcasters always have access; moderators require the switch. Viewer chat cannot launch or stop games. Roles come from the connected platform event, not names typed in chat.

- `!launch quiz`: open joining and automatically start after 30 seconds (configurable 5–300 in game controls).
- `!start quiz`: start an open lobby early after at least one player joins.
- `!launch hill`, `!launch snacks`, `!launch escape`, `!launch higher`, `!launch split`, `!launch boss`, `!launch number`.
- `!stop`: stop the current game (or use `!stop gamename`).
- `!next gamename`: advance/reveal the active game.
- `!games`: list game IDs and usage.

Only one game can occupy the overlay at a time, including its final results. Stop it through chat or the controls before launching any game again. Repeated launches cannot reset it. The manual quiz page remains available. Empty automatic quiz lobbies close without starting; the dock shows the reason. Existing quiz passes, grace period and speed rewards are unchanged.

## New games

Word Vault, Higher or Lower, Split the Crowd and Secret Number Hunt have separate **Launch full board** and **Launch gameplay corner** buttons. Both use the round settings on screen. To position the corner independently in OBS, use `/games/full` (1080 x 640) and `/games/corner` (480 x 220) in the same scene. Each source shows only its corresponding launch. The original `/games` source combines both layouts for single-source scenes. **Save as default** saves the game settings without taking it on air. Start Word Vault with `!launch word`. Viewers nominate or back a word by sending five letters on their own, such as `CRANE`.

All games, including Quiz and King of the Hill, use one transparent-when-idle OBS browser source: `https://streamengagement.onrender.com/games`. Set Width 1080 and Height 640. Replace the separate game sources with this one; the active game appears automatically. The round-based arcade games use 3–10 rounds, with five by default or seven for Secret Number Hunt. Arcade turns allow 10–60 seconds and start at 20 seconds by default. Crowd Boss Battle continues until either side loses all health. First valid vote per platform account per round locks; vote totals stay hidden until reveal. Results remain visible until Stop.

| ID | Rules |
|---|---|
| snacks | British snacks and sweets versus world snacks and sweets. Vote 1 or 2. Each unique matchup displays country of origin. A round win adds one team point; ties and empty rounds score neither side. Highest team score wins the match; equal scores draw. |
| escape | Vote 1–3 on an authored haunted-house scenario. Majority selects the route; ties are randomly resolved. Collect at least one escape clue per configured round while retaining courage to escape together. |
| higher | A playing card is shown. Ace is low and king is high. Vote 1 for higher or 2 for lower. The next card cannot be equal. Each correct player earns one point. |
| split | Choose 1 or 2. The smaller non-empty group earns one point each. Equal groups or everyone picking one side gives no points. Scores decide the leaderboard. |
| boss | Type attack, defend or heal. The highest vote selects the team action. Defeat the boss before the team runs out of health. |
| number | One guess from 1–100 per player per round. Reveal tightens the range around the secret number. All exact guesses in the winning round share the win. |

Snack origins describe product origins, not current factory locations or company ownership. The initial bank has 12 British entries and 10 international entries, enough for a maximum-length match without repeating either side. Sources are recorded for each entry in `src/snack-bank.json`, using manufacturer histories including [Tunnock’s](https://www.tunnock.co.uk/about-us/), [Swizzels](https://swizzels.com/about/our-history/), [Pocky](https://www.pocky.com/about/), [Haribo](https://www.haribo.com/en/about-us/history) and [Calbee](https://www.calbee.co.jp/en/corporate/history/product.php).

Hill now includes 57 topics, each with ten options. Launch presets can restrict topics to Halloween, gaming, food, screen, debates or general. Recently offered topics are avoided where the selected pool permits. New topics use locally generated title-and-icon cards; the original topics retain their existing cached artwork.

## URL colour variants

Append `?theme=halloween`, `?theme=ghost` or `?theme=slime` to `/games`, `/polaroid` or `/overlay`. The shared games source forwards the colour variant to each game. If the URL already has parameters, use `&theme=...`. For Games, omit the theme parameter to follow the overall theme in Graphics. Applying Classic, Spooktober, Vice City or Christmas updates the active game immediately. A game URL with a supported theme specified keeps its fixed palette. The dock has themed overlay links. Themes alter presentation colours, not photo pixels or gameplay; correctness and platform identity colours remain distinguishable.

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


## Arcade presentation and audio

The shared `/games` source still uses a 1080 x 640 canvas. Arcade games now have illustrated stages, animated choices, countdown cues and result reveals. Boss Battle randomly selects the Pumpkin King, Frost Wyrm or Candy Golem. Each illustrated boss has a six-pose transparent sprite atlas: idle, windup, attack, recoil, guard and defeat. Three attack effects distinguish slams, projectiles and sweeps. A full arena replaces the former three-card battle layout, with a chat party opposite the boss, separate health bars, live move counts and compact commands. Combat animations show the server's existing damage totals; game balance is unchanged.

Snack Wars serves real product photographs from local WebP files, with origin labels. Sources and credits are recorded in `public/snack-art/manifest.json`. Open Food Facts contributor photos retain their CC BY-SA 3.0 attribution; manufacturer images and packaging belong to their respective owners. Images were resized/compressed, not generated. The game scenes use vector artwork and CSS scenery; the boss and adventurer art uses generated, stylised ink-and-cel-shaded sprites. Arcade audio is synthesised locally.

In Quick Games, select the overlay theme and audio volume, then copy the Games overlay link into the OBS browser source. Volume defaults to 30%. Use `/games?volume=20` for 20% or `/games?muted=1` for silence; these options also work alongside `theme=halloween`. The settings travel with the copied URL. They do not change an OBS source until its URL is updated. The Hill admin preview is muted to avoid duplicate audio.

Effects run only on game phase changes, not each vote. Reconnect snapshots do not replay past sound cues. Reduced-motion preferences disable decorative motion, and stopping or replacing a boss round cancels pending attacks. Browsers may require an interaction before allowing audio; OBS browser sources use their normal audio routing.
