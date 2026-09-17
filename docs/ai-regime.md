# AI Regime sleeve

`/ai-regime` is a read-only research sleeve workspace for AI, Physical AI, Space
AI/infrastructure, and second-order hidden beneficiaries. It is subordinate to
the canonical core 10 + 10 and `/challengers`. It makes no database writes and
requires no migration. The navigation shortcut is `g d`.

The first production state may show **No approved sleeve roster yet**. That is
intentional. The page still renders mandate, taxonomy, valuation playbooks, and
workflow. Names, ranks, returns, and membership are never invented in code.

## Authority

- Only explicit Dustin approval, persisted through a privileged publication path,
  can place a name on the sleeve Top 10 or Watchlist 10. `hermes_ideas.metadata`
  is untrusted for membership: `POST /api/agent/ideas` accepts unrestricted JSON,
  so `membershipAuthority: "dustin-approved"` on an idea record cannot authorize
  roster membership.
- Thematic mapping, Capital Line passage, or the 15% tournament hurdle can only
  produce `candidate`, `monitor`, or `tournament` states.
- This page cannot change core 10 + 10 membership, position size, or trades.
- Current core 10 + 10 members are excluded from the sleeve roster so the sleeve
  cannot silently mutate the canonical list.

## Gates

- Strict five-year Capital Line: modeled 5-year expected IRR **greater than** 12%.
- Separate ten-year thematic tournament hurdle: 15%.
- Evidence grades A/B can clear; C/D or missing grades block.
- Models expire at 45 days; events within 14 days or already passed require refresh.
- QQQ remains the default when evidence is stale, incomplete, inconsistent, or
  noncanonical.

## Valuation playbook shown in the UI

Forward value is core/base business value + evidence-weighted transition
economics + milestone/probability-discounted option value, with reverse
expectations and explicit capex, financing, dilution, and downside. History is a
base-rate anchor, not the sole forecast. TAM-only value is forbidden.

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
| `evidenceGrade` | `A`, `B`, `C`, or `D`. Only A and B can clear. |
| `modelAsOf` | ISO date or timestamp with explicit timezone. |
| `nextEventAt` | ISO date/timestamp with timezone, or explicit `null`. |
| `reviewStatus` | `reviewed` or `pm-approved` can clear review. |
| `sleeveStatus` | `candidate`, `monitor`, `tournament`, `top10`, or `watchlist10`. The last two are ignored without Dustin approval. |
| `sleeveRank` | Optional positive integer. |
| `fiveYearExpectedIrr` | Modeled annualized 5-year return. |
| `tenYearExpectedIrr` | Modeled annualized 10-year return. |
| `requiredFiveYearIrr` | Optional; effective hurdle is at least the 12% Capital Line. |
| `requiredTenYearIrr` | Optional; effective hurdle is at least 15%. |
| `hurdlePrice` | Optional positive price. |
| `membershipAuthority` | Exact `dustin-approved` is required for sleeve 10 + 10. |

Return units follow the Challenger board: absolute numbers greater than 1 are
percentage points; `-1` through `1` are fractions.

A sealed thematic tournament is not rendered until independently reviewed
hash-verified provenance exists. Publication of candidate or roster data is a
separate reviewed task.
