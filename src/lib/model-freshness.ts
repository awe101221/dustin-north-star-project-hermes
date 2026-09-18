const DAY_MS = 86_400_000;

function timestamp(value: string | number | Date | null | undefined): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return value ? Date.parse(value) : Number.NaN;
}

export function isModelStale(
  value: string | number | Date | null | undefined,
  now: string | number | Date,
  maxAgeDays: number,
): boolean {
  const valueMs = timestamp(value);
  const nowMs = timestamp(now);
  if (!Number.isFinite(valueMs) || !Number.isFinite(nowMs) || !Number.isFinite(maxAgeDays) || maxAgeDays <= 0) return true;
  const ageMs = nowMs - valueMs;
  return ageMs < 0 || ageMs >= maxAgeDays * DAY_MS;
}
