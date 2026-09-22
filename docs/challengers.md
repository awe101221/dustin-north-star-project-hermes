# 10 + 10 Challenger Board

`/challengers` is a read-only projection of existing `hermes_ideas` and the current
`BestIdeasDashboard`. It makes no database writes and requires no migration.
The home page and primary navigation link to it; the navigation shortcut is `g h`.
Company models, pipeline cards, and Quant remain the research workflow.

The page also surfaces the latest independently reviewed PM tournament ahead of the
general candidate queue. Tournament rank is preserved separately from current portfolio
posture: an owned security can remain the reviewed `first alternate` while its live idea
card correctly stays in `owned-position review`. Neither label changes the 10 + 10.
The tournament finds names that deserve a place in the 10 + 10 and can replace a weaker current name. It also watches possible contenders, and names that have fallen out, for a return on price, earnings, or a material announcement. A certified name enters that comparison when it beats the weakest current name on the same date and basis. Capital Line stays greater than 12% and is not membership. The admission door is greater than 12%, the same Capital Line. A pass does not displace anyone. Dustin approves every roster write.

## Tournament synchronization

`scripts/sync/challenger_board_sync.py` reconciles the latest completed North Star PM
tournament from the active Hermes Kanban databases into the matching active
`hermes_ideas.metadata.challenger` objects. It is fail-closed and will not publish when:

- a candidate lacks an accepted independent-review audit entry;
- an accepted Evidence & Risk run lacks an exact structured `metadata.verdict` of `PASS`
  or `PASS WITH CAVEATS` (task results and summaries are never verdict fallbacks);
- accepted-review, audit, and candidate identities are not exactly the same set;
- the Evidence & Risk task title/body does not bind to that candidate ticker, or its completed
  run is not joined to that exact task (an explicit run-metadata ticker is verified when present);
- a required return, price, evidence, model-date, basis, or disposition field is missing;
- a timestamp lacks an explicit timezone, a grade is outside A/B/C/D and the exact reviewed
  legacy B- normalization allowlist, a supplied rank conflicts, or an integer identity is boolean;
- a candidate maps to zero or multiple active idea records;
- destination metadata, challenger, or tournament containers are malformed;
- the packet attempts an automatic `admit`; or
- the configured Supabase project is not `INVESTING-BRAIN-AG`.

If separately installed and enabled, a production scheduler may run the deterministic script every
15 minutes; this repository does not install or enable that scheduler. Writes use
compare-and-set versions and a two-phase immutable manifest: every row is staged with
`publicationComplete: false`, the complete candidate set is read back, then completion
markers advance. The UI renders a tournament only when every expected row is complete and
its ordered identities, candidate-set hash, `reviewedContentHash`, manifest hash, PM source run,
count, every frozen reviewed field, and shared provenance all verify. A crash or retry therefore
cannot expose a partial tournament. Hash inputs use a type-tagged canonical envelope, sort object
keys by UTF-16 code units, preserve UTF-8 text, encode numbers as big-endian IEEE-754 binary64
hex, and normalize signed zero. This keeps strings distinct from numbers and prevents Python,
TypeScript, or JSONB numeric formatting from changing the reviewed publication identity.
Writes are idempotent, preserve unrelated idea metadata, and end with exact readback.
The local receipt is `~/.hermes/state/challenger-board-sync.json`. The script never changes
membership, pipeline stage, position size, or trades. Its fixed process lock is
`~/.hermes/state/challenger-board-sync.lock`, regardless of a custom receipt path.

## Metadata contract

Record candidate underwriting in the existing `hermes_ideas.metadata.challenger`
object. No metrics are inferred from a ticker, company name, tags, or score.
Legacy ideas without this object remain visible with blocked evidence.

| Field | Contract |
| --- | --- |
| `discoveryLane` | Nonempty source-lane string, trimmed and lowercased, e.g. `quality-drawdown` or `estimate-inflection`. Missing values display as `unclassified` and block review. |
| `expectedIrr` | Modeled annualized return. Fraction, percentage number, numeric string, or percent string. |
| `requiredIrr` | Positive annualized return stored with the packet. The admission door is greater than 12%, the same Capital Line. A stored 15% floor is not required. |
| `hurdlePrice` | Positive price at the required return, in the same quote currency as `currentPrice`. |
| `currentPrice` | Positive recorded model price. This is not a live quote. |
| `evidenceGrade` | `A`, `B`, `C`, or `D` (case insensitive). Only A and B clear evidence. Unknown grades are missing evidence. |
| `portfolioFit` | Fraction or percentage from 0 through 100%; normalized to a fraction. This is a supplied judgment, not calculated exposure. |
| `modelAsOf` | ISO date or timestamp with explicit timezone. Must not be in the future. |
| `nextEventAt` | ISO date or timestamp with explicit timezone, or explicit `null` for no scheduled event. Missing or invalid values block evidence. |
| `reviewStatus` | `reviewed` or `pm-approved` clears independent review. Other nonempty statuses require refresh; missing status blocks evidence. |
| `admissionDecision` | Optional exact disposition: `admit`, `first alternate`, `watch / price trigger`, `owned-position review`, or `reject`. Unknown nonempty decisions block evidence. |
| `tournament` | Optional reviewed-PM provenance: tournament/task id, PM `sourceRunId`, comparison and completion timestamps, nonempty incumbent/terminal label/summary, source comment, accepted review task/run, rank, reviewed disposition, model basis, return-basis diagnostics, and portfolio-fit caveat. A published tournament also requires `expectedCandidateCount`, `orderedCandidateIdentities`, `candidateSetHash`, `reviewedContentHash`, `manifestHash`, and `publicationComplete`. `reviewedContentHash` seals every normalized shared-provenance and candidate-specific frozen field, not only candidate identities. |

For an explicit one-time adoption of a same-id legacy tournament that has neither
`sourceRunId` nor `manifestHash`, the synchronizer compares every already-present controlled
field with the normalized reviewed source before adding the manifest. Equivalent timestamp
offsets are accepted only when they represent the same instant; date-only values must be the
same date. Any changed rank, disposition, return, price, date, basis, evidence grade, or review
task/run/verdict blocks adoption. Unrelated custom metadata is preserved.

For returns and fit, absolute numbers greater than 1 are percentage points; numbers
from -1 through 1 are fractions. Thus `18`, `"18%"`, and `0.18` all mean 18%;
`1` means 100%, while `"1%"` means 1%. Blank, boolean, nonfinite, and malformed
values are unavailable. Prices are never percentage-normalized. Thesis, why-beat-QQQ,
and falsifier must also be present on the idea. Prices are displayed without a
currency assumption; a price trigger alone cannot establish admission eligibility.

## Gates and dispositions

Gate precedence is evidence blocked, stale model, pending refresh, clear. The UI
also retains every applicable reason. Models at least 45 days old are stale.
Events at or before 14 days from the board time, including passed events, require
refresh until the event metadata is updated. Missing fields never use zero as a
substitute, and future model dates cannot clear freshness.

First alternate requires clear gates, expected IRR at or above the effective
hurdle, and strictly higher returns than both incumbent floors. Admit additionally
requires explicit `admissionDecision: "admit"` and `reviewStatus: "pm-approved"`.
An explicit reject is preserved. A recorded nonzero position weight or explicit
owned-position review routes to owned-position review. Explicit watch stays watch.
Blocked candidates default to watch / price trigger. With clear gates, a return
below the Watchlist floor defaults to reject; other nonqualifiers stay watch.
An explicit first alternate that no longer qualifies stays watch for renewed review.
The original decision is always displayed alongside the effective disposition.
None of these labels changes membership, sizes a position, or authorizes a trade.

## Comparisons and ordering

Current Top 10 and Watchlist members are excluded by trimmed, case-insensitive bare
symbol. Candidates are deduplicated on that same key, newest `updatedAt` first,
then lexical ID and ticker for ties. The newest archived card is excluded when
archived ideas are supplied. The server uses `getIdeas`' existing active-card read
(currently capped at 2,000 rows); source-lane counts describe the loaded population.

Each incumbent floor is the lowest normalized modeled return in its lane, with
lexical ticker ties. An empty lane or any missing modeled return makes its floor
and comparisons unavailable. Snapshot date and source mode remain visible. The
scored idea-table fallback normally has unavailable modeled returns; its scores
are never substituted for returns. Comparisons do not validate incumbent freshness
or automatically prove a superior QQQ-relative investment case.

The deterministic triage score (0–100) is 40 × clamp(expected / required, 0, 2) / 2,
plus evidence points (A=40, B=30, C=15, D=0), plus 20 × portfolio fit. Missing any
component leaves the score unavailable. It is a review aid, not a probability or
candidate return. Sort order is disposition (admit, first alternate, watch,
owned review, reject), clear gates first within each disposition, descending score,
then bare symbol and ID. Summaries and alphabetically sorted source-lane counts use
only the final deduplicated candidate set; blocked counts include stale and pending
refresh gates. Clears-hurdle counts require both a sufficient return and clear gates.
