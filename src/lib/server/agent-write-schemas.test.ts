import { describe, expect, it } from "vitest";
import {
  agentClaim,
  agentComplete,
  agentRunCreate,
  agentRunPatch,
  agentTaskCreate,
  bestIdeasSnapshotCreate,
  forecastCreate,
  forecastOutcomeCreate,
  ideaCreate,
  learningSnapshotCreate,
  noteCreate,
  promptVersionCreate,
  quantJobCreate,
  quantJobPatch,
  underwritingGraphBatchCreate,
} from "@/lib/server/schemas";

const runId = "0fdb5d8d-635d-4589-a7d7-a2af4ef7a7c6";

const agentWriteInventory = [
  ["POST /api/agent/ideas", ideaCreate, { ticker: "MU" }],
  ["POST /api/agent/tasks", agentTaskCreate, { task_type: "underwrite", title: "Underwrite MU" }],
  ["POST /api/agent/tasks/claim", agentClaim, { agent: "hermes" }],
  ["POST /api/agent/tasks/[id]/complete", agentComplete, {}],
  ["POST /api/agent/notes", noteCreate, { title: "MU note" }],
  ["POST /api/agent/quant-jobs", quantJobCreate, { kind: "screen", name: "Quality screen" }],
  ["PATCH /api/agent/quant-jobs?id=…", quantJobPatch, { status: "running" }],
  ["POST /api/agent/best-ideas", bestIdeasSnapshotCreate, { topTen: [{ ticker: "MU" }] }],
  ["POST /api/agent/learnings", learningSnapshotCreate, {
    summary: "Learning summary",
    principles: ["Prefer primary evidence."],
    changes: [{ title: "MU", learning: "Demand improved.", implication: "Refresh the model." }],
  }],
  ["POST /api/agent/prompts", promptVersionCreate, {
    prompt_id: "company-underwrite",
    version: "1.0.0",
    role: "Company analyst",
    schema_version: "company-model-v1",
    prompt_body: "Underwrite from primary evidence.",
  }],
  ["POST /api/agent/runs", agentRunCreate, {
    workflow_id: "company-underwrite",
    workflow_version: "1.0.0",
    agent_name: "hermes",
  }],
  ["PATCH /api/agent/runs/[id]", agentRunPatch, { status: "running" }],
  ["POST /api/agent/underwriting", underwritingGraphBatchCreate, {
    agent_run_id: runId,
    nodes: [{ stable_key: "MU:company", node_type: "company", title: "MU", as_of: "2000-01-01T00:00:00Z" }],
    edges: [],
  }],
  ["POST /api/agent/forecasts", forecastCreate, {
    stable_key: "MU:forecast:base",
    ticker: "MU",
    scenario: "Base",
    forecast_type: "annualized_return",
    horizon_date: "2099-01-01",
    predicted_value: 0.14,
    agent_run_id: runId,
    model_version: "2000-01-01T00:00:00Z",
  }],
  ["POST /api/agent/forecast-outcomes", forecastOutcomeCreate, {
    forecast_id: runId,
    observed_at: "2000-01-01T00:00:00Z",
    actual_value: 0.12,
    evidence_url: "https://www.sec.gov/Archives/example",
  }],
] as const;

describe("universal agent write schema strictness", () => {
  it.each(agentWriteInventory)("rejects unknown top-level fields for %s", (_route, schema, validBody) => {
    const result = schema.safeParse({ ...validBody, server_owned_field: "must-not-be-stripped" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({
        code: "unrecognized_keys",
        keys: ["server_owned_field"],
      }));
    }
  });

  it.each([
    ["POST /api/agent/best-ideas topTen item", bestIdeasSnapshotCreate, {
      topTen: [{ ticker: "MU", created_at: "2000-01-01T00:00:00Z" }],
    }],
    ["POST /api/agent/best-ideas watchlistTen item", bestIdeasSnapshotCreate, {
      topTen: [{ ticker: "MU" }],
      watchlistTen: [{ ticker: "NVDA", unknown_nested: true }],
    }],
    ["POST /api/agent/learnings change", learningSnapshotCreate, {
      summary: "Learning summary",
      principles: ["Prefer primary evidence."],
      changes: [{ title: "MU", learning: "Demand improved.", implication: "Refresh the model.", id: "server-owned" }],
    }],
    ["POST /api/agent/underwriting node", underwritingGraphBatchCreate, {
      agent_run_id: runId,
      nodes: [{ stable_key: "MU:company", node_type: "company", title: "MU", as_of: "2000-01-01T00:00:00Z", created_at: "2000-01-01T00:00:00Z" }],
      edges: [],
    }],
    ["POST /api/agent/underwriting edge", underwritingGraphBatchCreate, {
      agent_run_id: runId,
      nodes: [{ stable_key: "MU:company", node_type: "company", title: "MU", as_of: "2000-01-01T00:00:00Z" }],
      edges: [{ from_key: "MU:company", to_key: "MU:company", relationship: "supports", created_at: "2000-01-01T00:00:00Z" }],
    }],
  ] as const)("rejects unknown nested object fields for %s", (_shape, schema, body) => {
    const result = schema.safeParse(body);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({ code: "unrecognized_keys" }));
    }
  });

  it("preserves documented extensible JSON maps instead of treating their keys as unknown", () => {
    expect(ideaCreate.parse({
      ticker: "MU",
      source_ref: { provider: "sec", filing: { accession: "0001" } },
      metadata: { review: { owner: "risk" } },
    })).toMatchObject({
      source_ref: { provider: "sec", filing: { accession: "0001" } },
      metadata: { review: { owner: "risk" } },
    });
  });
});
