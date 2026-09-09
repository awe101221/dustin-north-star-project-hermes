import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Rest } from "../lib/rest";
import {
  persistUnderwritingSeedOutput,
  selectUnderwritingTerminalReplayArgs,
  type UnderwritingTerminalRunContract,
  type UnderwritingTerminalRunReadback,
} from "./underwriting-persistence";

const runId = "70000000-0000-4000-8000-000000000001";
const legacyRunId = "1e48faa4-20e5-4a0d-b155-c3e13762b36d";
const nodes = [
  { stable_key: "MU:company", node_type: "company", ticker: "MU", title: "MU", body: null, status: "active", confidence: null, as_of: "2026-09-08T00:00:00Z", valid_until: null, prompt_id: "company-underwrite", prompt_version: "1.0.0", payload: {} },
  { stable_key: "MU:evidence", node_type: "evidence", ticker: "MU", title: "Evidence", body: null, status: "active", confidence: null, as_of: "2026-09-08T00:00:00Z", valid_until: null, prompt_id: "company-underwrite", prompt_version: "1.0.0", payload: {} },
];
const edges = [
  { from_key: "MU:evidence", to_key: "MU:company", relationship: "supports", strength: null, note: null, metadata: {} },
];
const forecasts = [
  { stable_key: "MU:forecast:base", ticker: "MU", scenario: "Base", forecast_type: "annualized_return", horizon_date: "2031-09-08", probability: 0.5, predicted_value: 0.14, unit: "ratio", benchmark_symbol: "QQQ", benchmark_value: 0.1, model_version: "2026-09-08T00:00:00Z", prompt_id: "company-underwrite", prompt_version: "1.0.0", metadata: {} },
];
const outputRef = { tables: ["hermes_underwriting_nodes", "hermes_underwriting_edges", "hermes_forecasts"] };
const metrics = { companies: 1, graphNodes: 2, graphEdges: 1, forecastsExpected: 1 };
const legacyOutputRef = { tables: ["hermes_underwriting_nodes", "hermes_underwriting_edges", "hermes_forecasts"] };
const legacyMetrics = { companies: 20, forecastsExpected: 60, forecastsInserted: 0, graphEdges: 440, graphNodes: 460 };
const legacyCurrentMetrics = { companies: 20, forecastsExpected: 60, graphEdges: 440, graphNodes: 460 };
const legacyNodes = Array.from({ length: 460 }, (_, index) => ({
  ...nodes[index % nodes.length]!,
  stable_key: `legacy-node-${index}`,
}));
const legacyEdges = Array.from({ length: 440 }, (_, index) => ({
  ...edges[0]!,
  from_key: `legacy-node-${index}`,
  to_key: `legacy-node-${index + 1}`,
}));
const legacyForecasts = Array.from({ length: 60 }, (_, index) => ({
  ...forecasts[0]!,
  stable_key: `legacy-forecast-${index}`,
  ticker: `T${Math.floor(index / 3)}`,
  scenario: ["Bear", "Base", "Bull"][index % 3],
}));

function fakeRest(overrides: Partial<Record<keyof Rest, unknown>>): Rest {
  return {
    url: "https://example.invalid",
    select: vi.fn(async () => []),
    selectAll: vi.fn(async () => []),
    insert: vi.fn(async () => []),
    upsert: vi.fn(async () => []),
    patch: vi.fn(async () => []),
    del: vi.fn(async () => undefined),
    rpc: vi.fn(async () => ({})),
    count: vi.fn(async () => 0),
    ...overrides,
  } as Rest;
}

const args = { p_agent_run_id: runId, p_nodes: nodes, p_edges: edges, p_forecasts: forecasts, p_output_ref: outputRef, p_metrics: metrics };
const legacyArgs = {
  ...args,
  p_agent_run_id: legacyRunId,
  p_nodes: legacyNodes,
  p_edges: legacyEdges,
  p_forecasts: legacyForecasts,
  p_metrics: legacyCurrentMetrics,
};

const terminalRunContract: UnderwritingTerminalRunContract = {
  status: "succeeded",
  external_key: "company-model-registry-import:2026-09-08T00:00:00Z",
  workflow_id: "company-model-registry-import",
  workflow_version: "1.0.0",
  prompt_id: "company-underwrite",
  prompt_version: "1.0.0",
  agent_name: "hermes-pm",
  ticker: null,
  task_id: null,
  tools_used: ["test-tool"],
  source_count: 2,
  input_ref: { file: "src/lib/company-models.ts", tickers: ["MU"] },
  metadata: { seed: true, provisionalResearch: true, tickers: ["MU"] },
};

function terminalRun(overrides: Partial<UnderwritingTerminalRunReadback> = {}): UnderwritingTerminalRunReadback {
  return { id: runId, ...terminalRunContract, output_ref: outputRef, metrics, ...overrides };
}

function terminalReplayDb(
  nodeProvenance: Array<{ prompt_id: string | null; prompt_version: string | null }>,
  forecastProvenance: Array<{ prompt_id: string | null; prompt_version: string | null }>,
  rpc = vi.fn(async () => ({ nodes: 2, edges: 1, forecasts_inserted: 0 })),
) {
  return fakeRest({
    selectAll: vi.fn(async (table: string) => (
      table === "hermes_underwriting_nodes" ? nodeProvenance : forecastProvenance
    ) as never[]),
    rpc,
  });
}

function provenanceFor(rows: Array<{ prompt_id?: unknown; prompt_version?: unknown }>) {
  return rows.map(({ prompt_id, prompt_version }) => ({
    prompt_id: (prompt_id ?? null) as string | null,
    prompt_version: (prompt_version ?? null) as string | null,
  }));
}

function exactReadback(table: string) {
  if (table === "hermes_underwriting_nodes") return nodes.map((node, index) => ({ ...node, id: `node-${index + 1}`, agent_run_id: runId, created_at: "2026-09-08T00:00:10Z", updated_at: "2026-09-08T00:00:20Z" }));
  if (table === "hermes_underwriting_edges") return [{ ...edges[0], id: "edge-1", from_node_id: "node-2", to_node_id: "node-1", agent_run_id: runId, created_at: "2026-09-08T00:00:25Z" }];
  if (table === "hermes_forecasts") return forecasts.map((forecast) => ({
    ...forecast,
    id: "forecast-1",
    agent_run_id: runId,
    as_of: "2026-09-08T00:00:30Z",
    status: "open",
    created_at: "2026-09-08T00:00:30Z",
    updated_at: "2026-09-08T00:00:30Z",
  }));
  return [];
}

function succeededRun(overrides: Record<string, unknown> = {}) {
  return {
    id: runId,
    status: "succeeded",
    output_ref: outputRef,
    metrics,
    prompt_id: "company-underwrite",
    prompt_version: "1.0.0",
    started_at: "2026-09-08T00:00:00Z",
    completed_at: "2026-09-08T00:01:00Z",
    created_at: "2026-09-08T00:00:00Z",
    updated_at: "2026-09-08T00:01:00Z",
    ...overrides,
  };
}

function lostResponseDb(options: {
  run?: Record<string, unknown>;
  readback?: (table: string) => unknown[];
} = {}) {
  return fakeRest({
    rpc: vi.fn(async () => { throw new TypeError("fetch failed after commit"); }),
    select: vi.fn(async () => [options.run ?? succeededRun()]),
    selectAll: vi.fn(async (table: string) => (options.readback ?? exactReadback)(table) as never[]),
  });
}

describe("terminal underwriting seed replay selection", () => {
  it("reads complete output_ref and metrics with the terminal run contract before replay selection", () => {
    const seedSource = readFileSync("scripts/seed/seed-underwriting.ts", "utf8");

    expect(seedSource).toContain("select=id,status,external_key,workflow_id,workflow_version,prompt_id,prompt_version,agent_name,ticker,task_id,tools_used,source_count,input_ref,output_ref,metrics,metadata");
  });

  it("keeps exact current completion metadata with explicit prompt-attributed replay", async () => {
    const db = terminalReplayDb(provenanceFor(nodes), provenanceFor(forecasts));

    const selected = await selectUnderwritingTerminalReplayArgs(
      db,
      args,
      terminalRun(),
      terminalRunContract,
    );

    expect(selected).toBe(args);
    expect(selected.p_output_ref).toBe(outputRef);
    expect(selected.p_metrics).toBe(metrics);
    expect(db.selectAll).toHaveBeenCalledTimes(2);
    expect(db.selectAll).toHaveBeenCalledWith(
      "hermes_underwriting_nodes",
      expect.not.stringContaining("limit="),
    );
    expect(db.selectAll).toHaveBeenCalledWith(
      "hermes_forecasts",
      expect.not.stringContaining("limit="),
    );
  });

  it("normalizes only the exact immutable allowlisted legacy completion metadata before one exact RPC", async () => {
    const rpc = vi.fn(async () => ({ nodes: 460, edges: 440, forecasts_inserted: 0 }));
    const db = terminalReplayDb(
      legacyNodes.map(() => ({ prompt_id: null, prompt_version: null })),
      legacyForecasts.map(() => ({ prompt_id: null, prompt_version: null })),
      rpc,
    );

    const selected = await selectUnderwritingTerminalReplayArgs(
      db,
      legacyArgs,
      terminalRun({
        id: legacyRunId,
        output_ref: legacyOutputRef,
        metrics: legacyMetrics,
      }),
      terminalRunContract,
    );
    await expect(persistUnderwritingSeedOutput(db, selected)).resolves.toEqual({
      nodes: 460,
      edges: 440,
      forecasts_inserted: 0,
      recovered: false,
    });

    expect(selected).not.toBe(args);
    expect(selected.p_nodes).toEqual(legacyNodes.map((row) => ({ ...row, prompt_id: null, prompt_version: null })));
    expect(selected.p_forecasts).toEqual(legacyForecasts.map((row) => ({ ...row, prompt_id: null, prompt_version: null })));
    expect(selected.p_output_ref).toEqual(legacyOutputRef);
    expect(selected.p_metrics).toEqual(legacyMetrics);
    expect(args.p_nodes).toEqual(nodes);
    expect(args.p_forecasts).toEqual(forecasts);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("hermes_complete_underwriting_seed", selected);
  });

  it.each([
    ["partial node pair", [{ prompt_id: "company-underwrite", prompt_version: null }], provenanceFor(forecasts)],
    ["mixed node pairs", [provenanceFor(nodes)[0]!, { prompt_id: null, prompt_version: null }], provenanceFor(forecasts)],
    ["other node pair", nodes.map(() => ({ prompt_id: "other", prompt_version: "1.0.0" })), provenanceFor(forecasts)],
    ["partial forecast pair", provenanceFor(nodes), [{ prompt_id: null, prompt_version: "1.0.0" }]],
    ["mixed collection provenance", provenanceFor(nodes), [{ prompt_id: null, prompt_version: null }]],
    ["missing node", provenanceFor(nodes).slice(0, 1), provenanceFor(forecasts)],
    ["extra forecast", provenanceFor(nodes), [...provenanceFor(forecasts), ...provenanceFor(forecasts)]],
  ])("fails closed for %s", async (_label, nodeRows, forecastRows) => {
    const db = terminalReplayDb(nodeRows, forecastRows);

    await expect(selectUnderwritingTerminalReplayArgs(
      db,
      args,
      terminalRun(),
      terminalRunContract,
    )).rejects.toThrow("Terminal underwriting seed provenance is not an allowed exact replay.");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["missing output ref", { output_ref: undefined }],
    ["wrong output ref", { output_ref: { tables: ["hermes_underwriting_nodes"] } }],
    ["extra output ref", { output_ref: { ...outputRef, unexpected: true } }],
    ["missing metrics", { metrics: undefined }],
    ["wrong metrics", { metrics: { ...metrics, companies: 2 } }],
    ["extra metrics", { metrics: { ...metrics, forecastsInserted: 0 } }],
    ["legacy metrics on a current run", { metrics: legacyMetrics }],
  ])("rejects current prompt-attributed replay with %s before RPC", async (_label, override) => {
    const db = terminalReplayDb(provenanceFor(nodes), provenanceFor(forecasts));

    await expect(selectUnderwritingTerminalReplayArgs(
      db,
      args,
      terminalRun(override as Partial<UnderwritingTerminalRunReadback>),
      terminalRunContract,
    )).rejects.toThrow("Terminal underwriting seed provenance is not an allowed exact replay.");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["an extra output_ref field", { p_output_ref: { ...outputRef, unexpected: true } }, { output_ref: { ...outputRef, unexpected: true } }],
    ["an extra metric", { p_metrics: { ...metrics, forecastsInserted: 0 } }, { metrics: { ...metrics, forecastsInserted: 0 } }],
    ["the complete legacy metrics", { p_metrics: legacyMetrics }, { metrics: legacyMetrics }],
  ])("rejects current replay when submitted and persisted metadata both contain %s", async (_label, argsOverride, runOverride) => {
    const db = terminalReplayDb(provenanceFor(nodes), provenanceFor(forecasts));

    await expect(selectUnderwritingTerminalReplayArgs(
      db,
      { ...args, ...argsOverride },
      terminalRun(runOverride),
      terminalRunContract,
    )).rejects.toThrow("Terminal underwriting seed provenance is not an allowed exact replay.");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["missing output ref", { output_ref: undefined }],
    ["wrong output ref", { output_ref: { tables: ["hermes_underwriting_nodes"] } }],
    ["extra output ref", { output_ref: { ...legacyOutputRef, unexpected: true } }],
    ["missing metrics", { metrics: undefined }],
    ["missing forecastsInserted", { metrics: { companies: 20, forecastsExpected: 60, graphEdges: 440, graphNodes: 460 } }],
    ["alternate forecastsExpected", { metrics: { ...legacyMetrics, forecastsExpected: 59 } }],
    ["alternate forecastsInserted", { metrics: { ...legacyMetrics, forecastsInserted: 1 } }],
    ["wrong metrics", { metrics: { ...legacyMetrics, companies: 19 } }],
    ["extra metrics", { metrics: { ...legacyMetrics, unexpected: 1 } }],
    ["current metrics", { metrics }],
  ])("rejects allowlisted null-provenance replay with %s before RPC", async (_label, override) => {
    const db = terminalReplayDb(
      legacyNodes.map(() => ({ prompt_id: null, prompt_version: null })),
      legacyForecasts.map(() => ({ prompt_id: null, prompt_version: null })),
    );

    await expect(selectUnderwritingTerminalReplayArgs(
      db,
      legacyArgs,
      terminalRun({
        id: legacyRunId,
        output_ref: legacyOutputRef,
        metrics: legacyMetrics,
        ...override,
      } as Partial<UnderwritingTerminalRunReadback>),
      terminalRunContract,
    )).rejects.toThrow("Terminal underwriting seed provenance is not an allowed exact replay.");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("rejects exact legacy persisted metadata when the generated current base metrics differ", async () => {
    const db = terminalReplayDb(
      legacyNodes.map(() => ({ prompt_id: null, prompt_version: null })),
      legacyForecasts.map(() => ({ prompt_id: null, prompt_version: null })),
    );

    await expect(selectUnderwritingTerminalReplayArgs(
      db,
      { ...legacyArgs, p_metrics: { ...legacyCurrentMetrics, forecastsExpected: 59 } },
      terminalRun({ id: legacyRunId, output_ref: legacyOutputRef, metrics: legacyMetrics }),
      terminalRunContract,
    )).rejects.toThrow("Terminal underwriting seed provenance is not an allowed exact replay.");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["forecast count", {
      args: { ...legacyArgs, p_forecasts: legacyForecasts.slice(0, 59), p_metrics: { ...legacyCurrentMetrics, forecastsExpected: 59 } },
      nodeProvenance: legacyNodes.map(() => ({ prompt_id: null, prompt_version: null })),
      forecastProvenance: legacyForecasts.slice(0, 59).map(() => ({ prompt_id: null, prompt_version: null })),
    }],
    ["node count", {
      args: { ...legacyArgs, p_nodes: legacyNodes.slice(0, 459), p_metrics: { ...legacyCurrentMetrics, graphNodes: 459 } },
      nodeProvenance: legacyNodes.slice(0, 459).map(() => ({ prompt_id: null, prompt_version: null })),
      forecastProvenance: legacyForecasts.map(() => ({ prompt_id: null, prompt_version: null })),
    }],
    ["edge count", {
      args: { ...legacyArgs, p_edges: legacyEdges.slice(0, 439), p_metrics: { ...legacyCurrentMetrics, graphEdges: 439 } },
      nodeProvenance: legacyNodes.map(() => ({ prompt_id: null, prompt_version: null })),
      forecastProvenance: legacyForecasts.map(() => ({ prompt_id: null, prompt_version: null })),
    }],
    ["company count", {
      args: {
        ...legacyArgs,
        p_forecasts: legacyForecasts.map((forecast) => ({ ...forecast, ticker: "ONLY" })),
        p_metrics: { ...legacyCurrentMetrics, companies: 1 },
      },
      nodeProvenance: legacyNodes.map(() => ({ prompt_id: null, prompt_version: null })),
      forecastProvenance: legacyForecasts.map(() => ({ prompt_id: null, prompt_version: null })),
    }],
  ])("rejects an alternate legacy %s before RPC even when generated metrics match it", async (_label, fixture) => {
    const db = terminalReplayDb(fixture.nodeProvenance, fixture.forecastProvenance);

    await expect(selectUnderwritingTerminalReplayArgs(
      db,
      fixture.args,
      terminalRun({ id: legacyRunId, output_ref: legacyOutputRef, metrics: legacyMetrics }),
      terminalRunContract,
    )).rejects.toThrow("Terminal underwriting seed provenance is not an allowed exact replay.");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("rejects allowlisted legacy completion metadata paired with current provenance", async () => {
    const db = terminalReplayDb(provenanceFor(legacyNodes), provenanceFor(legacyForecasts));

    await expect(selectUnderwritingTerminalReplayArgs(
      db,
      legacyArgs,
      terminalRun({ id: legacyRunId, output_ref: legacyOutputRef, metrics: legacyMetrics }),
      terminalRunContract,
    )).rejects.toThrow("Terminal underwriting seed provenance is not an allowed exact replay.");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("rejects the allowlisted immutable run id paired with current provenance and current metadata", async () => {
    const db = terminalReplayDb(provenanceFor(legacyNodes), provenanceFor(legacyForecasts));

    await expect(selectUnderwritingTerminalReplayArgs(
      db,
      legacyArgs,
      terminalRun({ id: legacyRunId, output_ref: legacyOutputRef, metrics: legacyCurrentMetrics }),
      terminalRunContract,
    )).rejects.toThrow("Terminal underwriting seed provenance is not an allowed exact replay.");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["status", { status: "running" }],
    ["external key", { external_key: "other-seed" }],
    ["workflow", { workflow_id: "other-workflow" }],
    ["workflow version", { workflow_version: "9.9.9" }],
    ["run prompt id", { prompt_id: "other-prompt" }],
    ["run prompt version", { prompt_version: "9.9.9" }],
    ["metadata", { metadata: { seed: true } }],
  ])("fails closed for a wrong terminal run %s contract", async (_label, override) => {
    const db = terminalReplayDb(
      provenanceFor(nodes),
      provenanceFor(forecasts),
    );

    await expect(selectUnderwritingTerminalReplayArgs(
      db,
      args,
      terminalRun(override),
      terminalRunContract,
    )).rejects.toThrow("Terminal underwriting seed provenance is not an allowed exact replay.");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("does not generalize null provenance to another terminal run id", async () => {
    const db = terminalReplayDb(
      legacyNodes.map(() => ({ prompt_id: null, prompt_version: null })),
      legacyForecasts.map(() => ({ prompt_id: null, prompt_version: null })),
    );

    await expect(selectUnderwritingTerminalReplayArgs(
      db,
      { ...legacyArgs, p_agent_run_id: "70000000-0000-4000-8000-000000000099" },
      terminalRun({
        id: "70000000-0000-4000-8000-000000000099",
        output_ref: legacyOutputRef,
        metrics: legacyMetrics,
      }),
      terminalRunContract,
    )).rejects.toThrow("Terminal underwriting seed provenance is not an allowed exact replay.");
    expect(db.rpc).not.toHaveBeenCalled();
  });
});

describe("underwriting seed persistence", () => {
  it("uses one seed-only RPC for graph, forecasts, and succeeded completion", async () => {
    const db = fakeRest({ rpc: vi.fn(async () => ({ nodes: 2, edges: 1, forecasts_inserted: 1 })) });

    await expect(persistUnderwritingSeedOutput(db, args)).resolves.toEqual({ nodes: 2, edges: 1, forecasts_inserted: 1, recovered: false });
    expect(db.rpc).toHaveBeenCalledWith("hermes_complete_underwriting_seed", args);
    expect(db.patch).not.toHaveBeenCalled();
  });

  it("treats a lost RPC response as success only after exact timestamp-safe run and payload readback", async () => {
    const offsetArgs = {
      ...args,
      p_nodes: nodes.map((node) => ({ ...node, as_of: "2026-09-07T19:00:00-05:00" })),
      p_forecasts: forecasts.map((forecast) => ({ ...forecast, model_version: "2026-09-07T19:00:00-05:00" })),
    };
    const db = lostResponseDb();

    await expect(persistUnderwritingSeedOutput(db, offsetArgs)).resolves.toEqual({ nodes: 2, edges: 1, forecasts_inserted: 1, recovered: true });
    expect(db.select).toHaveBeenCalledWith(
      "hermes_agent_runs",
      expect.stringContaining("prompt_id,prompt_version,started_at,completed_at,created_at,updated_at"),
    );
    expect(db.selectAll).toHaveBeenCalledWith(
      "hermes_forecasts",
      expect.stringMatching(/prompt_id,prompt_version[^&]*created_at,updated_at/),
    );
    expect(db.patch).not.toHaveBeenCalled();
  });

  it("recovers an exact committed seed when the legacy trigger clock left completed_at milliseconds after updated_at", async () => {
    const db = lostResponseDb({
      run: succeededRun({
        updated_at: "2026-09-08T00:00:59.995Z",
        completed_at: "2026-09-08T00:01:00.000Z",
      }),
    });

    await expect(persistUnderwritingSeedOutput(db, args)).resolves.toEqual({
      nodes: 2,
      edges: 1,
      forecasts_inserted: 1,
      recovered: true,
    });
    expect(db.patch).not.toHaveBeenCalled();
  });

  it("recovers offset-equivalent equality at both forecast registration-window boundaries", async () => {
    const offsetForecasts = forecasts.map((forecast) => ({
      ...forecast,
      model_version: "2026-09-07T19:00:00-05:00",
    }));
    const db = lostResponseDb({
      readback: (table) => table === "hermes_forecasts"
        ? exactReadback(table).map((forecast) => ({
          ...forecast,
          model_version: "2026-09-08T00:00:00Z",
          as_of: "2026-09-07T19:00:00-05:00",
          created_at: "2026-09-08T00:00:00Z",
          updated_at: "2026-09-07T19:01:00-05:00",
        }))
        : exactReadback(table),
    });

    await expect(
      persistUnderwritingSeedOutput(db, { ...args, p_forecasts: offsetForecasts }),
    ).resolves.toEqual({ nodes: 2, edges: 1, forecasts_inserted: 1, recovered: true });
    expect(db.patch).not.toHaveBeenCalled();
  });

  it("recovers a created-then-started-later seed only when forecast as_of remains inside the actual run window", async () => {
    const queuedNodes = nodes.map((node) => ({ ...node, as_of: "2026-09-08T00:17:01Z" }));
    const queuedForecasts = forecasts.map((forecast) => ({
      ...forecast,
      model_version: "2026-09-08T00:17:00Z",
    }));
    const queuedArgs = { ...args, p_nodes: queuedNodes, p_forecasts: queuedForecasts };
    const db = lostResponseDb({
      run: succeededRun({
        created_at: "2026-09-07T22:47:00Z",
        started_at: "2026-09-08T00:17:00Z",
        completed_at: "2026-09-08T00:17:05Z",
        updated_at: "2026-09-08T00:17:05Z",
      }),
      readback: (table) => {
        if (table === "hermes_underwriting_nodes") {
          return queuedNodes.map((node, index) => ({
            ...node,
            id: `node-${index + 1}`,
            agent_run_id: runId,
            created_at: "2026-09-08T00:17:01Z",
            updated_at: "2026-09-08T00:17:02Z",
          }));
        }
        if (table === "hermes_underwriting_edges") {
          return [{
            ...edges[0],
            id: "edge-1",
            from_node_id: "node-2",
            to_node_id: "node-1",
            agent_run_id: runId,
            created_at: "2026-09-08T00:17:03Z",
          }];
        }
        return queuedForecasts.map((forecast) => ({
          ...forecast,
          id: "forecast-1",
          agent_run_id: runId,
          as_of: "2026-09-08T00:17:04Z",
          status: "open",
          created_at: "2026-09-08T00:17:04Z",
          updated_at: "2026-09-08T00:17:04Z",
        }));
      },
    });

    await expect(persistUnderwritingSeedOutput(db, queuedArgs)).resolves.toEqual({
      nodes: 2,
      edges: 1,
      forecasts_inserted: 1,
      recovered: true,
    });
    expect(db.patch).not.toHaveBeenCalled();
  });

  it.each([
    ["stale pre-run as_of", { as_of: "2001-01-01T00:00:00Z" }, forecasts],
    ["post-completion as_of", { as_of: "2026-09-08T00:01:01Z" }, forecasts],
    ["model_version after as_of", {
      model_version: "2026-09-08T00:00:31Z",
      as_of: "2026-09-08T00:00:30Z",
    }, forecasts.map((forecast) => ({ ...forecast, model_version: "2026-09-08T00:00:31Z" }))],
  ] as const)("rejects lost-response recovery with forecast %s", async (_label, mutation, expectedForecasts) => {
    const db = lostResponseDb({
      readback: (table) => table === "hermes_forecasts"
        ? exactReadback(table).map((forecast) => ({ ...forecast, ...mutation }))
        : exactReadback(table),
    });

    await expect(
      persistUnderwritingSeedOutput(db, { ...args, p_forecasts: expectedForecasts }),
    ).rejects.toThrow("fetch failed after commit");
    expect(db.patch).not.toHaveBeenCalled();
  });

  it.each([
    ["run created_at", "hermes_agent_runs", "created_at"],
    ["run updated_at", "hermes_agent_runs", "updated_at"],
    ["node created_at", "hermes_underwriting_nodes", "created_at"],
    ["node updated_at", "hermes_underwriting_nodes", "updated_at"],
    ["edge created_at", "hermes_underwriting_edges", "created_at"],
    ["forecast created_at", "hermes_forecasts", "created_at"],
    ["forecast updated_at", "hermes_forecasts", "updated_at"],
  ])("rejects lost-response recovery when %s is omitted", async (_label, table, field) => {
    const db = lostResponseDb({
      run: table === "hermes_agent_runs" ? (() => {
        const row: Record<string, unknown> = succeededRun();
        delete row[field];
        return row;
      })() : undefined,
      readback: table === "hermes_agent_runs" ? undefined : (readTable) => exactReadback(readTable).map((row) => {
        if (readTable !== table) return row;
        const copy: Record<string, unknown> = { ...row };
        delete copy[field];
        return copy;
      }),
    });

    await expect(persistUnderwritingSeedOutput(db, args)).rejects.toThrow("fetch failed after commit");
    expect(db.patch).not.toHaveBeenCalled();
  });

  it.each([
    ["run partial prompt pair", { run: succeededRun({ prompt_version: null }) }],
    ["node partial prompt pair", { readback: (table: string) => table === "hermes_underwriting_nodes" ? exactReadback(table).map((row) => ({ ...row, prompt_version: null })) : exactReadback(table) }],
    ["node prompt mismatch", { readback: (table: string) => table === "hermes_underwriting_nodes" ? exactReadback(table).map((row) => ({ ...row, prompt_version: "9.9.9" })) : exactReadback(table) }],
    ["forecast partial prompt pair", { readback: (table: string) => table === "hermes_forecasts" ? exactReadback(table).map((row) => ({ ...row, prompt_id: null })) : exactReadback(table) }],
    ["forecast prompt mismatch", { readback: (table: string) => table === "hermes_forecasts" ? exactReadback(table).map((row) => ({ ...row, prompt_id: "other-prompt" })) : exactReadback(table) }],
  ] as const)("rejects lost-response recovery with %s", async (_label, options) => {
    const db = lostResponseDb(options);

    await expect(persistUnderwritingSeedOutput(db, args)).rejects.toThrow("fetch failed after commit");
    expect(db.patch).not.toHaveBeenCalled();
  });

  it.each([
    ["non-finite run created_at", { run: succeededRun({ created_at: "infinity" }) }],
    ["future node updated_at", { readback: (table: string) => table === "hermes_underwriting_nodes" ? exactReadback(table).map((row) => ({ ...row, updated_at: "2999-01-01T00:00:00Z" })) : exactReadback(table) }],
    ["invalid edge created_at", { readback: (table: string) => table === "hermes_underwriting_edges" ? exactReadback(table).map((row) => ({ ...row, created_at: "not-a-timestamp" })) : exactReadback(table) }],
    ["non-finite forecast updated_at", { readback: (table: string) => table === "hermes_forecasts" ? exactReadback(table).map((row) => ({ ...row, updated_at: "-infinity" })) : exactReadback(table) }],
    ["run created_at after updated_at", { run: succeededRun({ created_at: "2026-09-08T00:01:01Z", updated_at: "2026-09-08T00:01:00Z" }) }],
    ["run completed_at before created_at", { run: succeededRun({ created_at: "2026-09-08T00:00:50Z", completed_at: "2026-09-08T00:00:40Z" }) }],
    ["run updated_at before completed_at", { run: succeededRun({ completed_at: "2026-09-08T00:01:00Z", updated_at: "2026-09-08T00:00:30Z" }) }],
    ["node created_at after updated_at", { readback: (table: string) => table === "hermes_underwriting_nodes" ? exactReadback(table).map((row) => ({ ...row, created_at: "2026-09-08T00:00:21Z", updated_at: "2026-09-08T00:00:20Z" })) : exactReadback(table) }],
    ["forecast created_at after updated_at", { readback: (table: string) => table === "hermes_forecasts" ? exactReadback(table).map((row) => ({ ...row, created_at: "2026-09-08T00:00:31Z", updated_at: "2026-09-08T00:00:30Z" })) : exactReadback(table) }],
    ["edge predates run registration", { readback: (table: string) => table === "hermes_underwriting_edges" ? exactReadback(table).map((row) => ({ ...row, created_at: "2026-09-07T23:59:59Z" })) : exactReadback(table) }],
    ["forecast created after run completion", { readback: (table: string) => table === "hermes_forecasts" ? exactReadback(table).map((row) => ({ ...row, created_at: "2026-09-08T00:01:01Z", updated_at: "2026-09-08T00:01:01Z" })) : exactReadback(table) }],
  ] as const)("rejects lost-response recovery with %s", async (_label, options) => {
    const db = lostResponseDb(options);

    await expect(persistUnderwritingSeedOutput(db, args)).rejects.toThrow("fetch failed after commit");
    expect(db.patch).not.toHaveBeenCalled();
  });

  it("recovers an exact committed run with a finite future graph-node valid_until", async () => {
    const futureValidityArgs = {
      ...args,
      p_nodes: nodes.map((node) => ({ ...node, valid_until: "2999-01-01T00:00:00Z" })),
    };
    const db = lostResponseDb({
      readback: (table) => table === "hermes_underwriting_nodes"
        ? exactReadback(table).map((node) => ({ ...node, valid_until: "2998-12-31T19:00:00-05:00" }))
        : exactReadback(table),
    });

    await expect(persistUnderwritingSeedOutput(db, futureValidityArgs)).resolves.toEqual({
      nodes: 2,
      edges: 1,
      forecasts_inserted: 1,
      recovered: true,
    });
    expect(db.patch).not.toHaveBeenCalled();
  });

  it.each([
    ["run identity mismatch", { run: succeededRun({ id: "70000000-0000-4000-8000-000000000099" }) }],
    ["run started_at positive infinity", { run: succeededRun({ started_at: "infinity" }) }],
    ["run completed_at negative infinity", { run: succeededRun({ completed_at: "-infinity" }) }],
    ["run completed_at unparseable", { run: succeededRun({ completed_at: "not-a-timestamp" }) }],
    ["run started_at finite future", { run: succeededRun({ started_at: "2999-01-01T00:00:00Z", completed_at: "2999-01-01T00:01:00Z" }) }],
    ["run completed_at finite future", { run: succeededRun({ completed_at: "2999-01-01T00:01:00Z" }) }],
    ["completion before start", { run: succeededRun({ started_at: "2026-09-08T00:02:00Z", completed_at: "2026-09-08T00:01:00Z" }) }],
    ["succeeded without completion", { run: succeededRun({ completed_at: null }) }],
  ] as const)("rejects lost-response recovery with %s", async (_label, options) => {
    const db = lostResponseDb(options);

    await expect(persistUnderwritingSeedOutput(db, args)).rejects.toThrow("fetch failed after commit");
    expect(db.patch).not.toHaveBeenCalled();
  });

  it.each([
    ["graph node positive infinity", {
      args: { ...args, p_nodes: nodes.map((node) => ({ ...node, as_of: "infinity" })) },
      readback: (table: string) => table === "hermes_underwriting_nodes"
        ? exactReadback(table).map((node) => ({ ...node, as_of: "infinity" }))
        : exactReadback(table),
    }],
    ["graph node unparseable valid_until", {
      args: { ...args, p_nodes: nodes.map((node) => ({ ...node, valid_until: "not-a-timestamp" })) },
      readback: (table: string) => table === "hermes_underwriting_nodes"
        ? exactReadback(table).map((node) => ({ ...node, valid_until: "not-a-timestamp" }))
        : exactReadback(table),
    }],
    ["graph node non-finite valid_until", {
      args: { ...args, p_nodes: nodes.map((node) => ({ ...node, valid_until: "infinity" })) },
      readback: (table: string) => table === "hermes_underwriting_nodes"
        ? exactReadback(table).map((node) => ({ ...node, valid_until: "infinity" }))
        : exactReadback(table),
    }],
    ["graph node valid_until earlier than as_of", {
      args: { ...args, p_nodes: nodes.map((node) => ({ ...node, valid_until: "2026-09-07T23:59:59Z" })) },
      readback: (table: string) => table === "hermes_underwriting_nodes"
        ? exactReadback(table).map((node) => ({ ...node, valid_until: "2026-09-07T18:59:59-05:00" }))
        : exactReadback(table),
    }],
    ["graph node finite future", {
      args: { ...args, p_nodes: nodes.map((node) => ({ ...node, as_of: "2999-01-01T00:00:00Z" })) },
      readback: (table: string) => table === "hermes_underwriting_nodes"
        ? exactReadback(table).map((node) => ({ ...node, as_of: "2999-01-01T00:00:00Z" }))
        : exactReadback(table),
    }],
    ["forecast model_version negative infinity", {
      args: { ...args, p_forecasts: forecasts.map((forecast) => ({ ...forecast, model_version: "-infinity" })) },
      readback: (table: string) => table === "hermes_forecasts"
        ? exactReadback(table).map((forecast) => ({ ...forecast, model_version: "-infinity" }))
        : exactReadback(table),
    }],
    ["forecast model_version finite future", {
      args: { ...args, p_forecasts: forecasts.map((forecast) => ({ ...forecast, model_version: "2999-01-01T00:00:00Z" })) },
      readback: (table: string) => table === "hermes_forecasts"
        ? exactReadback(table).map((forecast) => ({ ...forecast, model_version: "2999-01-01T00:00:00Z" }))
        : exactReadback(table),
    }],
    ["forecast as_of positive infinity", {
      args,
      readback: (table: string) => table === "hermes_forecasts"
        ? exactReadback(table).map((forecast) => ({ ...forecast, as_of: "infinity" }))
        : exactReadback(table),
    }],
    ["forecast as_of finite future", {
      args,
      readback: (table: string) => table === "hermes_forecasts"
        ? exactReadback(table).map((forecast) => ({ ...forecast, as_of: "2999-01-01T00:00:00Z" }))
        : exactReadback(table),
    }],
  ])("rejects lost-response recovery with %s", async (_label, fixture) => {
    const db = lostResponseDb({ readback: fixture.readback });

    await expect(persistUnderwritingSeedOutput(db, fixture.args)).rejects.toThrow("fetch failed after commit");
    expect(db.patch).not.toHaveBeenCalled();
  });

  it("rejects the exact expected [A,A] versus actual [A,B] node reproduction", async () => {
    const duplicateExpected = { ...args, p_nodes: [nodes[0]!, nodes[0]!] };
    const db = lostResponseDb();

    await expect(persistUnderwritingSeedOutput(db, duplicateExpected)).rejects.toThrow("fetch failed after commit");
  });

  it.each(["nodes", "edges", "forecasts"] as const)(
    "rejects duplicate expected identities and duplicate actual %s rows",
    async (kind) => {
      const duplicateArgs = {
        ...args,
        p_nodes: kind === "nodes" ? [nodes[0]!, nodes[0]!] : nodes,
        p_edges: kind === "nodes" ? [] : kind === "edges" ? [edges[0]!, edges[0]!] : edges,
        p_forecasts: kind === "forecasts" ? [forecasts[0]!, forecasts[0]!] : forecasts,
      };
      const db = lostResponseDb({
        readback: (table) => {
          if (kind === "nodes" && table === "hermes_underwriting_nodes") {
            return [
              { ...exactReadback(table)[0], id: "node-1" },
              { ...exactReadback(table)[0], id: "node-2" },
            ];
          }
          if (kind === "edges" && table === "hermes_underwriting_edges") {
            return [exactReadback(table)[0]!, { ...exactReadback(table)[0], id: "edge-2" }];
          }
          if (kind === "forecasts" && table === "hermes_forecasts") {
            return [exactReadback(table)[0]!, { ...exactReadback(table)[0], id: "forecast-2" }];
          }
          return kind === "nodes" && table === "hermes_underwriting_edges" ? [] : exactReadback(table);
        },
      });

      await expect(persistUnderwritingSeedOutput(db, duplicateArgs)).rejects.toThrow("fetch failed after commit");
    },
  );

  it("does not mark a run failed when readback finds a partial or mismatched payload", async () => {
    const db = fakeRest({
      rpc: vi.fn(async () => { throw new TypeError("fetch failed after commit"); }),
      select: vi.fn(async () => [{
        id: runId,
        status: "running",
        output_ref: {},
        metrics: {},
        started_at: "2026-09-08T00:00:00Z",
        completed_at: null,
      }]),
      selectAll: vi.fn(async (table: string) => table === "hermes_underwriting_nodes" ? exactReadback(table) as never[] : []),
    });

    await expect(persistUnderwritingSeedOutput(db, args)).rejects.toThrow("fetch failed after commit");
    expect(db.patch).not.toHaveBeenCalled();
  });

  it("never marks a run failed when transport ambiguity cannot be read back", async () => {
    const db = fakeRest({
      rpc: vi.fn(async () => { throw new TypeError("fetch failed with bearer abc123"); }),
      select: vi.fn(async () => { throw new TypeError("readback unavailable"); }),
    });

    await expect(persistUnderwritingSeedOutput(db, args)).rejects.toThrow("fetch failed with bearer abc123");
    expect(db.patch).not.toHaveBeenCalled();
  });

  it("stores only a generic seed error after readback proves the transaction did not complete", async () => {
    const patch = vi.fn(async () => []);
    const db = fakeRest({
      rpc: vi.fn(async () => { throw new Error("PostgREST detail containing sensitive provenance"); }),
      select: vi.fn(async () => [{
        id: runId,
        status: "running",
        output_ref: {},
        metrics: {},
        prompt_id: "company-underwrite",
        prompt_version: "1.0.0",
        started_at: "2026-09-08T00:00:00Z",
        completed_at: null,
        created_at: "2026-09-08T00:00:00Z",
        updated_at: "2026-09-08T00:00:00Z",
      }]),
      selectAll: vi.fn(async () => []),
      patch,
    });

    await expect(persistUnderwritingSeedOutput(db, args)).rejects.toThrow("sensitive provenance");
    expect(patch).toHaveBeenCalledWith("hermes_agent_runs", `id=eq.${runId}`, expect.objectContaining({
      status: "failed",
      error: "Underwriting seed failed before atomic completion.",
    }));
    expect(JSON.stringify(patch.mock.calls)).not.toContain("sensitive provenance");
  });
});
