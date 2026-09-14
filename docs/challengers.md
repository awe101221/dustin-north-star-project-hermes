# 10 + 10 Challenger Board

`/challengers` is a read-only projection of existing `hermes_ideas` and the current
`BestIdeasDashboard`. It makes no database writes and requires no migration.
The home page and primary navigation link to it; the navigation shortcut is `g h`.
Company models, pipeline cards, and Quant remain the research workflow.

## Metadata contract

Record candidate underwriting in the existing `hermes_ideas.metadata.challenger`
object. No metrics are inferred from a ticker, company name, tags, or score.
Legacy ideas without this object remain visible with blocked evidence.

| Field | Contract |
| --- | --- |
| `discoveryLane` | Nonempty source-lane string, trimmed and lowercased, e.g. `quality-drawdown` or `estimate-inflection`. Missing values display as `unclassified` and block review. |
| `expectedIrr` | Modeled annualized return. Fraction, percentage number, numeric string, or percent string. |
| `requiredIrr` | Positive annualized return hurdle, in the same units. Effective hurdle is at least 15%; missing/invalid values block review. |
| `hurdlePrice` | Positive price at the required return, in the same quote currency as `currentPrice`. |
| `currentPrice` | Positive recorded model price. This is not a live quote. |
| `evidenceGrade` | `A`, `B`, `C`, or `D` (case insensitive). Only A and B clear evidence. Unknown grades are missing evidence. |
| `portfolioFit` | Fraction or percentage from 0 through 100%; normalized to a fraction. This is a supplied judgment, not calculated exposure. |
| `modelAsOf` | ISO date or timestamp with explicit timezone. Must not be in the future. |
| `nextEventAt` | ISO date or timestamp with explicit timezone, or explicit `null` for no scheduled event. Missing or invalid values block evidence. |
| `reviewStatus` | `reviewed` or `pm-approved` clears independent review. Other nonempty statuses require refresh; missing status blocks evidence. |
| `admissionDecision` | Optional exact disposition: `admit`, `first alternate`, `watch / price trigger`, `owned-position review`, or `reject`. Unknown nonempty decisions block evidence. |

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
