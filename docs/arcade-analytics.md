# Arcade game analytics

Analytics > Games now reports all eight games using the common measurements documented in game-analytics.md. This document describes the six arcade games' telemetry and legacy compatibility.

New schemaVersion 2 engagement events use tool `chat_games`: game_started, accepted vote, round_completed, game_completed and game_stopped. The final round uses only game_completed, so it is counted once. Stopping an already completed or idle game does not create a stopped event. Duplicate, invalid and late votes never become accepted-vote telemetry. Gameplay remains functional if telemetry storage fails; failures are logged.

Meaningful interactions count individual accepted votes/guesses only. Lifecycle and aggregate round records remain in Activity but do not inflate overview, timelines, platform mix, audience or stream totals. Accounts are separate per platform; repeat participation means voting in at least two distinct games during the selected period. All arcade games count as one tool for cross-tool overlap.

Plays are distinct game IDs with recorded activity in the selected range, not necessarily games started in that range. Platform filters restrict votes and player counts, while retaining shared game results for games with activity from that platform. Resolved-round votes are whole-game aggregates, distinct from accepted-vote telemetry. Duration covers start to completion or manual stop, when available. Stopped games are not losses. Games interrupted by process shutdown can have a start without an end; no completion is inferred.

Boss outcomes, boss identity, final turn number, party action, boss action, damage, shielding, healing and remaining HP are recorded after resolution. Hidden boss intentions are not exposed during voting. The dashboard exposes wins/losses, win rate, average completed-battle turns and party action votes versus turns chosen.

Legacy events remain visible as result-only history, aggregate votes and completed games. Player identities, duration, boss identity and structured outcome cannot be reconstructed and stay unknown. Test-marked events/sessions are excluded by the existing report filters. History is capped at 50 displayed games and player rankings at 25; aggregate totals use all matching events. Existing JSON report exports include the new section. No new public analytics endpoint or permissions are introduced.
