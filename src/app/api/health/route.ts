import { NextResponse } from "next/server";
import { HERMES_PROJECT_REF, isReadConfigured, isWriteConfigured, agentToken, accessPassword } from "@/lib/env";
import { serverReadClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Liveness + configuration + a cheap DB round trip. Safe to expose. */
export async function GET() {
  const read = isReadConfigured();
  let db: { ok: boolean; latencyMs: number | null; error?: string } = { ok: false, latencyMs: null };
  if (read) {
    const client = serverReadClient();
    const started = Date.now();
    try {
      const { error } = await client!.from("hermes_mandate").select("id").limit(1);
      db = { ok: !error, latencyMs: Date.now() - started, error: error?.message };
    } catch (e) {
      db = { ok: false, latencyMs: Date.now() - started, error: e instanceof Error ? e.message : String(e) };
    }
  }
  return NextResponse.json({
    ok: true,
    app: "dustin-north-star-project-hermes",
    projectRef: HERMES_PROJECT_REF,
    config: { read, write: isWriteConfigured(), agentApi: Boolean(agentToken()), gate: Boolean(accessPassword()) },
    db,
    time: new Date().toISOString(),
  });
}
