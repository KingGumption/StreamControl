# Premium game presentation

The existing shared OBS games overlay remains 1080 × 640. Chat commands, moderator permissions, quiz grace/pass rules and one-game-at-a-time controls remain unchanged.

## Presentation

- Quiz: prominent question, contestant rail, tiered 3/2/1 podium and pass recap.
- Hill: full matchup imagery, champion/challenger labels and consecutive win streak. Vote updates preserve the artwork and entrance state.
- Snack Wars: large real product photos on podiums, origins and persistent series scores. Final results distinguish overall wins from draws.
- Higher/Lower: card table, concealed next card, flip and recent draw history. Server-backed history survives overlay reconnections; ranks run from Ace low to King high.
- Haunted Escape: room architecture, choice props, selected-route animation, route progress and final escape/failure result.
- Split the Crowd: sealed choices; crowd tokens and counts appear only after answers lock. Tokens identify actual voters and cap at 18 per side; numeric counts remain exact.
- Number Hunt: mechanical vault, accepted range, post-lock guesses and vault-opening winner display.
- Boss Battle: retained stylised sprites, larger party, clearer combat cues, enrage and arena finales.

Per-game synthesised melodies and percussion use the existing volume/mute URL controls. Reduced-motion preferences disable presentation movement. First/reconnected snapshots do not play old result sounds or combat sequences.

## Boss rules

Boss combat now uses majority voting for one party action, hidden enemy moves, defensive focus and two shared potions. See [the current combat rules](boss-majority-combat.md). The earlier proportional-vote and telegraphed-phase design has been replaced.

## Verification

293 regression tests passed during this release. Local browser previews covered all eight games and sampled question/reveal/completed states. Final OBS audio mixing with speech/music still requires a real stream check.
