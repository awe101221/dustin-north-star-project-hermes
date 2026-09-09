import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompanyUnderwritingGraph } from "@/components/companies/company-underwriting-graph";
import { CURRENT_10_PLUS_10_TICKERS, getCompanyModel } from "@/lib/company-models";
import type { CompanyUnderwriting } from "@/lib/db/underwriting";
import {
  agentRunIdsForUnderwriting,
  assertUniqueForecastRegistry,
  buildUnderwritingGraph,
  forecastRegistryKey,
  groupForecastEvaluations,
  linkedEvidenceForGraphVersion,
  resolveGraphProvenance,
  sameSemanticTimestamp,
  selectHeadlineForecastEvaluation,
  summarizeForecastCohort,
  summarizeForecastEvaluation,
  type ForecastEvaluationInput,
} from "@/lib/underwriting";

describe("underwriting graph", () => {
  const models = CURRENT_10_PLUS_10_TICKERS.map((ticker) => getCompanyModel(ticker)).filter((model) => model !== null);
  const graph = buildUnderwritingGraph(models);

  it("covers every current 10 + 10 company with three scenario forecasts", () => {
    const companies = graph.nodes.filter((node) => node.kind === "company");
    const forecasts = graph.nodes.filter((node) => node.kind === "forecast");

    expect(companies.map((node) => node.ticker)).toEqual([...CURRENT_10_PLUS_10_TICKERS]);
    expect(forecasts).toHaveLength(CURRENT_10_PLUS_10_TICKERS.length * 3);
    for (const ticker of CURRENT_10_PLUS_10_TICKERS) {
      expect(forecasts.filter((node) => node.ticker === ticker)).toHaveLength(3);
    }
  });

  it("makes every forecast depend on explicit growth, margin, multiple, and return assumptions", () => {
    const forecasts = graph.nodes.filter((node) => node.kind === "forecast");
    const assumptions = graph.nodes.filter((node) => node.kind === "assumption");

    expect(assumptions).toHaveLength(CURRENT_10_PLUS_10_TICKERS.length * 3 * 4);
    for (const forecast of forecasts) {
      const dependencies = graph.edges.filter((edge) => edge.fromKey === forecast.key && edge.relationship === "depends_on");
      expect(dependencies).toHaveLength(4);
      expect(dependencies.every((edge) => assumptions.some((node) => node.key === edge.toKey))).toBe(true);
    }
  });

  it("connects model risks and monitoring tests to each company", () => {
    const falsifiers = graph.nodes.filter((node) => node.kind === "falsifier");
    const monitors = graph.nodes.filter((node) => node.kind === "monitor");

    expect(falsifiers).toHaveLength(CURRENT_10_PLUS_10_TICKERS.length * 3);
    expect(monitors).toHaveLength(CURRENT_10_PLUS_10_TICKERS.length * 3);
    expect(graph.edges.filter((edge) => edge.relationship === "could_invalidate")).toHaveLength(falsifiers.length);
    expect(graph.edges.filter((edge) => edge.relationship === "tests")).toHaveLength(monitors.length);
  });
});

describe("forecast evaluation", () => {
  it("matches equivalent PostgREST and ISO timestamp representations", () => {
    expect(sameSemanticTimestamp("2026-09-07T00:00:00+00:00", "2026-09-07T00:00:00.000Z")).toBe(true);
    expect(sameSemanticTimestamp("2026-09-07T00:00:00-05:00", "2026-09-07T05:00:00.000Z")).toBe(true);
    expect(sameSemanticTimestamp("2026-09-07T00:00:00+00:00", "2026-09-08T00:00:00.000Z")).toBe(false);
    expect(sameSemanticTimestamp("not-a-date", "not-a-date")).toBe(false);
  });

  it("uses ex-ante and realized benchmarks for their distinct directional roles", () => {
    const rows: ForecastEvaluationInput[] = [
      { forecastType: "annualized_return", unit: "ratio", predictedValue: 0.2, actualValue: 0.15, forecastBenchmarkValue: 0.1, realizedBenchmarkValue: 0.1, probability: 0.7, outcomeOccurred: true },
      { forecastType: "annualized_return", unit: "ratio", predictedValue: 0.11, actualValue: 0.1, forecastBenchmarkValue: 0.12, realizedBenchmarkValue: 0.09, probability: 0.25, outcomeOccurred: false },
    ];

    expect(summarizeForecastEvaluation(rows)).toEqual({
      graded: 2,
      meanAbsoluteError: 0.03,
      meanAlpha: 0.03,
      directionalHitRate: 0.5,
      brierScore: 0.07625,
    });
  });

  it("keeps absolute-error outcomes when realized QQQ is unavailable", () => {
    const rows: ForecastEvaluationInput[] = [
      { forecastType: "annualized_return", unit: "ratio", predictedValue: 0.2, actualValue: 0.1, forecastBenchmarkValue: 0.12, realizedBenchmarkValue: null },
      { forecastType: "annualized_return", unit: "ratio", predictedValue: 0.1, actualValue: 0.08, forecastBenchmarkValue: 0.12, realizedBenchmarkValue: 0.09 },
    ];

    expect(summarizeForecastEvaluation(rows)).toMatchObject({
      graded: 2,
      meanAbsoluteError: 0.06,
      meanAlpha: -0.01,
      directionalHitRate: 1,
    });
  });

  it("summarizes forecast types and units in separate cohorts", () => {
    const rows: ForecastEvaluationInput[] = [
      { forecastType: "annualized_return", unit: "ratio", predictedValue: 0.2, actualValue: 0.1 },
      { forecastType: "target_price", unit: "USD", predictedValue: 200, actualValue: 180 },
      { forecastType: "target_price", unit: "EUR", predictedValue: 150, actualValue: 140 },
    ];

    expect(groupForecastEvaluations(rows).map((group) => [group.forecastType, group.unit, group.summary.meanAbsoluteError])).toEqual([
      ["annualized_return", "ratio", 0.1],
      ["target_price", "EUR", 10],
      ["target_price", "USD", 20],
    ]);
  });

  it("leaves the percent headline unavailable when only target-price outcomes are graded", () => {
    const groups = groupForecastEvaluations([
      { forecastType: "target_price", unit: "USD", predictedValue: 200, actualValue: 180 },
    ]);

    expect(selectHeadlineForecastEvaluation(groups)).toEqual({
      available: false,
      summary: {
        graded: 0,
        meanAbsoluteError: null,
        meanAlpha: null,
        directionalHitRate: null,
        brierScore: null,
      },
    });
  });

  it("reports mixed cohort statuses and the full horizon range", () => {
    expect(summarizeForecastCohort([
      { status: "open", horizon_date: "2031-09-07" },
      { status: "graded", horizon_date: "2031-12-31" },
      { status: "open", horizon_date: "2031-10-15" },
    ])).toEqual({
      status: "mixed",
      horizonStart: "2031-09-07",
      horizonEnd: "2031-12-31",
      mixedHorizon: true,
    });
  });

  it("renders mixed company outcomes and the full cohort horizon range", () => {
    const model = getCompanyModel("MU");
    if (!model) throw new Error("MU model fixture is unavailable");
    const horizons = ["2031-09-07", "2031-10-15", "2031-12-31"];
    const underwriting = {
      nodes: [{
        id: "company-node",
        stable_key: "MU:company",
        node_type: "company",
        ticker: "MU",
        title: "MU",
        body: null,
        status: "active",
        confidence: null,
        as_of: model.asOf,
        valid_until: null,
        supersedes_id: null,
        agent_run_id: null,
        payload: {},
        created_at: model.asOf,
        updated_at: model.asOf,
      }],
      edges: [],
      runs: [],
      forecasts: model.scenarios.map((scenario, index) => ({
        forecast_id: `forecast-${scenario.name}`,
        stable_key: `MU:forecast:${scenario.name.toLowerCase()}`,
        ticker: "MU",
        scenario: scenario.name,
        forecast_type: "annualized_return",
        model_version: model.asOf,
        as_of: model.asOf,
        horizon_date: horizons[index]!,
        probability: scenario.probability,
        predicted_value: scenario.annualizedReturn,
        unit: "ratio",
        benchmark_symbol: "QQQ",
        benchmark_value: model.qqqHurdle,
        status: index === 0 ? "graded" : "open",
        outcome_id: index === 0 ? "outcome-bear" : null,
        observed_at: null,
        actual_value: null,
        qqq_value: null,
        outcome_occurred: null,
        absolute_error: null,
        alpha: null,
        directional_hit: null,
        brier_component: null,
        agent_run_id: null,
      })),
    } satisfies CompanyUnderwriting;

    const html = renderToStaticMarkup(createElement(CompanyUnderwritingGraph, { model, underwriting }));

    expect(html).toContain("Mixed outcome status");
    expect(html).toContain("5-year horizon · 2031-09-07 – 2031-12-31");
  });

  it("renders only annualized-return ratio forecasts as predicted IRR", () => {
    const model = getCompanyModel("MU");
    if (!model) throw new Error("MU model fixture is unavailable");
    const baseForecast = {
      ticker: "MU",
      scenario: "Base" as const,
      model_version: model.asOf,
      as_of: model.asOf,
      horizon_date: "2031-09-07",
      probability: 0.5,
      benchmark_symbol: "QQQ",
      benchmark_value: 0.1,
      status: "open" as const,
      outcome_id: null,
      observed_at: null,
      actual_value: null,
      qqq_value: null,
      outcome_occurred: null,
      absolute_error: null,
      alpha: null,
      directional_hit: null,
      brier_component: null,
      agent_run_id: null,
    };
    const underwriting = {
      nodes: [{
        id: "company-node",
        stable_key: "MU:company",
        node_type: "company",
        ticker: "MU",
        title: "MU",
        body: null,
        status: "active",
        confidence: null,
        as_of: model.asOf,
        valid_until: null,
        supersedes_id: null,
        agent_run_id: null,
        payload: {},
        created_at: model.asOf,
        updated_at: model.asOf,
      }],
      edges: [],
      runs: [],
      forecasts: [
        { ...baseForecast, forecast_id: "irr", stable_key: "MU:irr", forecast_type: "annualized_return" as const, unit: "ratio", predicted_value: 0.123 },
        { ...baseForecast, forecast_id: "irr-bear", stable_key: "MU:irr:bear", scenario: "Bear" as const, forecast_type: "annualized_return" as const, unit: "ratio", predicted_value: 0.08 },
        { ...baseForecast, forecast_id: "irr-bull", stable_key: "MU:irr:bull", scenario: "Bull" as const, forecast_type: "annualized_return" as const, unit: "ratio", predicted_value: 0.2 },
        { ...baseForecast, forecast_id: "price", stable_key: "MU:price", forecast_type: "target_price" as const, unit: "USD", predicted_value: 987.65 },
        { ...baseForecast, forecast_id: "binary", stable_key: "MU:binary", forecast_type: "binary" as const, unit: "boolean", predicted_value: 1 },
      ],
    } satisfies CompanyUnderwriting;

    const html = renderToStaticMarkup(createElement(CompanyUnderwritingGraph, { model, underwriting }));

    expect(html).toContain("12.3%");
    expect(html).not.toContain("98,765.0%");
    expect(html).not.toContain(">100.0%<");
    expect(html.match(/<tr class="border-t border-border">/g)).toHaveLength(3);
  });

  it("keys logical forecasts by scenario, type, unit, and version regardless of mutable status", () => {
    const base = { ticker: "MU", scenario: "Base", forecast_type: "annualized_return", unit: "ratio", model_version: "v1", status: "open" };
    const variants = [
      base,
      { ...base, scenario: "Bull" },
      { ...base, forecast_type: "margin" },
      { ...base, unit: "percent" },
      { ...base, model_version: "v2" },
      { ...base, status: "graded" },
    ];

    expect(new Set(variants.map(forecastRegistryKey))).toHaveLength(5);
    expect(forecastRegistryKey(base)).toBe(forecastRegistryKey({ ...base, status: "graded" }));
    expect(() => assertUniqueForecastRegistry([base, { ...base, status: "graded" }])).toThrow(/Duplicate logical forecast/);
  });

  it("resolves company provenance from linked node and forecast run ids", () => {
    expect(agentRunIdsForUnderwriting(
      [{ agent_run_id: "run-from-node" }, { agent_run_id: null }],
      [{ agent_run_id: "run-from-forecast" }, { agent_run_id: "run-from-node" }],
    )).toEqual(["run-from-node", "run-from-forecast"]);
  });

  it("selects provenance linked to the latest graph nodes instead of a later forecast-only run", () => {
    const linked = { id: "graph-run", agent_name: "graph-agent" };
    const laterForecastOnly = { id: "forecast-only-run", agent_name: "backfill-agent" };

    expect(resolveGraphProvenance(
      [{ agent_run_id: linked.id }, { agent_run_id: linked.id }],
      [laterForecastOnly, linked],
    )).toEqual({ state: "available", run: linked });
  });

  it("reports ambiguous or unavailable graph provenance explicitly", () => {
    const runs = [{ id: "run-a" }, { id: "run-b" }];
    expect(resolveGraphProvenance([{ agent_run_id: "run-a" }, { agent_run_id: "run-b" }], runs))
      .toEqual({ state: "ambiguous", run: null });
    expect(resolveGraphProvenance([{ agent_run_id: null }], runs))
      .toEqual({ state: "unavailable", run: null });
    expect(resolveGraphProvenance([{ agent_run_id: "missing-run" }], runs))
      .toEqual({ state: "unavailable", run: null });
  });

  it("counts only evidence linked to selected-version graph nodes by evidence relationships", () => {
    const nodes = [
      { id: "claim-current", node_type: "assumption", as_of: "2026-09-08T00:00:00Z" },
      { id: "evidence-linked", node_type: "evidence", as_of: "2026-09-08T00:00:00+00:00" },
      { id: "evidence-unlinked", node_type: "evidence", as_of: "2026-09-08T00:00:00Z" },
      { id: "claim-prior", node_type: "assumption", as_of: "2026-09-07T00:00:00Z" },
      { id: "evidence-prior", node_type: "evidence", as_of: "2026-09-07T00:00:00Z" },
    ];
    const edges = [
      { from_node_id: "evidence-linked", to_node_id: "claim-current", relationship: "supports" },
      { from_node_id: "evidence-unlinked", to_node_id: "claim-current", relationship: "produced_by" },
      { from_node_id: "evidence-unlinked", to_node_id: "claim-prior", relationship: "refutes" },
      { from_node_id: "evidence-prior", to_node_id: "claim-prior", relationship: "confirms" },
    ];

    expect(linkedEvidenceForGraphVersion(nodes, edges, "2026-09-08T00:00:00.000Z")).toEqual({
      linked: [nodes[1]],
      unlinked: [nodes[2]],
    });
  });

  it("renders disconnected evidence as unlinked and unavailable for the selected graph version", () => {
    const model = getCompanyModel("MU");
    if (!model) throw new Error("MU model fixture is unavailable");
    const current = model.asOf;
    const prior = "2026-01-01T00:00:00.000Z";
    const baseNode = {
      ticker: "MU",
      title: "fixture",
      body: null,
      status: "active" as const,
      confidence: null,
      valid_until: null,
      supersedes_id: null,
      agent_run_id: null,
      payload: {},
      created_at: current,
      updated_at: current,
    };
    const underwriting = {
      nodes: [
        { ...baseNode, id: "claim-current", stable_key: "MU:claim", node_type: "assumption" as const, as_of: current },
        { ...baseNode, id: "evidence-linked", stable_key: "MU:evidence:linked", node_type: "evidence" as const, as_of: current },
        { ...baseNode, id: "evidence-unlinked", stable_key: "MU:evidence:unlinked", node_type: "evidence" as const, as_of: current },
        { ...baseNode, id: "claim-prior", stable_key: "MU:claim:prior", node_type: "assumption" as const, as_of: prior },
        { ...baseNode, id: "evidence-prior", stable_key: "MU:evidence:prior", node_type: "evidence" as const, as_of: prior },
      ],
      edges: [
        { id: "edge-linked", from_node_id: "evidence-linked", to_node_id: "claim-current", relationship: "supports" as const, strength: null, note: null, agent_run_id: null, metadata: {}, created_at: current },
        { id: "edge-wrong-kind", from_node_id: "evidence-unlinked", to_node_id: "claim-current", relationship: "produced_by" as const, strength: null, note: null, agent_run_id: null, metadata: {}, created_at: current },
        { id: "edge-cross-version", from_node_id: "evidence-unlinked", to_node_id: "claim-prior", relationship: "refutes" as const, strength: null, note: null, agent_run_id: null, metadata: {}, created_at: current },
        { id: "edge-prior", from_node_id: "evidence-prior", to_node_id: "claim-prior", relationship: "confirms" as const, strength: null, note: null, agent_run_id: null, metadata: {}, created_at: prior },
      ],
      runs: [],
      forecasts: [],
    } satisfies CompanyUnderwriting;

    const html = renderToStaticMarkup(createElement(CompanyUnderwritingGraph, { model, underwriting }));

    expect(html).toContain("1 claim-level evidence link");
    expect(html).toContain("1 evidence node in this graph version is unlinked and unavailable");
    expect(html).not.toContain("3 claim-level evidence links");
  });

  it("returns null metrics when no forecasts have outcomes", () => {
    expect(summarizeForecastEvaluation([])).toEqual({
      graded: 0,
      meanAbsoluteError: null,
      meanAlpha: null,
      directionalHitRate: null,
      brierScore: null,
    });
  });
});
