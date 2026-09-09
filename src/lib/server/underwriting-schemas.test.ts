import { describe, expect, it } from "vitest";
import {
  agentRunCreate,
  agentRunListQuery,
  agentRunPatch,
  forecastCreate,
  forecastListQuery,
  forecastOutcomeCreate,
  promptListQuery,
  promptVersionCreate,
  runIdParams,
  underwritingGraphBatchCreate,
} from "@/lib/server/schemas";
import { acceptedEvidenceUrls, rejectedEvidenceUrls } from "@/lib/test-fixtures/evidence-url-matrix";

describe("underwriting write contracts", () => {
  it("validates list pagination before queries are built", () => {
    expect(promptListQuery.parse({})).toMatchObject({ limit: 500, offset: 0 });
    expect(agentRunListQuery.parse({ limit: "25", offset: "50", ticker: "nas:mu" })).toMatchObject({ limit: 25, offset: 50, ticker: "NAS:MU" });
    expect(forecastListQuery.parse({ limit: "999", offset: "0", status: "open" })).toMatchObject({ limit: 999, offset: 0, status: "open" });

    for (const value of ["NaN", "-1", "1.5", "", "1000"]) {
      expect(forecastListQuery.safeParse({ limit: value }).success).toBe(false);
    }
    for (const value of ["NaN", "-1", "1.5", "", "1000001"]) {
      expect(agentRunListQuery.safeParse({ offset: value }).success).toBe(false);
    }
  });

  it("rejects malformed run ids", () => {
    expect(runIdParams.safeParse({ id: "not-a-uuid" }).success).toBe(false);
    expect(runIdParams.parse({ id: "0fdb5d8d-635d-4589-a7d7-a2af4ef7a7c6" })).toEqual({ id: "0fdb5d8d-635d-4589-a7d7-a2af4ef7a7c6" });
  });

  it("normalizes an agent run and preserves explicit workflow versions", () => {
    const parsed = agentRunCreate.parse({
      workflow_id: "daily-10-plus-10",
      workflow_version: "2.0.0",
      prompt_id: "pm-refresh",
      prompt_version: "1.3.0",
      agent_name: "hermes-pm",
      external_key: "daily-10-plus-10:2026-09-07",
      ticker: "nas:mu",
      tools_used: ["sec-edgar", "gurufocus"],
      source_count: 4,
    });
    expect(parsed).toMatchObject({ ticker: "NAS:MU", status: "running", workflow_version: "2.0.0", prompt_version: "1.3.0", external_key: "daily-10-plus-10:2026-09-07" });
    expect(agentRunCreate.safeParse({ workflow_id: "daily-10-plus-10", workflow_version: "2.0.0", agent_name: "hermes-pm", status: "succeeded", completed_at: "2026-09-07T12:00:00.000Z" }).success).toBe(false);
  });

  it("rejects caller-owned completion time and invalid run timestamps", () => {
    const base = {
      workflow_id: "daily-10-plus-10",
      workflow_version: "2.0.0",
      agent_name: "hermes-pm",
    };

    expect(agentRunCreate.safeParse({ ...base, completed_at: "2000-01-01T00:00:00.000Z" }).success).toBe(false);
    expect(agentRunCreate.safeParse({ ...base, started_at: "9999-01-01T00:00:00.000Z" }).success).toBe(false);
    expect(agentRunCreate.safeParse({ ...base, started_at: "infinity" }).success).toBe(false);
    expect(agentRunPatch.safeParse({ status: "succeeded", completed_at: "9999-01-01T00:00:00.000Z" }).success).toBe(false);
    expect(agentRunPatch.safeParse({ status: "succeeded", completed_at: "infinity" }).success).toBe(false);
  });

  it("requires complete or absent immutable prompt provenance", () => {
    const base = {
      workflow_id: "daily-10-plus-10",
      workflow_version: "2.0.0",
      agent_name: "hermes-pm",
    };

    expect(agentRunCreate.safeParse({ ...base, prompt_id: "pm-refresh" }).success).toBe(false);
    expect(agentRunCreate.safeParse({ ...base, prompt_version: "1.3.0" }).success).toBe(false);
    expect(agentRunCreate.safeParse({ ...base, prompt_id: null, prompt_version: "1.3.0" }).success).toBe(false);
    expect(agentRunCreate.safeParse({ ...base, prompt_id: "pm-refresh", prompt_version: null }).success).toBe(false);
    expect(agentRunCreate.safeParse(base).success).toBe(true);
    expect(agentRunCreate.safeParse({ ...base, prompt_id: null, prompt_version: null }).success).toBe(true);
    expect(agentRunCreate.safeParse({ ...base, prompt_id: "pm-refresh", prompt_version: "1.3.0" }).success).toBe(true);
  });

  it("rejects graph edges whose keys are absent from the submitted node batch", () => {
    const result = underwritingGraphBatchCreate.safeParse({
      agent_run_id: "0fdb5d8d-635d-4589-a7d7-a2af4ef7a7c6",
      nodes: [{ stable_key: "MU:company", node_type: "company", ticker: "MU", title: "MU", as_of: "2026-09-07T00:00:00.000Z" }],
      edges: [{ from_key: "MU:company", to_key: "MU:forecast:base", relationship: "has_forecast" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts an internally connected graph batch", () => {
    const result = underwritingGraphBatchCreate.parse({
      agent_run_id: "0fdb5d8d-635d-4589-a7d7-a2af4ef7a7c6",
      nodes: [
        { stable_key: "MU:company", node_type: "company", ticker: "mu", title: "MU", as_of: "2026-09-07T00:00:00.000Z" },
        { stable_key: "MU:forecast:base", node_type: "forecast", ticker: "MU", title: "Base case", as_of: "2026-09-07T00:00:00.000Z" },
      ],
      edges: [{ from_key: "MU:company", to_key: "MU:forecast:base", relationship: "has_forecast" }],
    });
    expect(result.nodes[0]?.ticker).toBe("MU");
  });

  it("rejects graph node publication instants in the future", () => {
    const base = {
      agent_run_id: "0fdb5d8d-635d-4589-a7d7-a2af4ef7a7c6",
      edges: [],
    };

    expect(underwritingGraphBatchCreate.safeParse({
      ...base,
      nodes: [{ stable_key: "MU:historical", node_type: "company", ticker: "MU", title: "MU", as_of: "2000-01-01T00:00:00-05:00" }],
    }).success).toBe(true);
    expect(underwritingGraphBatchCreate.safeParse({
      ...base,
      nodes: [{ stable_key: "MU:future", node_type: "company", ticker: "MU", title: "MU", as_of: "9999-01-01T00:00:00.000Z" }],
    }).success).toBe(false);
  });

  it("canonicalizes valid graph-node validity windows and permits null, equal, offset-equivalent, and future expiration", () => {
    const base = {
      agent_run_id: "0fdb5d8d-635d-4589-a7d7-a2af4ef7a7c6",
      edges: [],
    };
    const nodes = [
      { stable_key: "MU:null-validity", node_type: "company", title: "Null", as_of: "2000-01-01T00:00:00Z", valid_until: null },
      { stable_key: "MU:equal-validity", node_type: "company", title: "Equal", as_of: "2000-01-01T00:00:00Z", valid_until: "2000-01-01T00:00:00Z" },
      { stable_key: "MU:offset-validity", node_type: "company", title: "Offset", as_of: "1999-12-31T19:00:00-05:00", valid_until: "2000-01-01T00:00:00+00:00" },
      { stable_key: "MU:future-validity", node_type: "company", title: "Future", as_of: "2000-01-01T00:00:00Z", valid_until: "2999-01-01T00:00:00-05:00" },
    ];

    const parsed = underwritingGraphBatchCreate.parse({ ...base, nodes });
    expect(parsed.nodes.map(({ as_of, valid_until }) => ({ as_of, valid_until }))).toEqual([
      { as_of: "2000-01-01T00:00:00.000Z", valid_until: null },
      { as_of: "2000-01-01T00:00:00.000Z", valid_until: "2000-01-01T00:00:00.000Z" },
      { as_of: "2000-01-01T00:00:00.000Z", valid_until: "2000-01-01T00:00:00.000Z" },
      { as_of: "2000-01-01T00:00:00.000Z", valid_until: "2999-01-01T05:00:00.000Z" },
    ]);
  });

  it.each([
    ["earlier finite instant", "1999-12-31T23:59:59.999Z"],
    ["positive infinity", "infinity"],
    ["negative infinity", "-infinity"],
    ["unparseable timestamp", "not-a-timestamp"],
  ])("rejects graph-node valid_until when it is an %s", (_label, valid_until) => {
    const result = underwritingGraphBatchCreate.safeParse({
      agent_run_id: "0fdb5d8d-635d-4589-a7d7-a2af4ef7a7c6",
      nodes: [{
        stable_key: "MU:invalid-validity",
        node_type: "company",
        title: "Invalid validity",
        as_of: "2000-01-01T00:00:00Z",
        valid_until,
      }],
      edges: [],
    });

    expect(result.success).toBe(false);
    if (!result.success && valid_until.startsWith("1999")) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({
        path: ["nodes", 0, "valid_until"],
        message: "Graph node valid_until must be greater than or equal to as_of.",
      }));
    }
  });

  it("rejects duplicate logical edges within a graph batch", () => {
    const result = underwritingGraphBatchCreate.safeParse({
      agent_run_id: "0fdb5d8d-635d-4589-a7d7-a2af4ef7a7c6",
      nodes: [
        { stable_key: "MU:company", node_type: "company", ticker: "MU", title: "MU", as_of: "2026-09-07T00:00:00.000Z" },
        { stable_key: "MU:forecast:base", node_type: "forecast", ticker: "MU", title: "Base case", as_of: "2026-09-07T00:00:00.000Z" },
      ],
      edges: [
        { from_key: "MU:company", to_key: "MU:forecast:base", relationship: "has_forecast" },
        { from_key: "MU:company", to_key: "MU:forecast:base", relationship: "has_forecast", note: "Duplicate with different attributes" },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({ path: ["edges", 1], message: "Graph edges must be logically unique within a batch." }));
    }
  });

  it("requires the actual prompt body for a versioned prompt", () => {
    expect(promptVersionCreate.safeParse({ prompt_id: "company-underwrite", version: "1.0.0", role: "company analyst", schema_version: "company-model-v1" }).success).toBe(false);
    expect(promptVersionCreate.parse({ prompt_id: "company-underwrite", version: "1.0.0", role: "company analyst", schema_version: "company-model-v1", prompt_body: "Underwrite the company from primary evidence." }).status).toBe("active");
  });

  it("rejects caller-owned prompt released_at instead of stripping it", () => {
    const result = promptVersionCreate.safeParse({
      prompt_id: "company-underwrite",
      version: "1.0.0",
      role: "company analyst",
      schema_version: "company-model-v1",
      prompt_body: "Underwrite the company from primary evidence.",
      released_at: "2000-01-01T00:00:00.000Z",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({
        code: "unrecognized_keys",
        keys: ["released_at"],
      }));
    }
  });

  it("only permits forecasts to be created open", () => {
    const agentRunId = "0fdb5d8d-635d-4589-a7d7-a2af4ef7a7c6";
    expect(forecastCreate.parse({ stable_key: "MU:forecast:base", ticker: "MU", scenario: "Base", forecast_type: "annualized_return", horizon_date: "2099-09-07", predicted_value: 0.14, benchmark_value: 0.12, agent_run_id: agentRunId, model_version: "2026-09-07T00:00:00.000Z" })).toMatchObject({ status: "open", horizon_date: "2099-09-07", agent_run_id: agentRunId });
    expect(forecastCreate.safeParse({ stable_key: "MU:forecast:base", ticker: "MU", scenario: "Base", forecast_type: "annualized_return", horizon_date: "2099-09-07", predicted_value: 0.14, agent_run_id: agentRunId, model_version: "2026-09-07T00:00:00.000Z", as_of: "2000-01-01T00:00:00.000Z" }).success).toBe(false);
    expect(forecastCreate.safeParse({ stable_key: "MU:forecast:base", ticker: "MU", scenario: "Base", forecast_type: "annualized_return", horizon_date: "2099-09-07", predicted_value: 0.14, agent_run_id: agentRunId, model_version: "2026-09-07T00:00:00.000Z", status: "graded" }).success).toBe(false);
    expect(forecastCreate.safeParse({ stable_key: "MU:forecast:base", ticker: "MU", scenario: "Base", forecast_type: "annualized_return", horizon_date: "2000-01-01", predicted_value: 0.14, agent_run_id: agentRunId, model_version: "2026-09-07T00:00:00.000Z" }).success).toBe(false);
  });

  it("rejects non-finite forecast numerics at the application boundary", () => {
    const base = {
      stable_key: "MU:forecast:base",
      ticker: "MU",
      scenario: "Base",
      forecast_type: "annualized_return",
      horizon_date: "2099-09-07",
      probability: 0.5,
      predicted_value: 0.14,
      benchmark_value: 0.12,
      agent_run_id: "0fdb5d8d-635d-4589-a7d7-a2af4ef7a7c6",
      model_version: "2026-09-07T00:00:00.000Z",
    };

    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(forecastCreate.safeParse({ ...base, predicted_value: value }).success).toBe(false);
      expect(forecastCreate.safeParse({ ...base, benchmark_value: value }).success).toBe(false);
    }
    expect(forecastCreate.safeParse({ ...base, benchmark_value: null }).success).toBe(true);
  });

  it("requires forecast API writes to identify their agent run", () => {
    const forecast = { stable_key: "MU:forecast:base", ticker: "MU", scenario: "Base", forecast_type: "annualized_return", horizon_date: "2099-09-07", predicted_value: 0.14, model_version: "2026-09-07T00:00:00.000Z" };
    expect(forecastCreate.safeParse(forecast).success).toBe(false);
    expect(forecastCreate.safeParse({ ...forecast, agent_run_id: null }).success).toBe(false);
  });

  it("normalizes graph-compatible forecast model timestamps and rejects labels", () => {
    const base = {
      stable_key: "MU:forecast:base",
      ticker: "MU",
      scenario: "Base",
      forecast_type: "annualized_return",
      horizon_date: "2099-09-07",
      predicted_value: 0.14,
      agent_run_id: "0fdb5d8d-635d-4589-a7d7-a2af4ef7a7c6",
    };

    expect(forecastCreate.parse({ ...base, model_version: "2026-09-07T00:00:00+00:00" }).model_version)
      .toBe("2026-09-07T00:00:00.000Z");
    expect(forecastCreate.parse({ ...base, model_version: "2026-09-06T19:00:00-05:00" }).model_version)
      .toBe("2026-09-07T00:00:00.000Z");
    expect(forecastCreate.safeParse({ ...base, model_version: "v1" }).success).toBe(false);
    expect(forecastCreate.safeParse({ ...base, model_version: "9999-01-01T00:00:00.000Z" }).success).toBe(false);
  });

  it("rejects forbidden immutable fields in agent run patches instead of stripping them", () => {
    const result = agentRunPatch.safeParse({ status: "succeeded", completed_at: "2026-09-07T12:00:00.000Z", output_ref: { table: "result" }, prompt_id: "rewritten", external_key: "rewritten", tools_used: ["fake"], source_count: 0, input_ref: { rewritten: true }, started_at: "2000-01-01T00:00:00.000Z" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({
        code: "unrecognized_keys",
        keys: expect.arrayContaining(["prompt_id", "external_key", "tools_used", "source_count", "input_ref", "started_at"]),
      }));
    }
  });

  it("rejects unknown and server-owned properties at every underwriting write boundary", () => {
    const run = {
      workflow_id: "daily-10-plus-10",
      workflow_version: "2.0.0",
      agent_name: "hermes-pm",
    };
    const graph = {
      agent_run_id: "0fdb5d8d-635d-4589-a7d7-a2af4ef7a7c6",
      nodes: [{ stable_key: "MU:company", node_type: "company", title: "MU", as_of: "2000-01-01T00:00:00Z" }],
      edges: [],
    };
    const forecast = {
      stable_key: "MU:forecast:base",
      ticker: "MU",
      scenario: "Base",
      forecast_type: "annualized_return",
      horizon_date: "2099-01-01",
      predicted_value: 0.14,
      agent_run_id: graph.agent_run_id,
      model_version: "2000-01-01T00:00:00Z",
    };
    const outcome = {
      forecast_id: graph.agent_run_id,
      observed_at: "2000-01-01T00:00:00Z",
      actual_value: 0.12,
      evidence_url: "https://www.sec.gov/Archives/example",
    };

    expect(agentRunCreate.safeParse({ ...run, created_at: "2000-01-01T00:00:00Z" }).success).toBe(false);
    expect(agentRunPatch.safeParse({ status: "running", updated_at: "2000-01-01T00:00:00Z" }).success).toBe(false);
    expect(underwritingGraphBatchCreate.safeParse({ ...graph, created_at: "2000-01-01T00:00:00Z" }).success).toBe(false);
    expect(underwritingGraphBatchCreate.safeParse({ ...graph, nodes: [{ ...graph.nodes[0], created_at: "2000-01-01T00:00:00Z" }] }).success).toBe(false);
    expect(underwritingGraphBatchCreate.safeParse({ ...graph, edges: [{ from_key: "MU:company", to_key: "MU:company", relationship: "supports", created_at: "2000-01-01T00:00:00Z" }] }).success).toBe(false);
    expect(forecastCreate.safeParse({ ...forecast, as_of: "2000-01-01T00:00:00Z" }).success).toBe(false);
    expect(forecastOutcomeCreate.safeParse({ ...outcome, created_at: "2000-01-01T00:00:00Z" }).success).toBe(false);
  });

  it("rejects empty run patches and enforces terminal completion pairing", () => {
    expect(agentRunPatch.safeParse({}).success).toBe(false);
    expect(agentRunPatch.safeParse({ prompt_id: "ignored-immutable-field" }).success).toBe(false);
    expect(agentRunPatch.safeParse({ status: "succeeded" }).success).toBe(false);
    expect(agentRunPatch.safeParse({ status: "failed", completed_at: null }).success).toBe(false);
    expect(agentRunPatch.safeParse({ status: "running", completed_at: "2026-09-07T12:00:00.000Z" }).success).toBe(false);
    expect(agentRunPatch.safeParse({ completed_at: "2026-09-07T12:00:00.000Z" }).success).toBe(false);
    expect(agentRunPatch.safeParse({ status: "running" }).success).toBe(true);
    expect(agentRunPatch.safeParse({ status: "cancelled", completed_at: "2026-09-07T12:00:00.000Z" }).success).toBe(true);
    expect(agentRunPatch.safeParse({ output_ref: { table: "result" } }).success).toBe(true);
  });

  it("requires cited evidence for realized outcomes", () => {
    const base = { forecast_id: "0fdb5d8d-635d-4589-a7d7-a2af4ef7a7c6", observed_at: "2000-09-07T00:00:00.000Z", actual_value: 0.11, qqq_value: 0.13 };
    expect(forecastOutcomeCreate.safeParse(base).success).toBe(false);
    expect(forecastOutcomeCreate.parse({ ...base, evidence_url: "https://example.com/outcome" }).evidence_url).toBe("https://example.com/outcome");
  });

  it("rejects non-finite outcome numerics at the application boundary", () => {
    const base = {
      forecast_id: "0fdb5d8d-635d-4589-a7d7-a2af4ef7a7c6",
      observed_at: "2000-09-07T00:00:00.000Z",
      actual_value: 0.11,
      qqq_value: 0.13,
      evidence_url: "https://example.com/outcome",
    };

    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(forecastOutcomeCreate.safeParse({ ...base, actual_value: value }).success).toBe(false);
      expect(forecastOutcomeCreate.safeParse({ ...base, qqq_value: value }).success).toBe(false);
    }
    expect(forecastOutcomeCreate.safeParse({ ...base, qqq_value: null }).success).toBe(true);
  });

  it("accepts only credential-free HTTPS outcome evidence on a valid public-style host", () => {
    const base = { forecast_id: "0fdb5d8d-635d-4589-a7d7-a2af4ef7a7c6", observed_at: "2000-09-07T00:00:00.000Z", actual_value: 0.11 };
    for (const evidence_url of acceptedEvidenceUrls) {
      expect(forecastOutcomeCreate.safeParse({ ...base, evidence_url }).success, evidence_url).toBe(true);
    }
    for (const evidence_url of rejectedEvidenceUrls) {
      expect(forecastOutcomeCreate.safeParse({ ...base, evidence_url }).success, evidence_url).toBe(false);
    }
  });

  it("rejects future outcome observations", () => {
    const base = {
      forecast_id: "0fdb5d8d-635d-4589-a7d7-a2af4ef7a7c6",
      actual_value: 0.11,
      evidence_url: "https://example.com/outcome",
    };
    expect(forecastOutcomeCreate.safeParse({ ...base, observed_at: "2000-09-07T00:00:00.000Z" }).success).toBe(true);
    expect(forecastOutcomeCreate.safeParse({ ...base, observed_at: "9999-09-07T00:00:00.000Z" }).success).toBe(false);
  });
});
