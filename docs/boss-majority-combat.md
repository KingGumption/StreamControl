# Boss battles: one party, one decision

Chat votes `1` / `attack`, `2` / `defend`, or `3` / `heal` (also `one`, `two`, `three`). Each viewer locks one vote each turn. Only the most-voted action executes for the whole party; minority actions do not contribute partial damage, defence or healing. Ties choose randomly among the tied leaders and the result explicitly announces this. No votes means the party waits while the boss takes its selected turn. The two-second grace period remains.

The party acts first, followed by the boss if it is still alive. The next boss move is selected on the server and never sent in the question snapshot, prompt, idle pose or animation style. After resolution the move and damage are revealed. The next turn may show the previous move, labelled “Last”. Enrage at 30% boss health is visible, but does not expose the upcoming move.

| Action | Effect |
|---|---|
| Attack | 28 damage, or 56 with stored focus. Consumes focus. |
| Defend | Blocks 75% of this turn's incoming damage and stores focus for the next attack. Focus cannot stack. |
| Heal | Uses one of two shared potions to restore up to 40 HP before the boss hits. Health caps at 100. Focus is retained. |

A potion used at full health is still spent. With no potions left the overlay says so; choosing heal then wastes the turn. A killing attack prevents retaliation. The battle ends only when the boss or party reaches zero HP, or an authorised controller stops it. There is no turn-limit defeat.

Bosses have 160 HP and unlimited turns. Legacy saved round counts are ignored for boss battles, and the Quick Games dock only offers turn duration. Other games keep their existing round limits. The three existing bosses retain their artwork and attack animations. Their hidden decisions use only completed-turn history, never the current vote.

## Tactical behaviours and presentation

- Guard reduces the following party turn's normal attack by 50%; a focused attack pierces it. Bosses cannot guard on consecutive turns.
- Charge spends a turn preparing, then makes the next strike 60% stronger. The stored charge is visible; the attack name stays hidden. Defend still blocks 75%.
- Recovery is limited to once per battle and selected only below 60% health. Pumpkin restores up to 18 HP, Frost 16, Golem 22. A killing blow prevents recovery.
- Golem favours guard; Frost favours charge; Pumpkin mixes both. Repeated audience attacks encourage guard, repeated defence encourages charge, and low boss health shifts towards aggression. The first turn attacks; there is no predefined final turn.

`scripts/simulate-boss.cjs` bases audience decisions on public state only. With unlimited turns, its responsive strategy won all 500 sampled games per boss, versus 104/106/127 for attack-only. This deliberately removes timeout losses while retaining punishment for poor choices. These are simulated outcomes, not measured live audience win rates.

The party has illustrated ready, attack, defend, heal, front-facing victory and front-facing defeat poses with CSS motion. This is a six-pose 2D atlas, not a skeletal 3D rig. End screens centre the outcome, hide obsolete vote panels and place final HP below the result. Action panels use drawn SVG icons and separate chat-number badges.

Regression coverage includes numeric/name aliases, first-vote locks, majority-only effects, ties, abstention, focus storage/consumption, potion exhaustion, HP limits, hidden question state, lethal attacks preventing retaliation, real broadcaster event routing and planned-vs-all-attack strategies. Regression tests also verify play beyond turn twelve, legacy preset compatibility, unchanged limits for other games, and responsive versus attack-only strategies. This does not establish a measured live audience win rate.
