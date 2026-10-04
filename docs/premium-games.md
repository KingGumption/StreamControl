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

All votes contribute proportionally. Each viewer still locks one `attack`, `defend` or `heal` action per turn.

- Heavy attack: 60 incoming damage; the boss resists attacks. Defend is valuable.
- Opening: 12 incoming damage; attacks receive a vulnerability multiplier.
- Guarding: 40 incoming damage; reduced attack effectiveness. Healing/defending helps prepare for the next opening.
- Boss health at or below 30 when a turn starts adds 8 incoming damage (enrage).
- Full-team defence can block up to 70 damage; full-team healing restores up to 35 health **after** the hit. Healing cannot revive a defeated team.
- A killing blow prevents retaliation. Each boss has a different exposure multiplier profile.
- Three/four-turn games have 65/85 boss HP and a shorter phase sequence. Five-plus-turn games use 100 HP.

Regression simulations cover each boss at three, four and five rounds. Coordinated teams can win; all-attack loses the default five-round battle. This is deterministic balance coverage, not a claim of a measured live win rate.

## Verification

293 regression tests passed during this release. Local browser previews covered all eight games and sampled question/reveal/completed states. Final OBS audio mixing with speech/music still requires a real stream check.
