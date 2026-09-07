import { env, optionalEnv, HERMES_PROJECT_REF, LEGACY_PROJECT_REF } from "./env";

/**
 * Minimal PostgREST client for scripts. Four verbs with the service role,
 * paginated selects, upserts, RPC. Nothing here ever logs a key.
 *
 *  hermesClient()  -> the live INVESTING-BRAIN-AG project (read/write)
 *  legacyClient()  -> the Dustin Awe Capital reference project (READ ONLY;
 *                     the client refuses to POST/PATCH/DELETE)
 */
export type Rest = {
  url: string;
  select: <T = Record<string, unknown>>(table: string, query: string, opts?: { schema?: string }) => Promise<T[]>;
  selectAll: <T = Record<string, unknown>>(table: string, query: string, opts?: { schema?: string; pageSize?: number }) => Promise<T[]>;
  insert: <T = Record<string, unknown>>(table: string, rows: Record<string, unknown>[]) => Promise<T[]>;
  upsert: <T = Record<string, unknown>>(table: string, rows: Record<string, unknown>[], onConflict: string) => Promise<T[]>;
  patch: <T = Record<string, unknown>>(table: string, query: string, patch: Record<string, unknown>) => Promise<T[]>;
  del: (table: string, query: string) => Promise<void>;
  rpc: <T = unknown>(fn: string, args: Record<string, unknown>) => Promise<T>;
  count: (table: string, query?: string) => Promise<number>;
};

function makeClient(url: string, key: string, readOnly: boolean): Rest {
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  async function call<T>(method: string, pathAndQuery: string, body?: unknown, extra: Record<string, string> = {}): Promise<{ data: T; response: Response }> {
    if (readOnly && method !== "GET" && method !== "HEAD") throw new Error(`Refusing ${method} against read-only reference database`);
    const response = await fetch(`${url}/rest/v1/${pathAndQuery}`, { method, headers: { ...headers, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    if (!response.ok) throw new Error(`PostgREST ${method} ${pathAndQuery.split("?")[0]} -> ${response.status}: ${text.slice(0, 1500)}`);
    return { data: (text ? JSON.parse(text) : null) as T, response };
  }
  const schemaHeader = (schema?: string): Record<string, string> => (schema && schema !== "public" ? { "Accept-Profile": schema, "Content-Profile": schema } : {});
  return {
    url,
    select: async (table, query, opts) => (await call<never[]>("GET", `${table}?${query}`, undefined, schemaHeader(opts?.schema))).data,
    selectAll: async (table, query, opts) => {
      const pageSize = opts?.pageSize ?? 1000;
      const rows: unknown[] = [];
      let offset = 0;
      for (;;) {
        const page = (await call<unknown[]>("GET", `${table}?${query}&limit=${pageSize}&offset=${offset}`, undefined, schemaHeader(opts?.schema))).data;
        rows.push(...page);
        if (page.length < pageSize) break;
        offset += pageSize;
      }
      return rows as never[];
    },
    insert: async (table, rows) => (await call<never[]>("POST", table, rows, { Prefer: "return=representation" })).data,
    upsert: async (table, rows, onConflict) => (await call<never[]>("POST", `${table}?on_conflict=${onConflict}`, rows, { Prefer: "return=representation,resolution=merge-duplicates" })).data,
    patch: async (table, query, patch) => (await call<never[]>("PATCH", `${table}?${query}`, patch, { Prefer: "return=representation" })).data,
    del: async (table, query) => {
      await call("DELETE", `${table}?${query}`);
    },
    rpc: async (fn, args) => (await call<never>("POST", `rpc/${fn}`, args)).data,
    count: async (table, query = "select=id") => {
      const { response } = await call("HEAD", `${table}?${query}`, undefined, { Prefer: "count=exact" });
      const range = response.headers.get("content-range") ?? "";
      return Number(range.split("/")[1] ?? 0);
    },
  };
}

export function hermesClient(): Rest {
  const url = (optionalEnv("NEXT_PUBLIC_SUPABASE_URL") ?? `https://${HERMES_PROJECT_REF}.supabase.co`).replace(/\/$/, "");
  if (!url.includes(HERMES_PROJECT_REF)) throw new Error(`WRONG_DATABASE_TARGET: NEXT_PUBLIC_SUPABASE_URL does not point at ${HERMES_PROJECT_REF}`);
  return makeClient(url, env("SUPABASE_SERVICE_ROLE_KEY"), false);
}

/** Read-only client on the live project using the publishable (anon) key — for `--emit-sql` modes that only need RLS-visible reads. */
export function publicClient(): Rest {
  const url = (optionalEnv("NEXT_PUBLIC_SUPABASE_URL") ?? `https://${HERMES_PROJECT_REF}.supabase.co`).replace(/\/$/, "");
  if (!url.includes(HERMES_PROJECT_REF)) throw new Error(`WRONG_DATABASE_TARGET: NEXT_PUBLIC_SUPABASE_URL does not point at ${HERMES_PROJECT_REF}`);
  const key = optionalEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ?? optionalEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (!key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)");
  return makeClient(url, key, true);
}

/** Formats rows as a single INSERT statement (dollar-quoted strings, jsonb/text[] aware) for applying through a SQL console. */
export function toInsertSql(table: string, rows: Record<string, unknown>[], suffix = "on conflict do nothing"): string {
  if (rows.length === 0) return `-- ${table}: nothing to insert\n`;
  const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const tag = "$hs$";
  const literal = (v: unknown): string => {
    if (v === null || v === undefined) return "NULL";
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (Array.isArray(v)) return v.length === 0 ? "'{}'::text[]" : `ARRAY[${v.map((x) => `${tag}${String(x)}${tag}`).join(",")}]::text[]`;
    if (typeof v === "object") return `${tag}${JSON.stringify(v).replaceAll(tag, "")}${tag}::jsonb`;
    return `${tag}${String(v).replaceAll(tag, "")}${tag}`;
  };
  const values = rows.map((r) => `(${columns.map((c) => literal(r[c])).join(", ")})`).join(",\n");
  return `insert into public.${table} (${columns.join(", ")})\nvalues\n${values}\n${suffix};\n`;
}

export function legacyClient(): Rest {
  const url = (optionalEnv("LEGACY_INVESTMENT_BRAIN_URL") ?? `https://${LEGACY_PROJECT_REF}.supabase.co`).replace(/\/$/, "");
  if (!url.includes(LEGACY_PROJECT_REF)) throw new Error(`WRONG_DATABASE_TARGET: LEGACY_INVESTMENT_BRAIN_URL does not point at ${LEGACY_PROJECT_REF}`);
  return makeClient(url, env("LEGACY_INVESTMENT_BRAIN_SERVICE_ROLE_KEY"), true);
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
