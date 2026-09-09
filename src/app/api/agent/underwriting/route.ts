import { json, parseBody, withAgent } from "@/lib/server/handlers";
import { underwritingGraphBatchCreate } from "@/lib/server/schemas";
import { unwrap } from "@/lib/db/query";
import { domainDbErrorResponse } from "@/lib/server/domain-errors";

export const dynamic = "force-dynamic";

export const POST = withAgent(async ({ request, db }) => {
  const body = await parseBody(request, underwritingGraphBatchCreate);
  if (!body.ok) return body.res;

  const nodeRows = body.data.nodes.map(({ stable_key, node_type, ticker, title, body: nodeBody, status, confidence, as_of, valid_until, prompt_id, prompt_version, payload }) => ({
    stable_key, node_type, ticker: ticker ?? null, title, body: nodeBody ?? null, status, confidence: confidence ?? null,
    as_of, valid_until: valid_until ?? null, prompt_id: prompt_id ?? null, prompt_version: prompt_version ?? null, payload,
  }));
  const edgeRows = body.data.edges.map(({ from_key, to_key, relationship, strength, note, metadata }) => ({
    from_key,
    to_key,
    relationship,
    strength: strength ?? null,
    note: note ?? null,
    metadata,
  }));
  try {
    const saved = unwrap(await db.rpc("hermes_replace_underwriting_graph", {
      p_agent_run_id: body.data.agent_run_id,
      p_nodes: nodeRows,
      p_edges: edgeRows,
      // null is the graph-only endpoint contract. Forecasts registered through
      // /api/agent/forecasts remain append-closed but are outside graph replay.
      p_forecasts: null,
    }), "underwriting graph replacement") as { nodes: number; edges: number; forecasts_inserted: number };
    return json(saved, { status: 201 });
  } catch (error) {
    const response = domainDbErrorResponse(error, "Underwriting graph");
    if (response) return response;
    throw error;
  }
});
