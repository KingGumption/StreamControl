# Analytics audit — 8 September 2026

## Reported problem

The user reported 7 September activity in the engagement timeline but absent from Stream roundups. The old report selected **either** recorded sessions **or** inferred sessions for the entire period. One recorded session therefore suppressed unrelated activity estimates. Unclosed session records also extended to the report time, potentially absorbing subsequent broadcasts.

The replacement reconstructs recorded intervals without writing to historical records, splits unclosed intervals on four-hour evidence gaps, and retains uncovered activity as explicitly labelled estimates. All roundups are returned. Timeline days link to a UTC date search in the roundup table. A reconciliation banner compares interactions across the overview, timeline, platform mix and roundups.

## Areas checked

| Area | Audit and resulting behavior |
| --- | --- |
| Database loading | Read-only range queries; open sessions starting before the lookback remain eligible. Minute viewer aggregates preserve raw peak and sample count, with unrounded means. Isolated database test exercises loader and pagination. |
| Dates and platforms | All five date ranges and all six UI platform filters tested. Invalid/future timestamps excluded. Rolling windows include partial days; UTC timeline dates and local table times are distinguished. |
| Stream roundups | Mixed recorded/estimated periods, missing ends, stale session IDs, overlapping broadcasts, adjacent broadcasts, range clipping, more than 30 sessions, unmatched activity and sample assignment tested. Estimates are not called confirmed broadcasts. |
| Overview and platform mix | Meaningful interactions reconcile across sections. Song helper commands contribute to interactions and active tools without becoming request attempts. Zero previous baseline displays New. |
| Timeline | No silent 120-day cutoff. Dates with no recorded interactions are included to preserve time spacing. Zero days do not assert that telemetry was connected. Clicking a date finds overlapping roundups. |
| Viewer metrics | Missing values do not become zero. Platform averages weight sample counts. Sample-covered viewer hours integrate adjacent samples at most five minutes apart; long gaps and lone samples do not establish watch time. Platform peaks may be asynchronous and are labelled as their sum. Overview mean weights sessions equally. |
| Stream outcomes and comparisons | Follow/subscription/raid/share values count recorded events. Subscription events are not asserted to equal individual gifted subscriptions. Tool comparisons show sample sizes and are described as correlations, not causal retention effects. |
| Quiz | Real game-engine event sequence tested through last-survivor victory. Joins, answers, wrong/missed/correct results, response rate, eliminations, repeat players, categories, wins, sudden death, stopped games, completion cohort and shared platform context checked. Preview games retain a no-op analytics recorder. |
| King of the Hill | Vote totals, repeat voters, rankings, game completion cohorts, shared results, round totals and vote averages checked. Whole-game round results versus platform-filtered voters are identified. Average votes per active game is labelled accordingly. |
| Song requests | Stored attempts versus helper commands, statuses, partial/dry-run approval, requester reach, errors and recent ledger checked. Dry-run approval is not labelled actual playback. Command-only failures remain searchable in Activity. |
| Polaroid | Filename-based deduplication, archived/pruned capture records, explicit test exclusions, capture failures versus later delivery failures, historical platform attribution and missing-image placeholders checked. |
| Audience | Stable platform IDs preserve case. Unambiguous name-only history can match a known ID on the same platform; ambiguous or cross-platform identities remain separate. Observed engaged chatters are distinct from all tool participants. Unknown roles are removed when a known role exists. Overlap is non-exclusive and participation depth is not claimed to be retention. |
| Activity | Server-side search covers the full selected period before pagination. Tool/search/page parameters, page bounds and old rows beyond 250 tested. Pagination does not change overview totals. Ordinary chat is used for audience telemetry rather than ledger rows. |
| UI and export | All seven tabs exercised with actual admin API and an isolated database. Desktop and 480px mobile layouts checked. Date navigation, historical search, paging, empty platform, JSON download, failed request and recovery verified. Stale response protection remains enabled. Download includes the current report and activity page; limits are stated. |
| Telemetry ingestion | Streamer.bot and TikFinity null/empty/negative values do not create false zero samples. Real zero is retained. Explicit test lifecycle/outcome payloads are excluded. Display-name casing is preferred. |

## Validation and limitations

- Automated regression suite and isolated database tests pass; the final total is reported with the deployment.
- Browser fixture: 324 overview interactions = 324 timeline interactions = 324 roundup interactions = 324 platform interactions; no browser errors or page-level horizontal overflow at desktop/mobile widths.
- Fixtures exercise the actual admin summary route, not only a mocked report.
- No live analytics records were deleted, reset or fabricated.
- The local connector database contains no live reporting records, and authenticated cloud report access was not available in this session. The specific live 7 September counts cannot be independently attested from the local environment. The regression reproduces the reported missing-day condition; deployment verification checks the served application. The live reconciliation banner provides an additional check on the user's own report.
- Missing historical start/end/viewer telemetry cannot be recovered as exact facts. Activity estimates remain visible and clearly identified.
- Quiz history is limited to 30 games, Hill history to 40 rounds, song/failure tables to 30 rows, and participant rankings to 25. Stream roundups have no row cutoff; the entire activity period is searchable in pages of 100. The JSON download is a report snapshot, not a raw database backup.

## Quiz expansion

The subsequent quiz expansion adds lobby-to-answer conversion, answer timing (mean and median), difficulty results, round survival, question performance with picture clues, player accuracy and completed-game win rates, and clickable recent-game round details. New question-start events record the question identity, difficulty, picture and shuffled choices; the correct choice is recorded only when the round resolves. Accepted-answer events record response time. Preview games still use a no-op recorder.

Historical events contribute to the breakdowns they support. Missing identities, images, timing and difficulty are shown as unavailable, not reconstructed. Question exposure and per-game answer-choice totals use shared game context; response and player measures respect the selected platform. Question search covers all identified questions and displays up to 50 matches. Four additional tests cover real engine timing and last-survivor outcomes, historical gaps, platform separation and zero/invalid timings. Browser checks exercise search, clickable game details, picture clues and mobile layout against the actual API.
