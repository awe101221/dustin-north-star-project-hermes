# QQQ Top 50 ranking workflow

Dustin's instruction replaces both Top 10 / Watchlist 10 surfaces with
one Top 50 per sleeve: `core` (North Star) and `ai-regime`. Rank is determined
only by modeled likelihood of beating QQQ. The announced working comparison
is **five years**, on a shared **USD price-only** basis; the broader ten-year
investment mandate remains separate. This is a research ranking; portfolio sizing and execution
remain separate. There is no 12% or 15% admission floor, lane, or stage bonus.

## Forecast contract

`src/lib/qqq-rankings.ts` exports `rankingDraftSchema`. Use
`npm run rankings -- schema` for its JSON schema and `validate FILE` to check a
draft, compute its exact content hash, and inspect the proposed order.

Each draft has `schemaVersion: "qqq-top50/v1"`, `sleeve`, an ISO timestamp `asOf`,
`horizonYears: 5`, `returnBasis: "price-only"`, `benchmark: "QQQ"`,
`benchmarkAsOf`, `benchmarkPrice`, `benchmarkEvidenceUrls`, `benchmarkScenarios`, `methodology`, and
`forecasts`. Each forecast needs securityId, ticker, companyName, modelAsOf, priceAsOf,
currentPrice, currency, thesis, whyBeatQqq, falsifier, nextAction, theme,
evidenceUrls, limitations, capitalStructure, probabilityRationale, and three to twelve matched scenarios. Each scenario
has name, benchmarkScenario, probability, stockAnnualizedReturn, stockTerminalPrice, qqqAnnualizedReturn, and rationale.
Numbers are decimal ratios. Canonical decimal probability weights sum to exactly one, and benchmark marginals match exactly. No residual tolerance or silent normalization is applied.
All stock and QQQ outcomes are in USD. Native-currency forecasts without an evidenced USD/FX bridge are unranked; a local-currency return cannot be compared directly with QQQ's USD return.
The five-year terminal price must reproduce the stock CAGR within a tight relative arithmetic tolerance. Each scenario's rationale traces economic drivers to its per-share
outcome. `capitalStructure` records the share basis, financing, corporate
actions, and material dilution bounds; `probabilityRationale` explains the
subjective outcome weights. Independently verify primary sources, security
identity, these bounds, and decision-useful falsifiers. A naked CAGR or a
terminal price chosen to reproduce the legacy ranking is not rankable.

The shared `benchmarkScenarios` array contains three to five QQQ scenarios with
name, probability, annualizedReturn, and rationale. Every company must have the
same marginal QQQ distribution: group its joint scenarios by benchmarkScenario;
their probability mass must equal that QQQ scenario's probability, and each
qqqAnnualizedReturn must equal that shared QQQ scenario's annualizedReturn.
Conditional company outcomes may differ within a QQQ scenario. Use the same
reviewed QQQ distribution in both sleeves, rather than selecting an easier
benchmark for a favored company.

Use the same regular-session valuation timestamp for stock and QQQ. Scenarios
are **joint** stock/benchmark outcomes, incorporating common macro conditions,
company execution, valuation, financing, and dilution. The methodology must
explain how probabilities and QQQ outcomes were selected. Rank probability is
`sum(probability where stockAnnualizedReturn > qqqAnnualizedReturn)`. Equal
returns count as no outperformance. Equal probabilities sort alphabetically,
never by position size, conviction, pipeline stage, or expected return. These
are subjective model estimates, not measured or calibrated success rates.
Canonical decimal scenario weights are summed and compared exactly before conversion to display numbers, so floating-point addition cannot change a tie or erase a genuine difference.

Supply at least 50 independently reviewed, fresh forecasts in each sleeve to
fill it; a larger research universe may be supplied, and the engine takes the
first 50. A company may be researched in both sleeves, using one canonical
same-date numeric forecast. Theme-specific explanations may differ; the same
stock cannot receive two probabilities for the same comparison. No name is invented or
excluded simply because it appears in the other sleeve. Missing forecasts and
models or prices 45 days old are unranked, with coverage shown on the page.
Never convert the old score, expected IRR, or capital hurdle into a probability.
Re-use existing underwriting and cards; preserve unresolved evidence gaps.

## Independent review and publication

1. Author saves a draft artifact and validates it. Canonical review bytes are
   UTF-8 `JSON.stringify(rankingDraftSchema.parse(draft))`; the CLI writes those
   exact bytes with `--canonical FILE`. Save their SHA-256.
2. Evidence & Risk independently reviews those exact bytes, prices, sources,
   operating/share-count assumptions, scenario probabilities, QQQ comparator,
   mathematics, and limitations. Require `PASS` or `PASS WITH CAVEATS` and the
   author's exact hash. Missing evidence is a gap, not a fabricated estimate.
3. North Star PM accepts that exact hash after review and explicitly decides
   `APPROVE RANKING PUBLICATION`. Record distinct author/reviewer/PM identities,
   actual task/run ids and review/approval timestamps. A new content hash needs
   a new review and approval.
4. A publication is `{draft, author, review, approval}`. Keep its exact reviewed
   artifacts in `src/lib/reviewed-qqq-rankings.json`, with the identity master and
   actual authority exports, through a reviewed PR. Run `verify --require-full`
   and the required software checks. A release contains exactly fifty forecasts
   in each sleeve, one common model as-of, and one actual two-hash PM decision.
5. Apply `20261008111533_qqq_top50_publications.sql` to INVESTING-BRAIN-AG. It
   creates only `hermes_qqq_ranking_releases`, enables RLS, revokes public and
   authenticated access, and grants the service role SELECT/INSERT only. The
   app uses session-checked privileged reads; the agent GET uses bearer auth.
6. After the review gates, run the privileged CLI below. It re-exports and
   compares the actual completed Hermes task/run records, verifies all hashes,
   identities, probabilities, freshness and chronology, and inserts both sleeves
   and their evidence registry in one immutable row. It verifies the stored
   payload and actual active snapshot. Repeating the same exact hash is safe;
   no UPDATE/DELETE or legacy writes are used. Equal-precedence conflicting
   snapshots are rejected. A newer active release prevents an older publication.
7. Verify actual fifty-row desktop/mobile pages, order, probabilities, sources,
   hashes, retained-rank search, redirects and dossiers; complete required CI and
   production READY verification. For this initial replacement, the old pages
   remain active until the reviewed software PR is merged. Future refreshes use
   the same financial gates and software checks, then verify the live release.
   Preserve old snapshots. Corrections need new reviewed content and a strictly
   later actual PM approval; do not rewrite or delete a published release.

```sh
npm run rankings -- publish-db PUBLICATIONS --board awe-capital --securities SECURITIES --authorities AUTHORITIES
npm run rankings -- inspect-db
```

All live storage remains in INVESTING-BRAIN-AG. The repository files are review
artifacts; runtime rankings come from the validated Supabase snapshot. Idea/note
metadata cannot authorize a rank. Old `best-ideas-snapshot` notes and the
short-horizon ledger remain historical data; the old learning CLI no longer
publishes new 10+10 rankings. Continue grading already registered outcomes.
Move the weekday ranking refresh to this contract.

## Security identity and completed authority records

Use an evidenced ISIN (`ISIN:...`) or a ten-digit SEC issuer CIK and precise traded security class (`SEC:0000000000:COMMON-A`, including ADS/ADR terms where applicable) as `securityId`. This stable instrument key prevents ticker aliases from receiving duplicate forecasts. Independent reviewers verify the security/class against primary evidence.

Export real completed Hermes task/run records before merging:

```sh
npm run rankings -- export-authorities PUBLICATIONS --board awe-capital --output src/lib/reviewed-ranking-authorities.json
npm run rankings -- verify --require-full
```

The actual run profile, terminal status and metadata must match the exact content hash and verdict/decision. Completion metadata includes `contentHash` (or `content_hash`) and `verdict`/`decision`; a two-sleeve PM closeout may supply these in a `publications` array. Do not hand-author receipt identities. CI and the runtime reject unmatched authority readbacks. The privileged publication command rechecks exported readbacks against the actual board; draft role names alone cannot create authority. Runtime revalidates the exact stored payload and its signed evidence registry.

Both active sleeves share the exact QQQ timestamp, price, scenario names, weights and returns. Submit their refresh together. A correction with the same model as-of activates by its later PM approval timestamp; inactive future publications do not affect current consistency.

Authors work one ticker and one framework per Hermes card, with an independent Evidence & Risk review per company before final sleeve review and PM closeout.

## Author submissions and identity resolution

`author` contains `submissions`, one attestation per forecast: `actor: investment-underwriter`, `securityId`, `taskId`, `runId`, `contentHash`, `submittedAt`, and `decision: AUTHOR FORECAST SUBMISSION`. The contribution hash is the canonical one-forecast draft with `sleeve` normalized to `core`, retaining the final shared header and the exact forecast. This binds the same authored stock/QQQ model across sleeves without assigning a multi-company author card. After mechanical calculations, the underwriter confirms the exact canonical one-ticker artifact. Independent review starts only after every author's confirmation run has completed.

All attestation timestamps equal the authoritative Hermes run `ended_at` timestamp. PM approval starts after independent review completed. Equal-precedence corrections with different hashes are rejected.

Stages must occupy strictly later seconds: author completion precedes independent review start, and review completion precedes PM start. Each runtime request and CLI operation captures one activation timestamp for consistency checks and both sleeve selections. The loader returns only publications active at that validated snapshot.

`src/lib/reviewed-ranking-securities.json` retains the reviewed identity-master artifact. The active Supabase release stores and supplies the matching master at runtime. Each entry records one canonical ID, canonical ticker, evidenced external identifier aliases and ticker aliases, and primary evidence URLs. Both identifier namespaces and equivalent share-class names must resolve through that master. Unknown or ambiguous aliases are rejected at the publication boundary. Canonicalize identifiers before final author confirmation and review; never silently change already reviewed bytes. Research candidates without resolved identity keep their full exchange-prefixed ticker and remain visible as unresolved coverage.

Publication rejects recognized noncanonical IDs as well: normalize the research draft first, then confirm and review its canonical bytes. Explicit unknown/conflicting candidate IDs remain unresolved even if their ticker is already covered.
