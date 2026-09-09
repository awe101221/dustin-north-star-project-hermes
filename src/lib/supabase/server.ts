import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { ACCESS_COOKIE, gateEnabled, verifyCookie } from "@/lib/auth";
import { accessPassword, publicSupabaseKey, publicSupabaseUrl, serviceRoleKey, sessionSecret } from "@/lib/env";

/**
 * Server-side clients.
 *
 *  - `serverReadClient()` uses only the publishable key (RLS read policies).
 *    It never silently escalates to service-role access.
 *  - `underwritingReadClient()` and `adminClient()` use the service role for
 *    confidential reads and writes. They are imported exclusively from server
 *    components, route handlers, server actions, and the agent API;
 *    `server-only` guarantees they never reach a client bundle.
 */
export function serverReadClient(): SupabaseClient | null {
  const key = publicSupabaseKey();
  if (!key) return null;
  return createClient(publicSupabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

export class PrivilegedReadAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrivilegedReadAuthError";
  }
}

export function underwritingReadClient(): Promise<SupabaseClient | null> {
  return createUnderwritingReadClient();
}

async function createUnderwritingReadClient(): Promise<SupabaseClient | null> {
  const key = serviceRoleKey();
  if (!key) return null;
  const url = publicSupabaseUrl();
  const env = { password: accessPassword(), secret: sessionSecret() };
  if (!gateEnabled(env)) {
    throw new PrivilegedReadAuthError("Privileged reads require HERMES_ACCESS_PASSWORD and the separate HERMES_SESSION_SECRET session secret.");
  }
  const cookie = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!await verifyCookie(cookie, env)) {
    throw new PrivilegedReadAuthError("Privileged read session is unauthorized.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

export function adminClient(): SupabaseClient | null {
  const key = serviceRoleKey();
  if (!key) return null;
  return createClient(publicSupabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

export class WriteNotConfiguredError extends Error {
  constructor() {
    super("SUPABASE_SERVICE_ROLE_KEY is not set; Hermes is read-only on this deployment.");
    this.name = "WriteNotConfiguredError";
  }
}

export function requireAdmin(): SupabaseClient {
  const client = adminClient();
  if (!client) throw new WriteNotConfiguredError();
  return client;
}
