import { beforeEach, describe, expect, it, vi } from "vitest";

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
    async (request: { json: () => Promise<unknown> }) => {
      try {
        return await handler({ request, db: routeHarness.db, params: {} });
      } catch {
        return Response.json({ error: "Internal route failure." }, { status: 500 });
      }
    },
}));

import { POST as postOutcome } from "@/app/api/agent/forecast-outcomes/route";
import { POST as postPrompt } from "@/app/api/agent/prompts/route";
import { POST as postRun } from "@/app/api/agent/runs/route";
import { POST as postUnderwriting } from "@/app/api/agent/underwriting/route";

function request(body: unknown) {
  return { json: async () => body } as never;
}

function failingDb(code: string, internalDetail = "sensitive database detail") {
  const result = { data: null, error: { message: internalDetail, code, details: internalDetail, hint: internalDetail } };
  const query = {
    insert: () => query,
    select: () => query,
    limit: async () => result,
  };
  return {
    from: () => query,
    rpc: async () => result,
  };
}

describe("agent domain database errors", () => {
  beforeEach(() => {
    routeHarness.db = failingDb("XX000");
  });

  it("maps a missing forecast outcome target to 404 without database detail", async () => {
    routeHarness.db = failingDb("P0002");
    const response = await postOutcome(request({
      forecast_id: "0fdb5d8d-635d-4589-a7d7-a2af4ef7a7c6",
      observed_at: "2000-01-01T00:00:00.000Z",
      actual_value: 0.12,
      evidence_url: "https://www.sec.gov/Archives/example",
    }), { params: Promise.resolve({}) });

    expect(response.status).toBe(404);
    expect(JSON.stringify(await response.json())).not.toContain("sensitive database detail");
  });

  it("maps a duplicate prompt version to 409", async () => {
    routeHarness.db = failingDb("23505");
    const response = await postPrompt(request({
      prompt_id: "company-underwrite",
      version: "1.0.0",
      role: "company analyst",
      schema_version: "1.0.0",
      prompt_body: "Immutable prompt body.",
    }), { params: Promise.resolve({}) });

    expect(response.status).toBe(409);
  });

  it("rejects prompt released_at overrides before any database call", async () => {
    const from = vi.fn();
    routeHarness.db = { from };
    const response = await postPrompt(request({
      prompt_id: "company-underwrite",
      version: "1.0.0",
      role: "company analyst",
      schema_version: "1.0.0",
      prompt_body: "Immutable prompt body.",
      released_at: "2000-01-01T00:00:00.000Z",
    }), { params: Promise.resolve({}) });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "Validation failed.",
      detail: [expect.objectContaining({
        code: "unrecognized_keys",
        keys: ["released_at"],
        path: [],
      })],
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("maps an invalid underwriting RPC argument to 422", async () => {
    routeHarness.db = failingDb("22023");
    const response = await postUnderwriting(request({
      agent_run_id: "0fdb5d8d-635d-4589-a7d7-a2af4ef7a7c6",
      nodes: [{ stable_key: "MU:company", node_type: "company", ticker: "MU", title: "MU", as_of: "2000-01-01T00:00:00.000Z" }],
      edges: [],
    }), { params: Promise.resolve({}) });

    expect(response.status).toBe(422);
  });

  it("maps invalid run provenance to 422", async () => {
    routeHarness.db = failingDb("23503");
    const response = await postRun(request({
      workflow_id: "company-underwrite",
      workflow_version: "1.0.0",
      agent_name: "hermes",
    }), { params: Promise.resolve({}) });

    expect(response.status).toBe(422);
  });
});