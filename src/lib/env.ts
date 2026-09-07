/**
 * Environment access. Every read is lazy and blank-tolerant: `vercel env pull`
 * writes unset keys as KEY="" and a plain `??` chain would stop on the blank.
 *
 * NEXT_PUBLIC_* values must be referenced as literal member access so Next can
 * inline them into client bundles.
 */
export function firstSet(...values: Array<string | undefined>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return undefined;
}

export const HERMES_PROJECT_REF = "cwiaqczpifnxxcucqwvr";
export const HERMES_SUPABASE_URL_DEFAULT = `https://${HERMES_PROJECT_REF}.supabase.co`;

export function publicSupabaseUrl() {
  return firstSet(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? HERMES_SUPABASE_URL_DEFAULT;
}

export function publicSupabaseKey() {
  return firstSet(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function serviceRoleKey() {
  return firstSet(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function agentToken() {
  return firstSet(process.env.HERMES_AGENT_TOKEN);
}

export function accessPassword() {
  return firstSet(process.env.HERMES_ACCESS_PASSWORD);
}

export function sessionSecret() {
  return firstSet(process.env.HERMES_SESSION_SECRET);
}

export function guruFocusApiKey() {
  return firstSet(process.env.GURUFOCUS_API_KEY, process.env.GURU_API_FILINGS_API);
}

export function priceProvider(): "stooq" | "none" {
  const value = firstSet(process.env.HERMES_PRICE_PROVIDER) ?? "stooq";
  return value === "none" ? "none" : "stooq";
}

/** True when the browser can read; false renders the "not configured" state. */
export function isReadConfigured() {
  return Boolean(publicSupabaseKey());
}

/** True when server writes are possible. */
export function isWriteConfigured() {
  return Boolean(serviceRoleKey());
}
