import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicSupabaseKey, publicSupabaseUrl } from "@/lib/env";

/**
 * Publishable-key client. Safe in the browser and on the server; reads go
 * through the anon RLS read policies. One instance per runtime.
 */
let browserClient: SupabaseClient | null = null;

export function createPublicClient(): SupabaseClient | null {
  const key = publicSupabaseKey();
  if (!key) return null;
  return createClient(publicSupabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 5 } },
  });
}

export function getBrowserClient(): SupabaseClient | null {
  if (typeof window === "undefined") return createPublicClient();
  if (!browserClient) browserClient = createPublicClient();
  return browserClient;
}
