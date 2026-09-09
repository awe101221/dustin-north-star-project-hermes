import { beforeEach, describe, expect, it, vi } from "vitest";

const routeHarness = vi.hoisted(() => ({
  db: null as unknown,
}));

vi.mock("server-only", () => ({}));

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
  withAgent: (handler: (args: { request: { json: () => Promise<unknown>; nextUrl: URL }; db: unknown; params: Record<string, string> }) => Promise<Response>) =>
    async (request: { json: () => Promise<unknown>; nextUrl: URL }, context: { params: Promise<Record<string, string>> }) =>
      handler({ request, db: routeHarness.db, params: await context.params }),
}));

import { POST as postBestIdeas } from "@/app/api/agent/best-ideas/route";
import { POST as postOutcome } from "@/app/api/agent/forecast-outcomes/route";
import { POST as postForecast } from "@/app/api/agent/forecasts/route";
import { POST as postIdea } from "@/app/api/agent/ideas/route";
import { POST as postLearning } from "@/app/api/agent/learnings/route";
import { POST as postNote } from "@/app/api/agent/notes/route";
import { POST as postPrompt } from "@/app/api/agent/prompts/route";
import { PATCH as patchQuantJob, POST as postQuantJob } from "@/app/api/agent/quant-jobs/route";
import { PATCH as patchRun } from "@/app/api/agent/runs/[id]/route";
import { POST as postRun } from "@/app/api/agent/runs/route";
import { POST as completeTask } from "@/app/api/agent/tasks/[id]/complete/route";
import { POST as claimTask } from "@/app/api/agent/tasks/claim/route";
import { POST as postTask } from "@/app/api/agent/tasks/route";
import { POST as postUnderwriting } from "@/app/api/agent/underwriting/route";

const runId = "0fdb5d8d-635d-4589-a7d7-a2af4ef7a7c6";

type AgentWriteRoute = (
  req: never,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;

function request(body: unknown, path = "/api/agent/test") {
  return { json: async () => body, nextUrl: new URL(`https://example.com${path}`) } as never;
}

const routeInventory = [
  ["POST /api/agent/ideas", postIdea, { ticker: "MU", created_at: "2000-01-01T00:00:00Z" }, {}, "/api/agent/ideas"],
  ["POST /api/agent/tasks", postTask, { task_type: "underwrite", title: "Underwrite MU", id: runId }, {}, "/api/agent/tasks"],
  ["POST /api/agent/tasks/claim", claimTask, { agent: "hermes", claimed_at: "2000-01-01T00:00:00Z" }, {}, "/api/agent/tasks/claim"],
  ["POST /api/agent/tasks/[id]/complete", completeTask, { completed_at: "2000-01-01T00:00:00Z" }, { id: runId }, `/api/agent/tasks/${runId}/complete`],
  ["POST /api/agent/notes", postNote, { title: "MU note", id: runId }, {}, "/api/agent/notes"],
  ["POST /api/agent/quant-jobs", postQuantJob, { kind: "screen", name: "Quality screen", created_at: "2000-01-01T00:00:00Z" }, {}, "/api/agent/quant-jobs"],
  ["PATCH /api/agent/quant-jobs", patchQuantJob, { status: "running", finished_at: "2000-01-01T00:00:00Z" }, {}, `/api/agent/quant-jobs?id=${runId}`],
  ["POST /api/agent/best-ideas", postBestIdeas, { topTen: [{ ticker: "MU" }], id: runId }, {}, "/api/agent/best-ideas"],
  ["POST /api/agent/learnings", postLearning, {
    summary: "Learning summary",
    principles: ["Prefer primary evidence."],
    changes: [{ title: "MU", learning: "Demand improved.", implication: "Refresh the model." }],
    id: runId,
  }, {}, "/api/agent/learnings"],
  ["POST /api/agent/prompts", postPrompt, {
    prompt_id: "company-underwrite",
    version: "1.0.0",
    role: "Company analyst",
    schema_version: "company-model-v1",
    prompt_body: "Underwrite from primary evidence.",
    released_at: "2000-01-01T00:00:00Z",
  }, {}, "/api/agent/prompts"],
  ["POST /api/agent/runs", postRun, {
    workflow_id: "company-underwrite",
    workflow_version: "1.0.0",
    agent_name: "hermes",
    created_at: "2000-01-01T00:00:00Z",
  }, {}, "/api/agent/runs"],
  ["PATCH /api/agent/runs/[id]", patchRun, {
    status: "running",
    updated_at: "2000-01-01T00:00:00Z",
  }, { id: runId }, `/api/agent/runs/${runId}`],
  ["POST /api/agent/underwriting", postUnderwriting, {
    agent_run_id: runId,
    nodes: [{ stable_key: "MU:company", node_type: "company", title: "MU", as_of: "2000-01-01T00:00:00Z" }],
    edges: [],
    created_at: "2000-01-01T00:00:00Z",
  }, {}, "/api/agent/underwriting"],
  ["POST /api/agent/forecasts", postForecast, {
    stable_key: "MU:forecast:base",
    ticker: "MU",
    scenario: "Base",
    forecast_type: "annualized_return",
    horizon_date: "2099-01-01",
    predicted_value: 0.14,
    agent_run_id: runId,
    model_version: "2000-01-01T00:00:00Z",
    as_of: "2000-01-01T00:00:00Z",
  }, {}, "/api/agent/forecasts"],
  ["POST /api/agent/forecast-outcomes", postOutcome, {
    forecast_id: runId,
    observed_at: "2000-01-01T00:00:00Z",
    actual_value: 0.12,
    evidence_url: "https://www.sec.gov/Archives/example",
    created_at: "2000-01-01T00:00:00Z",
  }, {}, "/api/agent/forecast-outcomes"],
] as const;

describe("universal strict agent HTTP writes", () => {
  const from = vi.fn();
  const rpc = vi.fn();

  beforeEach(() => {
    from.mockReset();
    rpc.mockReset();
    routeHarness.db = { from, rpc };
  });

  it.each(routeInventory)("returns deterministic 422 and performs zero DB calls for forbidden properties on %s", async (_label, route, body, params, path) => {
    const response = await (route as unknown as AgentWriteRoute)(request(body, path), { params: Promise.resolve(params) });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "Validation failed.",
      detail: [expect.objectContaining({ code: "unrecognized_keys" })],
    });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["POST /api/agent/best-ideas item", postBestIdeas, {
      topTen: [{ ticker: "MU", created_at: "2000-01-01T00:00:00Z" }],
    }, "/api/agent/best-ideas"],
    ["POST /api/agent/learnings change", postLearning, {
      summary: "Learning summary",
      principles: ["Prefer primary evidence."],
      changes: [{ title: "MU", learning: "Demand improved.", implication: "Refresh the model.", id: runId }],
    }, "/api/agent/learnings"],
    ["POST /api/agent/underwriting node", postUnderwriting, {
      agent_run_id: runId,
      nodes: [{ stable_key: "MU:company", node_type: "company", title: "MU", as_of: "2000-01-01T00:00:00Z", created_at: "2000-01-01T00:00:00Z" }],
      edges: [],
    }, "/api/agent/underwriting"],
    ["POST /api/agent/underwriting edge", postUnderwriting, {
      agent_run_id: runId,
      nodes: [{ stable_key: "MU:company", node_type: "company", title: "MU", as_of: "2000-01-01T00:00:00Z" }],
      edges: [{ from_key: "MU:company", to_key: "MU:company", relationship: "supports", created_at: "2000-01-01T00:00:00Z" }],
    }, "/api/agent/underwriting"],
  ] as const)("returns 422 before DB/RPC for unknown nested fields on %s", async (_label, route, body, path) => {
    const response = await (route as unknown as AgentWriteRoute)(request(body, path), { params: Promise.resolve({}) });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "Validation failed.",
      detail: [expect.objectContaining({ code: "unrecognized_keys" })],
    });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
