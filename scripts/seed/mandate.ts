/**
 * The North Star mandate as source-controlled data. `npm run seed:mandate`
 * upserts it; the UI editor bumps the version on every save afterwards.
 * Rules are distilled from the legacy cockpit (Scoring_Rules.md, the analyst
 * gate contracts, the agent organization charter) and the Hermes kickoff.
 */
export const MANDATE_SEED = {
  id: "north-star",
  title: "North Star Project Hermes",
  mission: "Beat QQQ over 10 years — compound capital above the Nasdaq-100 total return, after fees and taxes, without taking risks that can permanently impair the mission.",
  benchmark_symbol: "QQQ",
  horizon_years: 10,
  hurdle_irr: 0.15,
  rules: [
    { id: "hurdle-15", kind: "gate", title: "15% expected 5-year IRR hurdle on every new underwrite", detail: "Probability-weighted across bear/base/bull scenarios with explicit probabilities; canonical decimal ratios; math_must_work=true." },
    { id: "qqq-alternative", kind: "gate", title: "Every position states why it beats QQQ and what would make QQQ the better hold", detail: "The passive alternative is the null hypothesis. If the answer is 'it tracks the index', it does not earn an active slot." },
    { id: "falsifier", kind: "gate", title: "No thesis without a falsifier, a buy-consideration price and a re-underwrite trigger", detail: "Triggers are watched daily (trigger_watch_events); a pierced trigger opens a re-underwrite, never a silent hold." },
    { id: "downside-first", kind: "gate", title: "Underwrite the bear case first; downside is a scenario, not an adjective", detail: "downside_drawdown_pct is computed from the bear scenario, not asserted." },
    { id: "gates-a-s", kind: "gate", title: "Brad Gates A–S (data integrity, entity identity, source coverage, valuation chassis) must be recorded, never invented", detail: "Absent evidence → status ungated, value null. Fabricated gate values are a persistence error." },
    { id: "facts-vs-inference", kind: "rule", title: "Separate source facts, model inference and human judgment in every memo and note", detail: "Thesis bullets carry FACT / INFERENCE / JUDGMENT labels with a source." },
    { id: "sizing-tiers", kind: "limit", title: "Sizing: Tier-1 conviction 5–10%, Tier-2 2–5%, Public-VC starters 0.5–2% inside a bounded basket", detail: "Top-10 concentration is reported on the hub; sector concentration is a review trigger above 35% of NAV." },
    { id: "thesis-break", kind: "rule", title: "A thesis is broken when growth quality, margins, moat, management credibility or the original reason to own it changes — not when the price moves", detail: "Price moves open reviews; only evidence closes positions." },
    { id: "human-authority", kind: "process", title: "Dustin has final authority on portfolio decisions, sizing, trades, broker authorization and option exercise", detail: "Hermes and every agent research, propose and track. No order entry, ever." },
    { id: "reproducible", kind: "process", title: "Rankings and scores are reproducible from a run date, rule version and snapshot", detail: "framework_version on personas; scoring_version on master scores; mandate version here." },
  ],
  kpis: [
    { id: "ytd-alpha", label: "YTD time-weighted return vs QQQ", target: "> 0pp every year; > +5pp average", source: "ibkr_nav_history / hermes_performance_points" },
    { id: "cumulative-alpha", label: "Cumulative alpha since inception", target: "compounding positive", source: "mission_benchmark" },
    { id: "rolling-sharpe", label: "Rolling 60-day Sharpe", target: "> 1.0", source: "hermes_performance_points" },
    { id: "max-drawdown", label: "Max drawdown vs QQQ max drawdown", target: "not materially worse than the benchmark", source: "hermes_performance_points" },
    { id: "hit-rate", label: "Decision hit rate vs QQQ (adds / trims)", target: "> 55% with positive average alpha", source: "hermes_decision_scorecard" },
    { id: "coverage", label: "Held names with a memo < 90 days old", target: "> 90%", source: "hermes_screener_universe" },
    { id: "pipeline-throughput", label: "Diligence cards resolved (live or archived) per month", target: "≥ 6", source: "hermes_idea_events" },
  ],
  sleeves: [
    { id: "ibkr-core", name: "IBKR Core", role: "Main compounding book — concentrated, benchmark-aware, long-only equities with a defined-risk options overlay", benchmark: "QQQ" },
    { id: "hermes-alpha-sleeve", name: "Hermes Alpha Sleeve", role: "Separately measured $10k sleeve where Hermes proposes and Dustin approves every trade; the proving ground for agent-generated alpha", benchmark: "QQQ", target_weight: 0.0 },
    { id: "public-vc", name: "Public VC basket", role: "Power-law basket of ≤ $30B names, 0.5–2% starters, bounded at 25% of the master blend", benchmark: "QQQ" },
  ],
  guardrails: [
    { id: "no-orders", kind: "limit", title: "Hermes never places, stages or transmits orders; it is a research and decision-support system" },
    { id: "no-secrets", kind: "limit", title: "No credentials, account numbers or keys in the database, notes or memos" },
    { id: "live-db", kind: "limit", title: "INVESTING-BRAIN-AG is the only live database; the Dustin Awe Capital DB is read by import scripts only" },
    { id: "no-invented-evidence", kind: "limit", title: "Never invent source evidence; preserve raw provider payloads and cite filings by accession" },
    { id: "options-disclosure", kind: "limit", title: "Any option structure must show payoff, max loss, Greeks, liquidity, assignment/exercise, tax and tail risk before it reaches Dustin" },
  ],
  metadata: { seeded_by: "scripts/seed/seed-mandate.ts", sources: ["cockpit/00_System/Scoring_Rules.md", "docs/agents/awe-capital-organization.md", "KICKOFF_PROMPT.md"] },
};
