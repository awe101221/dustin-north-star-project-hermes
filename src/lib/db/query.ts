import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { toNumber } from "@/lib/utils";

/**
 * Shared query helpers. Every domain module exports pure functions of
 * (client, args) so the same code runs in server components (publishable key,
 * no-store fetch) and in the browser (publishable key + realtime).
 */
export type Db = SupabaseClient;

export class DbError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "DbError";
    this.code = code;
  }
}

export function unwrap<T>(result: { data: T | null; error: PostgrestError | null }, context: string): T {
  if (result.error) {
    throw new DbError(`${context}: ${result.error.message}`, result.error.code);
  }
  return (result.data ?? ([] as unknown as T)) as T;
}

/** numeric columns arrive as strings; coerce once at the boundary. */
export const num = toNumber;

export function isMissingRelation(error: unknown) {
  const e = error as { code?: string; message?: string } | null;
  return Boolean(e && (e.code === "42P01" || e.code === "PGRST205" || e.message?.includes("does not exist")));
}

/** Fetch every row past PostgREST's 1000-row page cap. */
export async function selectAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  pageSize = 1000,
  maxRows = 20000,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  while (from < maxRows) {
    const page = unwrap(await build(from, from + pageSize - 1), "selectAll");
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}
