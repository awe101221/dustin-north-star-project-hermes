import type { UniverseRow } from "@/lib/db/quant";

/**
 * Screener engine. A ScreenSpec is a declarative filter set stored as JSON in
 * hermes_quant_jobs.spec so agents can author, run and share screens without
 * touching the UI. Every predicate is optional; numbers are decimal ratios.
 */
export type ScreenSpec = {
  personas?: string[];
  verdicts?: string[];
  sectors?: string[];
  countries?: string[];
  chassis?: string[];
  minExpectedIrr?: number | null;
  minMos?: number | null;
  maxDownside?: number | null; // e.g. -0.35 → require downside >= -0.35 (less negative)
  maxAgeDays?: number | null;
  minMarketCapMm?: number | null;
  maxMarketCapMm?: number | null;
  held?: "any" | "held" | "not_held";
  rankableOnly?: boolean;
  mathMustWork?: boolean;
  buyZoneOnly?: boolean; // quote at/below buy consideration price
  approachingBuyPct?: number | null; // within X of buy price (0.05 = 5%)
  respawnOnly?: boolean;
  text?: string | null;
  sort?: { key: keyof UniverseRow; dir: "asc" | "desc" } | null;
  limit?: number | null;
};

export const DEFAULT_SCREEN: ScreenSpec = {
  personas: [],
  verdicts: ["BUY", "BUY-MORE", "MAINTAIN"],
  minExpectedIrr: 0.15,
  held: "any",
  rankableOnly: false,
  sort: { key: "expectedIrr", dir: "desc" },
  limit: 200,
};

export const SCREEN_PRESETS: Array<{ id: string; name: string; description: string; spec: ScreenSpec }> = [
  {
    id: "hurdle-buys",
    name: "Hurdle-clearing BUYs",
    description: "Latest memos with BUY/BUY-MORE and ≥15% expected IRR, ranked by IRR.",
    spec: { ...DEFAULT_SCREEN },
  },
  {
    id: "buy-zone",
    name: "In the buy zone",
    description: "Names whose live quote sits at or below the memo's buy-consideration price.",
    spec: { verdicts: ["BUY", "BUY-MORE", "WATCH", "MAINTAIN"], buyZoneOnly: true, sort: { key: "mos", dir: "desc" }, limit: 100 },
  },
  {
    id: "approaching",
    name: "Approaching entry (5%)",
    description: "Within 5% above the buy trigger — the names to have orders staged for.",
    spec: { verdicts: ["BUY", "BUY-MORE", "WATCH", "MAINTAIN"], approachingBuyPct: 0.05, sort: { key: "distanceToBuy", dir: "desc" }, limit: 100 },
  },
  {
    id: "held-below-hurdle",
    name: "Held but below hurdle",
    description: "Positions whose latest memo IRR no longer clears 15% — trim candidates.",
    spec: { held: "held", minExpectedIrr: null, sort: { key: "expectedIrr", dir: "asc" }, limit: 100, text: null },
  },
  {
    id: "asymmetric-vc",
    name: "Public VC asymmetry",
    description: "Public-VC lens, small/mid cap, ≥25% IRR and bounded downside.",
    spec: { personas: ["public-vc"], minExpectedIrr: 0.25, maxMarketCapMm: 30_000, maxDownside: -0.6, sort: { key: "expectedIrr", dir: "desc" }, limit: 100 },
  },
  {
    id: "stale-respawn",
    name: "Needs re-underwrite",
    description: "Memos the refresh engine flagged for a rewrite (new filing, pierced trigger, big drift).",
    spec: { respawnOnly: true, sort: { key: "ageDays", dir: "desc" }, limit: 150 },
  },
];

function includesCi(list: string[] | undefined, value: string | null | undefined) {
  if (!list || list.length === 0) return true;
  if (!value) return false;
  return list.some((x) => x.toLowerCase() === value.toLowerCase());
}

export function runScreen(universe: UniverseRow[], spec: ScreenSpec): UniverseRow[] {
  const text = spec.text?.trim().toLowerCase() ?? "";
  let rows = universe.filter((r) => {
    if (!includesCi(spec.personas, r.persona)) return false;
    if (!includesCi(spec.verdicts, r.verdict)) return false;
    if (!includesCi(spec.sectors, r.sector)) return false;
    if (!includesCi(spec.countries, r.country)) return false;
    if (!includesCi(spec.chassis, r.chassis)) return false;
    if (spec.minExpectedIrr !== null && spec.minExpectedIrr !== undefined && (r.expectedIrr ?? -Infinity) < spec.minExpectedIrr) return false;
    if (spec.minMos !== null && spec.minMos !== undefined && (r.mos ?? -Infinity) < spec.minMos) return false;
    if (spec.maxDownside !== null && spec.maxDownside !== undefined && (r.downside ?? -Infinity) < spec.maxDownside) return false;
    if (spec.maxAgeDays !== null && spec.maxAgeDays !== undefined && (r.ageDays ?? Infinity) > spec.maxAgeDays) return false;
    if (spec.minMarketCapMm !== null && spec.minMarketCapMm !== undefined && (r.marketCapMm ?? -Infinity) < spec.minMarketCapMm) return false;
    if (spec.maxMarketCapMm !== null && spec.maxMarketCapMm !== undefined && (r.marketCapMm ?? Infinity) > spec.maxMarketCapMm) return false;
    if (spec.held === "held" && !(r.heldWeight && r.heldWeight > 0)) return false;
    if (spec.held === "not_held" && r.heldWeight && r.heldWeight > 0) return false;
    if (spec.rankableOnly && !r.rankable) return false;
    if (spec.mathMustWork && r.mathMustWork !== true) return false;
    if (spec.buyZoneOnly && !(r.distanceToBuy !== null && r.distanceToBuy >= 0)) return false;
    if (spec.approachingBuyPct !== null && spec.approachingBuyPct !== undefined) {
      if (r.distanceToBuy === null) return false;
      if (r.distanceToBuy > 0 || r.distanceToBuy < -spec.approachingBuyPct) return false;
    }
    if (spec.respawnOnly && !r.respawn) return false;
    if (text) {
      const hay = `${r.ticker} ${r.symbol} ${r.companyName} ${r.sector ?? ""} ${r.industry ?? ""}`.toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  });

  const sort = spec.sort ?? { key: "expectedIrr", dir: "desc" };
  const dir = sort.dir === "asc" ? 1 : -1;
  rows = [...rows].sort((a, b) => {
    const av = a[sort.key] as number | string | null | boolean;
    const bv = b[sort.key] as number | string | null | boolean;
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
  if (spec.limit) rows = rows.slice(0, spec.limit);
  return rows;
}

export function summarizeScreen(rows: UniverseRow[]) {
  const irr = rows.map((r) => r.expectedIrr).filter((x): x is number => x !== null);
  const held = rows.filter((r) => (r.heldWeight ?? 0) > 0).length;
  return {
    count: rows.length,
    held,
    medianIrr: irr.length ? [...irr].sort((a, b) => a - b)[Math.floor(irr.length / 2)] ?? null : null,
    personas: Array.from(new Set(rows.map((r) => r.persona))),
    tickers: rows.slice(0, 50).map((r) => r.ticker),
  };
}
