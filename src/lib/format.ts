/**
 * Number/date formatting for a PM terminal: compact, tabular, unambiguous.
 * Every helper accepts null/undefined and renders an em-dash rather than "NaN".
 */

const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 2 });
const num0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const num1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const num2 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export const DASH = "—";

export function fmtMoney(value: number | null | undefined, opts: { cents?: boolean; compact?: boolean } = {}) {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  if (opts.compact) return fmtCompactMoney(value);
  return opts.cents ? usd2.format(value) : usd0.format(value);
}

export function fmtCompactMoney(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

const numCache = new Map<number, Intl.NumberFormat>();

export function fmtNum(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  if (digits === 0) return num0.format(value);
  if (digits === 1) return num1.format(value);
  if (digits === 2) return num2.format(value);
  let f = numCache.get(digits);
  if (!f) {
    f = new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
    numCache.set(digits, f);
  }
  return f.format(value);
}

/** Decimal ratio -> percent string. 0.196 -> "19.6%". */
export function fmtPct(value: number | null | undefined, digits = 1, opts: { sign?: boolean } = {}) {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  const pct = value * 100;
  const sign = opts.sign && pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(digits)}%`;
}

/** Percentage points (already ×100). */
export function fmtPp(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}pp`;
}

export function fmtMultiple(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  return `${value.toFixed(digits)}x`;
}

export function fmtPrice(value: number | null | undefined, currency = "USD") {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  if (currency === "USD") return usd2.format(value);
  return `${num2.format(value)} ${currency}`;
}

export function fmtDate(value: string | Date | null | undefined, style: "short" | "long" | "iso" = "short") {
  if (!value) return DASH;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return DASH;
  if (style === "iso") return date.toISOString().slice(0, 10);
  return date.toLocaleDateString("en-US", style === "short"
    ? { month: "short", day: "numeric", year: "2-digit", timeZone: "UTC" }
    : { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function fmtDateTime(value: string | Date | null | undefined) {
  if (!value) return DASH;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return DASH;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function fmtRelative(value: string | Date | null | undefined, now = new Date()) {
  if (!value) return DASH;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return DASH;
  const diff = (now.getTime() - date.getTime()) / 1000;
  const abs = Math.abs(diff);
  const suffix = diff >= 0 ? "ago" : "from now";
  if (abs < 60) return "just now";
  if (abs < 3600) return `${Math.round(abs / 60)}m ${suffix}`;
  if (abs < 86400) return `${Math.round(abs / 3600)}h ${suffix}`;
  if (abs < 86400 * 30) return `${Math.round(abs / 86400)}d ${suffix}`;
  if (abs < 86400 * 365) return `${Math.round(abs / (86400 * 30))}mo ${suffix}`;
  return `${(abs / (86400 * 365)).toFixed(1)}y ${suffix}`;
}

export function fmtDays(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  return `${Math.round(value)}d`;
}

/** Sign-aware class name for P&L style numbers. */
export function pnlTone(value: number | null | undefined): "pos" | "neg" | "flat" {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return "flat";
  return value > 0 ? "pos" : "neg";
}
