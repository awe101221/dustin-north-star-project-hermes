import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicSupabaseKey, publicSupabaseUrl, serviceRoleKey } from "@/lib/env";

/**
 * Server-side clients.
 *
 *  - `serverReadClient()` uses the publishable key (RLS read policies). Server
 *    components use it so a leaked bundle can never escalate.
 *  - `adminClient()` uses the service role and is the only path for writes.
 *    It is imported exclusively from route handlers, server actions and the
 *    agent API. `server-only` guarantees it never reaches the client bundle.
 */
export function serverReadClient(): SupabaseClient | null {
  const key = publicSupabaseKey() ?? serviceRoleKey();
  if (!key) return null;
  return createClient(publicSupabaseUrl(), key, {
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
