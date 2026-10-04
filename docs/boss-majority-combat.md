# Boss battles: one party, one decision

Chat votes `1` / `attack`, `2` / `defend`, or `3` / `heal`. Each viewer locks one vote each turn. Only the most-voted action executes for the whole party; minority actions do not contribute partial damage, defence or healing. Ties choose randomly among the tied leaders and the result explicitly announces this. No votes means the party waits and the boss still attacks. The two-second grace period remains.

The party acts first, followed by the boss if it is still alive. The next boss move is selected on the server and never sent in the question snapshot, prompt, idle pose or animation style. After resolution the move and damage are revealed. The next turn may show the previous move, labelled “Last”. Enrage at 30% boss health is visible, but does not expose the upcoming move.

| Action | Effect |
|---|---|
| Attack | 28 damage, or 56 with stored focus. Consumes focus. |
| Defend | Blocks 75% of this turn's incoming damage and stores focus for the next attack. Focus cannot stack. |
| Heal | Uses one of two shared potions to restore up to 40 HP before the boss hits. Health caps at 100. Focus is retained. |

A potion used at full health is still spent. With no potions left the overlay says so; choosing heal then wastes the turn. A killing attack prevents retaliation. Party defeat or reaching the turn limit without defeating the boss loses the battle.

New unsaved boss configurations default to eight turns, allowing time for defensive setup and healing. Explicit saved presets remain unchanged. Boss HP scales with the configured 3–10 turns; short encounters use scaled damage so they still require a defensive decision. The three existing bosses retain their artwork and attack animations. Their move is randomly chosen each turn, replacing the fixed, advertised heavy/opening/guard cycle.

Regression coverage includes numeric/name aliases, first-vote locks, majority-only effects, ties, abstention, focus storage/consumption, potion exhaustion, HP limits, hidden question state, lethal attacks preventing retaliation, real broadcaster event routing and planned-vs-all-attack strategies. Balance tests exercise three-, four-, five- and eight-turn encounters; additional search checks covered ten turns. This does not establish a measured live audience win rate.
