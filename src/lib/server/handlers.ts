import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ZodType } from "zod";
import { adminClient, WriteNotConfiguredError } from "@/lib/supabase/server";
import { agentToken } from "@/lib/env";
import { timingSafeEqual } from "@/lib/auth";
import { DbError } from "@/lib/db/query";

/**
 * Route-handler plumbing shared by /api/hermes/* (UI writes) and /api/agent/*
 * (bearer-token writes). Both use the service role; the difference is who is
 * allowed to call them (the password gate vs. HERMES_AGENT_TOKEN).
 */
export type Ctx<P = Record<string, string>> = { params: Promise<P> };

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400, detail?: unknown) {
  return NextResponse.json({ error: message, detail }, { status });
}

export async function parseBody<T>(request: NextRequest, schema: ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; res: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, res: fail("Body must be JSON.") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, res: fail("Validation failed.", 422, parsed.error.issues) };
  }
  return { ok: true, data: parsed.data };
}

type Handler<P> = (args: { request: NextRequest; params: P; db: SupabaseClient }) => Promise<NextResponse>;

/** Wraps a handler with the admin client and uniform error mapping. */
export function withAdmin<P = Record<string, string>>(handler: Handler<P>) {
  return async (request: NextRequest, ctx: Ctx<P>) => {
    const db = adminClient();
    if (!db) return fail(new WriteNotConfiguredError().message, 503);
    try {
      const params = await ctx.params;
      return await handler({ request, params, db });
    } catch (e) {
      if (e instanceof DbError) return fail(e.message, 500, e.code);
      const message = e instanceof Error ? e.message : String(e);
      return fail(message, 500);
    }
  };
}

/** Same, but authenticates the caller with HERMES_AGENT_TOKEN. */
export function withAgent<P = Record<string, string>>(handler: Handler<P>) {
  const inner = withAdmin<P>(handler);
  return async (request: NextRequest, ctx: Ctx<P>) => {
    const token = agentToken();
    if (!token) return fail("Agent API disabled: HERMES_AGENT_TOKEN is not set.", 503);
    const header = request.headers.get("authorization") ?? "";
    const supplied = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!supplied || !timingSafeEqual(supplied.padEnd(128, "\0"), token.padEnd(128, "\0"))) {
      return fail("Unauthorized.", 401);
    }
    return inner(request, ctx);
  };
}

export async function logActivity(db: SupabaseClient, row: { kind: string; title: string; detail?: string | null; ticker?: string | null; ref_table?: string; ref_id?: string; actor?: string; payload?: Record<string, unknown> }) {
  await db.from("hermes_activity").insert({
    kind: row.kind,
    title: row.title,
    detail: row.detail ?? null,
    ticker: row.ticker ?? null,
    ref_table: row.ref_table ?? null,
    ref_id: row.ref_id ?? null,
    actor: row.actor ?? "dustin",
    payload: row.payload ?? {},
  });
}
