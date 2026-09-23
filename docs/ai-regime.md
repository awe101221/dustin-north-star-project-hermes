# AI Regime sleeve

`/ai-regime` is a read-only research sleeve workspace for AI, Physical AI, Space
AI/infrastructure, and second-order hidden beneficiaries. It is subordinate to
the canonical core 10 + 10 and `/challengers`. It makes no database writes and
requires no migration. The navigation shortcut is `g d`.

The first production state may show **No approved sleeve roster yet**. That is
intentional. The page still renders mandate, taxonomy, valuation playbooks, and
workflow. Names, ranks, returns, and membership are never invented in code.
V1 is explicitly empty-only: it has no privileged approved-roster input and does
not claim to support approved-state rendering. A later reviewed publication path
must enforce at most 10 entries per lane before approved rows can render.

## Authority

- Only explicit Dustin approval, persisted through a privileged publication path,
  can place a name on the sleeve Top 10 or Watchlist 10. `hermes_ideas.metadata`
  is untrusted for membership: `POST /api/agent/ideas` accepts unrestricted JSON,
  so `membershipAuthority: "dustin-approved"` on an idea record cannot authorize
  roster membership.
- Thematic mapping or a metadata-only hurdle indication can only produce
  `candidate`, `monitor`, or `tournament-candidate` consideration. Tournament
  admission requires one-ticker Underwriter → independent Evidence & Risk
  Reviewer → North Star PM review, with Dustin retaining final authority, and a
  privileged immutable publication.
- This page cannot change core 10 + 10 membership, position size, or trades.
- Current core 10 + 10 members are excluded from the sleeve roster so the sleeve
  cannot silently mutate the canonical list.

## Gates

- Strict five-year Capital Line: modeled 5-year expected IRR **greater than** 15%. The Capital Line is populated only when that hurdle clears. It is the alpha line versus QQQ, not the door into the 10+10.
- 10+10 entry: modeled 5-year expected IRR **greater than** 12%. A name does not have to clear the Capital Line to enter. From there the best names are ranked.
- The tournament has no IRR admission floor. It is where names are considered for the 10+10 and watched for price, earnings, or an announcement, for both Core and the AI sleeve.
- Ten-year outputs are historical context only. They cannot drive admission,
  rerank, or displacement.
- Every row sourced only from agent-writable `hermes_ideas.metadata.aiRegime`
  remains unreviewed and evidence-blocked. Self-declared A/B grades or
  `reviewed` / `pm-approved` labels cannot create a positive `clear` state.
- Models expire at 45 days; events within 14 days or already passed require refresh.
- QQQ remains the default when evidence is stale, incomplete, inconsistent, or
  noncanonical.

## Valuation playbook shown in the UI

Forward value is core/base business value + evidence-weighted transition
economics + milestone/probability-discounted option value, with reverse
expectations and explicit capex, financing, dilution, and downside. A nonempty
`valuationArchetype` and asserted IRRs are metadata completeness, not acceptance
or evidence that this valuation contract was performed. History is a base-rate
anchor, not the sole forecast. TAM-only value is forbidden.

## Metadata contract

Record sleeve underwriting in the existing `hermes_ideas.metadata.aiRegime`
object. Unrelated metadata is preserved. No metrics are inferred from a ticker,
company name, tags, or score.

| Field | Contract |
| --- | --- |
| `domains[]` | One or more taxonomy slugs from the regime map. |
| `exposureType` | `direct`, `enabler`, `hidden-beneficiary`, or `threatened`. |
| `thesis` | Nonempty sleeve thesis. Idea-level `whyBeatQqq` and `falsifier` are also required; missing QQQ case or falsifier fail-closes the row. |
| `hiddenBeneficiaryReason` | Required when exposure is `hidden-beneficiary`. |
| `valuationArchetype` | Nonempty playbook label, typically `core-plus-transition-plus-option`. |
| `themeFit` | Fraction or percentage from 0 through 100%. |
| `monetizationStage` | Optional stage string. |
| `evidenceGrade` | Informational self-declared `A`, `B`, `C`, or `D`; it cannot clear an idea-metadata row. |
| `modelAsOf` | ISO date or timestamp with explicit timezone. |
| `nextEventAt` | ISO date/timestamp with timezone, or explicit `null`. |
| `reviewStatus` | Informational claim only. `reviewed` or `pm-approved` in idea metadata cannot clear review. |
| `sleeveStatus` | `candidate`, `monitor`, `tournament-candidate`, `top10`, or `watchlist10`. Legacy `tournament` is downgraded to `tournament-candidate`; the last two are ignored without privileged publication. |
| `sleeveRank` | Optional positive integer. |
| `fiveYearExpectedIrr` | Asserted annualized five-year **price-only** return on `modelAsOf`; both metadata comparisons use this same value and date. It remains unreviewed until privileged publication. |
| `tenYearExpectedIrr` | Optional historical-context output; never a gate. |
| `requiredFiveYearIrr` | Optional; effective hurdle is at least the 12% Capital Line. |
| `requiredTournamentFiveYearIrr` | Optional; effective five-year tournament door is the greater-than-12% Capital Line. A stored 15% floor is not required. |
| `hurdlePrice` | Optional positive price. |
| `membershipAuthority` | Informational and untrusted. Even `dustin-approved` cannot authorize membership from idea metadata. |
| `returnBasis` | Exact `five-year-price-only`; any other value makes metadata incomplete. |
| `qqqComparisonAsOf` | Must normalize to the same instant as `modelAsOf`. |
| `probabilityWeighting` | Exact `bear-base-bull`. |
| `dividendsIncluded` | Exact `false`; dividend-inclusive returns are noncanonical. |
| `valuationContract` | All five booleans must be true: `coreBaseValue`, `transitionEconomics`, `probabilityDiscountedOptionValue`, `reverseExpectations`, and `capexFinancingDilutionDownside`. These remain self-declared metadata, not review authority. |

Return units follow the Challenger board: absolute numbers greater than 1 are
percentage points; `-1` through `1` are fractions.

A positive `clear`, Capital Line, tournament, or roster-eligible state requires a
privileged immutable publication that binds the reviewed content, provenance,
content hash, and as-of date. The publication path must enforce a maximum of 10
entries in each sleeve lane. A sealed thematic tournament watch row is rendered only from
`hermes_sleeve_watch_publications`, not from idea metadata. That row is not
sleeve Top 10 or Watchlist 10. The table rejects a roster write. Dustin still
approves every 10+10 write.

## Rollback

The watch-publication table is additive and empty until a privileged writer inserts a reviewed row. It cannot store a roster write. To roll this change back, revert the commit and leave or drop `hermes_sleeve_watch_publications`. Do not use that table as a 10+10 roster.
