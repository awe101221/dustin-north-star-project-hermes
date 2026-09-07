import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind class merge helper (shadcn convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Stable slug for URLs and keys. */
export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "NAS:MU" -> "MU"; "MU" -> "MU". Mirrors public.hermes_bare_symbol in SQL. */
export function bareSymbol(ticker: string | null | undefined) {
  if (!ticker) return "";
  const idx = ticker.indexOf(":");
  return (idx >= 0 ? ticker.slice(idx + 1) : ticker).toUpperCase();
}

/** Exchange prefix of a canonical ticker ("NAS:MU" -> "NAS"), or null. */
export function tickerExchange(ticker: string | null | undefined) {
  if (!ticker) return null;
  const idx = ticker.indexOf(":");
  return idx >= 0 ? ticker.slice(0, idx).toUpperCase() : null;
}

export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function toStringArray(value: unknown): string[] {
  return toArray(value).filter((item): item is string => typeof item === "string");
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function sum(values: Array<number | null | undefined>) {
  let total = 0;
  for (const v of values) if (typeof v === "number" && Number.isFinite(v)) total += v;
  return total;
}

export function groupBy<T, K extends string | number>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = out.get(k);
    if (bucket) bucket.push(item);
    else out.set(k, [item]);
  }
  return out;
}

export function uniq<T>(items: T[]) {
  return Array.from(new Set(items));
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
