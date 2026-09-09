import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompanyUnderwritingGraph } from "@/components/companies/company-underwriting-graph";
import { getCompanyModel } from "@/lib/company-models";
import type { CompanyUnderwriting } from "@/lib/db/underwriting";
import type { ForecastEvaluationRow, UnderwritingEdgeRow, UnderwritingNodeRow } from "@/lib/db/types";

function node(id: string, node_type: string, as_of: string): UnderwritingNodeRow {
  return {
    id,
    stable_key: id,
    node_type,
    ticker: "MU",
    title: id,
    body: null,
    status: "active",
    confidence: null,
    as_of,
    valid_until: null,
    supersedes_id: null,
    agent_run_id: null,
    payload: {},
    created_at: as_of,
    updated_at: as_of,
  };
}

function edge(id: string, from_node_id: string, to_node_id: string, relationship = "supports"): UnderwritingEdgeRow {
  return {
    id,
    from_node_id,
    to_node_id,
    relationship,
    strength: null,
    note: null,
    agent_run_id: null,
    metadata: {},
    created_at: "2026-09-07T05:00:00.000Z",
  };
}

function forecast(
  model_version: string,
  predicted_value: number,
  scenario: ForecastEvaluationRow["scenario"] = "Base",
): ForecastEvaluationRow {
  return {
    forecast_id: `forecast-${scenario}-${model_version}`,
    stable_key: `forecast-${scenario}-${model_version}`,
    ticker: "MU",
    scenario,
    forecast_type: "annualized_return",
    model_version,
    as_of: model_version,
    horizon_date: "2031-09-07",
    probability: 1,
    predicted_value,
    unit: "ratio",
    benchmark_symbol: "QQQ",
    benchmark_value: 0.1,
    status: "open",
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
}

function renderUnderwriting(underwriting: CompanyUnderwriting) {
  const model = getCompanyModel("MU");
  if (!model) throw new Error("MU fixture model is required");
  return renderToStaticMarkup(CompanyUnderwritingGraph({ model, underwriting }));
}

describe("CompanyUnderwritingGraph evidence truthfulness", () => {
  it("renders only allowed evidence links from the chronologically latest graph version", () => {
    const older = "2026-09-07T04:30:00.000Z";
    const newerWithLexicallyEarlierOffset = "2026-09-07T00:00:00-05:00";
    const nodes = [
      node("old-claim", "assumption", older),
      node("old-evidence-1", "evidence", older),
      node("old-evidence-2", "evidence", older),
      node("new-claim", "assumption", newerWithLexicallyEarlierOffset),
      node("new-linked", "evidence", newerWithLexicallyEarlierOffset),
      node("new-unlinked", "evidence", newerWithLexicallyEarlierOffset),
    ];
    const edges = [
      edge("old-link-1", "old-evidence-1", "old-claim"),
      edge("old-link-2", "old-evidence-2", "old-claim"),
      edge("new-link", "new-linked", "new-claim"),
    ];

    const markup = renderUnderwriting({ nodes, edges, forecasts: [], runs: [] });

    expect(markup).toContain("1 claim-level evidence link");
    expect(markup).toContain("1 evidence node in this graph version is unlinked and unavailable");
    expect(markup).not.toContain("2 claim-level evidence links");
  });

  it("renders disconnected and unsupported evidence as unavailable", () => {
    const asOf = "2026-09-07T05:00:00.000Z";
    const nodes = [
      node("claim", "assumption", asOf),
      node("linked", "evidence", asOf),
      node("disconnected", "evidence", asOf),
      node("wrong-relation", "evidence", asOf),
    ];
    const edges = [
      edge("allowed", "linked", "claim"),
      edge("unsupported", "wrong-relation", "claim", "mentions"),
    ];

    const markup = renderUnderwriting({ nodes, edges, forecasts: [], runs: [] });

    expect(markup).toContain("1 claim-level evidence link");
    expect(markup).toContain("2 evidence nodes in this graph version are unlinked and unavailable");
  });
});

describe("CompanyUnderwritingGraph persisted-record truthfulness", () => {
  it("shows exact zero counts for an incomplete persisted graph", () => {
    const asOf = "2026-09-07T05:00:00.000Z";
    const markup = renderUnderwriting({
      nodes: [node("persisted-source", "source", asOf)],
      edges: [],
      forecasts: [],
      runs: [],
    });

    expect(markup).toContain("0 explicit assumptions");
    expect(markup).toContain("Falsifiers · 0");
    expect(markup).toContain("Monitoring tests · 0");
    expect(markup).toContain("Persisted forecast cohort unavailable");
    expect(markup).not.toContain("12 explicit assumptions");
    expect(markup).not.toContain("Model scenario preview");
  });

  it("does not substitute a code-model preview for a mismatched forecast version", () => {
    const selectedVersion = "2026-09-07T05:00:00.000Z";
    const mismatchedVersion = "2026-09-06T05:00:00.000Z";
    const markup = renderUnderwriting({
      nodes: [node("persisted-assumption", "assumption", selectedVersion)],
      edges: [],
      forecasts: [forecast(mismatchedVersion, 0.987654)],
      runs: [],
    });

    expect(markup).toContain("Persisted forecast cohort unavailable");
    expect(markup).toContain("No annualized_return / ratio forecasts are stored for this graph version.");
    expect(markup).not.toContain("98.8%");
    expect(markup).not.toContain("Model scenario preview");
  });

  it("labels code-model fallback as a preview only when no persisted graph exists", () => {
    const markup = renderUnderwriting({ nodes: [], edges: [], forecasts: [], runs: [] });

    expect(markup).toContain("Code-model preview");
    expect(markup).toContain("Model scenario preview");
    expect(markup).not.toContain("Persisted forecast cohort unavailable");
  });

  it("renders an invalid persisted-record state instead of either code-model preview for a non-finite node timestamp", () => {
    const markup = renderUnderwriting({
      nodes: [node("invalid-persisted-node", "assumption", "-infinity")],
      edges: [],
      forecasts: [],
      runs: [],
    });

    expect(markup).toContain("Persisted graph record unavailable");
    expect(markup).toContain("invalid as_of");
    expect(markup).not.toContain("Code-model preview");
    expect(markup).not.toContain("Model scenario preview");
  });

  it("renders a future latest persisted graph version as unavailable without either preview fallback", () => {
    const markup = renderUnderwriting({
      nodes: [
        node("historical-persisted-node", "assumption", "2020-01-01T00:00:00.000Z"),
        node("future-persisted-node", "assumption", "9999-01-01T00:00:00.000Z"),
      ],
      edges: [],
      forecasts: [forecast("9999-01-01T00:00:00.000Z", 0.987654)],
      runs: [],
    });

    expect(markup).toContain("Persisted graph record unavailable");
    expect(markup).toContain("future as_of");
    expect(markup).not.toContain("98.8%");
    expect(markup).not.toContain("Code-model preview");
    expect(markup).not.toContain("Model scenario preview");
  });

  it("marks a Base-only persisted forecast cohort incomplete without code-model substitution", () => {
    const asOf = "2026-09-07T05:00:00.000Z";
    const markup = renderUnderwriting({
      nodes: [node("persisted-assumption", "assumption", asOf)],
      edges: [],
      forecasts: [forecast(asOf, 0.14, "Base")],
      runs: [],
    });

    expect(markup).toContain("Persisted forecast cohort incomplete");
    expect(markup).toContain("Missing Bear and Bull scenarios");
    expect(markup).not.toContain("Stored Bear · Base · Bull cohort");
    expect(markup).not.toContain("Model scenario preview");
  });

  it("marks a two-of-three persisted forecast cohort incomplete and names the missing scenario", () => {
    const asOf = "2026-09-07T05:00:00.000Z";
    const markup = renderUnderwriting({
      nodes: [node("persisted-assumption", "assumption", asOf)],
      edges: [],
      forecasts: [forecast(asOf, 0.08, "Bear"), forecast(asOf, 0.14, "Base")],
      runs: [],
    });

    expect(markup).toContain("Persisted forecast cohort incomplete");
    expect(markup).toContain("Missing Bull scenario");
    expect(markup).not.toContain("Stored Bear · Base · Bull cohort");
    expect(markup).not.toContain("Model scenario preview");
  });

  it("keeps the exact complete persisted Bear, Base, and Bull cohort path", () => {
    const asOf = "2026-09-07T05:00:00.000Z";
    const markup = renderUnderwriting({
      nodes: [node("persisted-assumption", "assumption", asOf)],
      edges: [],
      forecasts: [
        forecast(asOf, 0.08, "Bear"),
        forecast(asOf, 0.14, "Base"),
        forecast(asOf, 0.2, "Bull"),
      ],
      runs: [],
    });

    expect(markup).toContain("Stored Bear · Base · Bull cohort");
    expect(markup).toContain("3 persisted scenario forecasts");
    expect(markup).not.toContain("Persisted forecast cohort incomplete");
  });
});
