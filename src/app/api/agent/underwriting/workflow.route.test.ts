import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const routeHarness = vi.hoisted(() => ({
  db: null as unknown,
}));

vi.mock("@/lib/server/handlers", () => ({
  fail: (message: string, status = 400, detail?: unknown) => Response.json({ error: message, detail }, { status }),
  json: (data: unknown, init?: ResponseInit) => Response.json(data, init),
  parseBody: async (request: { json: () => Promise<unknown> }, schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown; error?: { issues: unknown } } }) => {
    const parsed = schema.safeParse(await request.json());
    return parsed.success
      ? { ok: true, data: parsed.data }
      : { ok: false, res: Response.json({ error: "Validation failed.", detail: parsed.error?.issues }, { status: 422 }) };
  },
  parseQuery: vi.fn(),
  withAgent: (handler: (args: { request: { json: () => Promise<unknown> }; db: unknown; params: Record<string, string> }) => Promise<Response>) =>
    async (request: { json: () => Promise<unknown> }, context: { params: Promise<Record<string, string>> }) => {
      try {
        return await handler({ request, db: routeHarness.db, params: await context.params });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
      }
    },
}));

import { POST as postForecast } from "@/app/api/agent/forecasts/route";
import { PATCH as patchRun } from "@/app/api/agent/runs/[id]/route";
import { POST as postGraph } from "@/app/api/agent/underwriting/route";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260907000400_underwriting_graph_evaluation.sql"),
  "utf8",
);
const runId = "20000000-0000-4000-8000-000000000001";
const replayRunId = "20000000-0000-4000-8000-000000000002";

function pgError(error: unknown) {
  const value = error as { message?: string; code?: string };
  return { message: value.message ?? String(error), code: value.code ?? "XX000", details: "", hint: "", name: "PostgrestError" };
}

function pgliteSupabase(db: PGlite) {
  return {
    from(table: string) {
      let insertValue: Record<string, unknown> | null = null;
      let updateValue: Record<string, unknown> | null = null;
      let selectedId: string | null = null;
      let selectedColumns = "*";
      const builder = {
        select: (columns = "*") => {
          selectedColumns = columns;
          return builder;
        },
        eq: (column: string, value: string) => {
          if (column === "id") selectedId = value;
          return builder;
        },
        insert: (value: Record<string, unknown>) => {
          insertValue = value;
          return builder;
        },
        update: (value: Record<string, unknown>) => {
          updateValue = value;
          return builder;
        },
        async maybeSingle() {
          try {
            if (table !== "hermes_agent_runs" || !selectedId) throw new Error(`Unsupported maybeSingle on ${table}`);
            if (!["*", "started_at", "status"].includes(selectedColumns)) throw new Error(`Unsupported run selection ${selectedColumns}`);
            const selection = selectedColumns === "started_at" ? "started_at::text as started_at" : selectedColumns;
            const result = await db.query<Record<string, unknown>>(
              `select ${selection} from public.hermes_agent_runs where id = $1`,
              [selectedId],
            );
            const row = result.rows[0];
            if (!row) return { data: null, error: null };
            const normalized = JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
            if (selectedColumns === "started_at" && typeof normalized.started_at === "string") {
              normalized.started_at = new Date(normalized.started_at).toISOString();
            }
            return { data: normalized, error: null };
          } catch (error) {
            return { data: null, error: pgError(error) };
          }
        },
        async limit() {
          try {
            if (table === "hermes_agent_runs" && updateValue && selectedId) {
              const columns = Object.keys(updateValue);
              const values = Object.values(updateValue).map((value) =>
                value !== null && typeof value === "object" ? JSON.stringify(value) : value,
              );
              const assignments = columns.map((column, index) => `${column} = $${index + 1}`).join(", ");
              const result = await db.query<Record<string, unknown>>(
                `update public.hermes_agent_runs set ${assignments} where id = $${columns.length + 1} returning *`,
                [...values, selectedId],
              );
              return { data: result.rows, error: null };
            }
            if (table !== "hermes_forecasts" || !insertValue) throw new Error(`Unsupported insert on ${table}`);
            const columns = Object.keys(insertValue);
            const values = Object.values(insertValue);
            const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
            const result = await db.query<Record<string, unknown>>(
              `insert into public.hermes_forecasts (${columns.join(", ")}) values (${placeholders}) returning *`,
              values,
            );
            return { data: result.rows, error: null };
          } catch (error) {
            return { data: null, error: pgError(error) };
          }
        },
      };
      return builder;
    },
    async rpc(name: string, args: { p_agent_run_id: string; p_nodes: unknown; p_edges: unknown; p_forecasts: unknown }) {
      try {
        if (name !== "hermes_replace_underwriting_graph") throw new Error(`Unsupported RPC ${name}`);
        const result = await db.query<{ result: Record<string, unknown> }>(
          "select public.hermes_replace_underwriting_graph($1, $2::jsonb, $3::jsonb, $4::jsonb) as result",
          [args.p_agent_run_id, JSON.stringify(args.p_nodes), JSON.stringify(args.p_edges), args.p_forecasts === null ? null : JSON.stringify(args.p_forecasts)],
        );
        return { data: result.rows[0]?.result ?? null, error: null };
      } catch (error) {
        return { data: null, error: pgError(error) };
      }
    },
  };
}

function request(body: unknown) {
  return { json: async () => body } as never;
}

describe("agent graph and forecast route workflow", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(`
      create schema extensions;
      create extension pgcrypto schema extensions;
      create role anon;
      create role authenticated;
      create role service_role;
      create table public.hermes_agent_tasks (id uuid primary key);
      create function public.hermes_set_updated_at()
      returns trigger language plpgsql set search_path = '' as $$
      begin new.updated_at := pg_catalog.now(); return new; end;
      $$;
      create publication supabase_realtime;
    `);
    await db.exec(migration);
    await db.query(
      "insert into public.hermes_agent_runs (id, workflow_id, workflow_version, agent_name, status) values ($1, 'route-workflow', '1.0.0', 'vitest', 'running')",
      [runId],
    );
    await db.query(
      `insert into public.hermes_agent_runs (
         id, workflow_id, workflow_version, agent_name, status,
         output_ref, error, metrics, metadata
       ) values (
         $1, 'route-terminal-replay', '1.0.0', 'vitest', 'running',
         '{"nested":{"complete":true},"note":"finished"}'::jsonb,
         null,
         '{"forecasts":3,"nodes":4}'::jsonb,
         '{"attempt":1}'::jsonb
       )`,
      [replayRunId],
    );
    await db.query(
      "update public.hermes_agent_runs set status = 'succeeded', completed_at = pg_catalog.statement_timestamp() where id = $1",
      [replayRunId],
    );
    routeHarness.db = pgliteSupabase(db);
  });

  afterAll(async () => {
    await db.close();
  });

  it("returns the persisted terminal row when the real trigger suppresses an exact PATCH replay", async () => {
    const before = await db.query<{ completed_at: string; updated_at: string }>(
      "select completed_at::text, updated_at::text from public.hermes_agent_runs where id = $1",
      [replayRunId],
    );
    const completedAt = before.rows[0]?.completed_at;
    if (!completedAt) throw new Error("Terminal replay fixture is missing completed_at.");
    const equivalentCompletedAt = new Date(completedAt).toISOString().replace("Z", "+00:00");

    const response = await patchRun(request({
      status: "succeeded",
      completed_at: equivalentCompletedAt,
      error: null,
      output_ref: { note: "finished", nested: { complete: true } },
      metrics: { nodes: 4, forecasts: 3 },
      metadata: { attempt: 1 },
    }), { params: Promise.resolve({ id: replayRunId }) });

    const payload = await response.json();
    expect({ status: response.status, payload }).toMatchObject({
      status: 200,
      payload: {
        run: {
          id: replayRunId,
          status: "succeeded",
          error: null,
          output_ref: { nested: { complete: true }, note: "finished" },
          metrics: { forecasts: 3, nodes: 4 },
          metadata: { attempt: 1 },
        },
      },
    });
    const after = await db.query<{ updated_at: string }>(
      "select updated_at::text from public.hermes_agent_runs where id = $1",
      [replayRunId],
    );
    expect(after.rows[0]?.updated_at).toBe(before.rows[0]?.updated_at);
  });

  it("accepts identical graph replay after separate forecast registration and run completion", async () => {
    const graph = {
      agent_run_id: runId,
      nodes: [
        { stable_key: "route:company", node_type: "company", ticker: "MU", title: "MU", as_of: "2026-09-07T00:00:00.000Z" },
        { stable_key: "route:forecast", node_type: "forecast", ticker: "MU", title: "Base", as_of: "2026-09-07T00:00:00.000Z" },
      ],
      edges: [{ from_key: "route:company", to_key: "route:forecast", relationship: "has_forecast" }],
    };
    const forecast = {
      stable_key: "route:forecast:base",
      ticker: "MU",
      scenario: "Base",
      forecast_type: "annualized_return",
      horizon_date: "2099-01-01",
      predicted_value: 0.14,
      agent_run_id: runId,
      model_version: "2026-09-07T00:00:00.000Z",
    };

    expect((await postGraph(request(graph), { params: Promise.resolve({}) })).status).toBe(201);
    expect((await postForecast(request(forecast), { params: Promise.resolve({}) })).status).toBe(201);
    await db.query("update public.hermes_agent_runs set status = 'succeeded', completed_at = now() where id = $1", [runId]);

    const replay = await postGraph(request(graph), { params: Promise.resolve({}) });
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual({ nodes: 2, edges: 1, forecasts_inserted: 0 });
  });
});
