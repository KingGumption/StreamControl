# Unified games analytics and viewership comparisons

Analytics > Games compares all eight games: Elimination Quiz, King of the Hill, Haunted House Escape, Higher or Lower, Split the Crowd, Crowd Boss Battle, Secret Number Hunt and Snack Wars.

All use the same common fields: recorded plays, starts/completions/stops, completion rate, distinct platform accounts, repeat participation, accepted responses, recorded rounds, measured duration, platform mix, outcomes, player rankings and game history. Quiz joins count towards participation; responses are accepted quiz answers or votes/guesses. Quiz duration starts at the first question, excluding its lobby. Existing detailed Quiz and Hill pages remain linked; boss tactics are an additional specialist section.

Game counts and outcomes are shared across platforms. The platform filter restricts player events and viewer samples, not whether a game was played. A game can have measured viewer impact on Twitch even when its votes came entirely from YouTube. Test events and test sessions remain excluded.

## Viewership rules

- Pair the same run's five whole minutes immediately before its start with complete whole minutes inside its start/end interval. Five whole minutes after its end are shown separately. Exclude partial boundary minutes; never cross a stream boundary or interpolate missing minutes.
- A combined minute requires observations from every platform represented in that stream selection. Sample-count weights preserve the existing minute means. Zero is a real value, not missing data.
- Viewer lift is during-game mean minus before-game mean. Percentage change is unavailable when the baseline is zero. Summary means give every comparable run equal weight. Percentage summaries average per-run percentage changes, not ratios of aggregate means.
- Summary lift includes recorded streams with complete baseline/during coverage and no raid or other completed game interval within the five-minute comparison margins. Activity-estimated streams remain visible but are excluded. Estimated stream ends and coverage gaps are labelled.
- Observed peak is the maximum measured minute during that run, with a link to its timestamp. It can remain available despite incomplete coverage, explicitly labelled observed.
- Peak overlap asks whether the game's fully measured minutes include the stream's highest observed minute. Ties can overlap several games; a completely flat measured stream has no distinct peak. It is a run count, not a count of unique stream peaks. Overall stream coverage is shown alongside each result.
- These are descriptive associations, not causal attribution. Raids and other nearby games are visible in the evidence, even when excluded from the summary. No statistical significance or guaranteed audience growth is claimed.

Every named game interval has a coloured band and legend in the existing stream explorer. Clicking a game or peak in the evidence table opens the corresponding stream and selects the nearest measured bucket. Charts keep existing missing-data gaps. Legacy records without timing cannot be assigned invented intervals.

Exports include all eight summaries; history is bounded at 50 runs and viewer intervals per game, and 25 player accounts. The UI shows at most 80 evidence rows across all games. Aggregate metrics use all matching records. No public analytics data route or access changes are introduced.
