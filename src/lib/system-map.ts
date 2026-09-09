export type SystemLayer = "interface" | "orchestration" | "agent" | "tool" | "structure" | "database" | "delivery";
export type RealityStatus = "live" | "available" | "planned";

export type SystemComponent = {
  id: string;
  name: string;
  layer: SystemLayer;
  status: RealityStatus;
  role: string;
  reality: string;
  href?: string;
  technology?: string;
};

export type SystemConnection = { from: string; to: string; label: string };

export const SYSTEM_COMPONENTS: SystemComponent[] = [
  { id: "telegram", name: "Telegram chat", layer: "interface", status: "live", role: "Primary Dustin ↔ Hermes interface", reality: "Requests, steering, approvals, and scheduled reports are exchanged here.", technology: "Telegram" },
  { id: "north-star-web", name: "North Star web app", layer: "interface", status: "live", role: "Ranked conclusions and drill-down", reality: "Canonical 10 + 10, company models, research, portfolio context, and operating views.", href: "/", technology: "Next.js · React" },
  { id: "hermes-runtime", name: "Hermes PM orchestrator", layer: "orchestration", status: "live", role: "Plans work and synthesizes decisions", reality: "Runs in chat sessions and scheduled jobs; it is not an always-on autonomous trader.", href: "/agents", technology: "Hermes Agent" },
  { id: "scheduled-refresh", name: "Scheduled 10 + 10 refresh", layer: "orchestration", status: "live", role: "Reprices and rechecks the ranked book", reality: "Daily job publishes a versioned snapshot and verifies database and production rendering.", href: "/activity", technology: "Hermes cron" },

  { id: "agent-company", name: "Company analyst", layer: "agent", status: "live", role: "Five-year operating underwriting", reality: "A specialist operating lane invoked by Hermes, not a continuously running daemon.", href: "/companies" },
  { id: "agent-evidence", name: "SEC / evidence analyst", layer: "agent", status: "live", role: "Primary-source retrieval and claim support", reality: "Used when filings are available; foreign-filer coverage can remain limited." },
  { id: "agent-valuation", name: "Valuation analyst", layer: "agent", status: "live", role: "Scenario returns and QQQ hurdle", reality: "LLMs propose assumptions; deterministic code calculates scenario outputs." },
  { id: "agent-theme", name: "Thematic analyst", layer: "agent", status: "available", role: "Cross-company structural research", reality: "Available as a research lane and invoked when the decision requires thematic context.", href: "/personas" },
  { id: "agent-risk", name: "Risk / falsifier analyst", layer: "agent", status: "live", role: "Finds what could make QQQ better", reality: "Explicit risks and monitoring items are present in every current 10 + 10 model." },
  { id: "agent-portfolio", name: "Portfolio / QQQ analyst", layer: "agent", status: "live", role: "Opportunity cost and exposure context", reality: "Reads portfolio snapshots and decision scorecards; does not place orders.", href: "/portfolio" },
  { id: "agent-options", name: "Options specialist", layer: "agent", status: "available", role: "Defined-risk expression analysis", reality: "Invoked selectively. Any trade or order still requires Dustin approval." },
  { id: "agent-review", name: "Independent QA reviewer", layer: "agent", status: "live", role: "Security, logic, test, and release review", reality: "Fresh-context code review runs before verified releases." },

  { id: "sec-edgar", name: "SEC EDGAR tools", layer: "tool", status: "live", role: "Filings and XBRL evidence", reality: "Primary evidence path for U.S. issuers; some ADR/foreign coverage is incomplete.", technology: "SEC EDGAR MCP" },
  { id: "gurufocus", name: "GuruFocus", layer: "tool", status: "available", role: "Quality, valuation, ownership cross-check", reality: "Configured and used selectively as an additional check, not a sole source.", technology: "GuruFocus MCP" },
  { id: "market-data", name: "Market-data adapters", layer: "tool", status: "live", role: "Prices, growth, margins, and historical series", reality: "Yahoo Finance and FinanceToolkit are secondary sources; unreliable cross-currency multiples are excluded." },
  { id: "chrome-qa", name: "Chrome + Playwright QA", layer: "tool", status: "live", role: "Desktop/mobile production verification", reality: "Automated desktop/mobile route, console, error-panel, and 390px overflow checks are available; representative authenticated interactions are checked in Chrome.", technology: "Google Chrome · Playwright" },
  { id: "source-systems", name: "Source-system adapters", layer: "tool", status: "available", role: "Historical and contextual research", reality: "Obsidian, old Awe Capital, and AI Stack are inputs only; they do not define this product." },
  { id: "portfolio-feed", name: "Portfolio snapshots", layer: "tool", status: "live", role: "Current exposure and benchmark context", reality: "IBKR-derived data is read from Supabase. North Star has no broker order path." },

  { id: "ten-plus-ten", name: "10 + 10 snapshot", layer: "structure", status: "live", role: "One ranked Top 10 + Watchlist 10", reality: "The canonical route is /. Legacy /best-ideas redirects to it.", href: "/" },
  { id: "company-models", name: "Company models", layer: "structure", status: "live", role: "Bear / Base / Bull assumptions", reality: "All 20 current companies have deterministic five-year models and data-quality caveats.", href: "/companies" },
  { id: "underwriting-graph", name: "Underwriting graph", layer: "structure", status: "live", role: "Companies ↔ assumptions ↔ forecasts ↔ falsifiers", reality: "Typed graph generation is code-backed; persisted nodes and edges support evidence history." },
  { id: "prompt-registry", name: "Prompt/version registry", layer: "structure", status: "live", role: "Treat natural-language workflows as software", reality: "Stores prompt identity, version, schema version, checksum, and release state without exposing secrets." },
  { id: "agent-run-log", name: "Agent run log", layer: "structure", status: "live", role: "Audit workflow, tools, sources, and output", reality: "Validated API contracts allow future agent runs to record provenance and failure state." },
  { id: "evaluation-loop", name: "Forecast evaluation loop", layer: "structure", status: "live", role: "Compare forecasts with outcomes and QQQ", reality: "The schema and dashboard are live; model outcomes remain open until their evaluation dates.", href: "/evaluation" },
  { id: "outcome-grader", name: "Automated outcome grader", layer: "structure", status: "planned", role: "Close forecasts at scheduled horizons", reality: "Not yet scheduled. The current release creates the contract and keeps open forecasts explicit." },

  { id: "supabase", name: "Supabase brain", layer: "database", status: "live", role: "Source of truth and read models", reality: "Postgres with RLS: publishable-key reads and service-role writes through validated server routes.", technology: "Postgres · Supabase" },
  { id: "github", name: "GitHub + CI", layer: "delivery", status: "live", role: "Version control and quality gates", reality: "Main is tested with lint, typecheck, Vitest, and production build before deployment.", technology: "GitHub Actions" },
  { id: "vercel", name: "Vercel production", layer: "delivery", status: "live", role: "Authenticated web-app deployment", reality: "The canonical production alias is verified only after deployment reaches Ready.", technology: "Vercel" },
];

export const SYSTEM_CONNECTIONS: SystemConnection[] = [
  { from: "telegram", to: "hermes-runtime", label: "requests · steering · approval" },
  { from: "hermes-runtime", to: "agent-company", label: "delegates underwriting" },
  { from: "hermes-runtime", to: "agent-evidence", label: "requests primary evidence" },
  { from: "hermes-runtime", to: "agent-valuation", label: "requests scenarios" },
  { from: "hermes-runtime", to: "agent-risk", label: "requests falsifiers" },
  { from: "agent-evidence", to: "sec-edgar", label: "retrieves filings" },
  { from: "agent-valuation", to: "market-data", label: "checks market inputs" },
  { from: "hermes-runtime", to: "gurufocus", label: "selective cross-check" },
  { from: "portfolio-feed", to: "agent-portfolio", label: "supplies exposure context" },
  { from: "agent-company", to: "company-models", label: "authors assumptions" },
  { from: "company-models", to: "underwriting-graph", label: "normalizes model graph" },
  { from: "agent-run-log", to: "supabase", label: "persists provenance" },
  { from: "prompt-registry", to: "supabase", label: "persists versions" },
  { from: "underwriting-graph", to: "supabase", label: "persists nodes and edges" },
  { from: "ten-plus-ten", to: "supabase", label: "publishes ranked snapshot" },
  { from: "supabase", to: "north-star-web", label: "serves read models" },
  { from: "north-star-web", to: "evaluation-loop", label: "exposes forecast record" },
  { from: "evaluation-loop", to: "hermes-runtime", label: "feeds measured errors back" },
  { from: "outcome-grader", to: "evaluation-loop", label: "will close due forecasts" },
  { from: "github", to: "vercel", label: "deploys verified main" },
  { from: "chrome-qa", to: "vercel", label: "verifies production" },
  { from: "vercel", to: "north-star-web", label: "hosts canonical app" },
  { from: "scheduled-refresh", to: "ten-plus-ten", label: "refreshes daily" },
];

export function systemSummary(components: SystemComponent[]) {
  return components.reduce(
    (summary, component) => ({ ...summary, total: summary.total + 1, [component.status]: summary[component.status] + 1 }),
    { total: 0, live: 0, available: 0, planned: 0 },
  );
}
