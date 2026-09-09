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
  withAgent: (handler: (args: { request: { json: () => Promise<unknown> }; db: unknown; params: Record<string, string> }) => Promise<Response>) =>
    async (request: { json: () => Promise<unknown> }, context: { params: Promise<Record<string, string>> }) =>
      handler({ request, db: routeHarness.db, params: await context.params }),
}));

import { PATCH } from "@/app/api/agent/runs/[id]/route";

const runId = "0fdb5d8d-635d-4589-a7d7-a2af4ef7a7c6";

function request(body: unknown) {
  return { json: async () => body } as never;
}

function runDb(
  result: { data: unknown[] | null; error: { message: string; code: string } | null },
  readback: Record<string, unknown> | null = null,
) {
  const from = vi.fn();
  const update = vi.fn();
  const currentExists = readback !== null || result.error !== null || Boolean(result.data?.length);
  const resultRow = Array.isArray(result.data) && result.data[0] && typeof result.data[0] === "object"
    ? result.data[0] as Record<string, unknown>
    : {};
  const currentRow = currentExists ? {
    started_at: "2000-01-01T00:00:00.000Z",
    status: "running",
    completed_at: null,
    error: null,
    output_ref: {},
    metrics: {},
    metadata: {},
    ...resultRow,
    ...(readback ?? {}),
  } : null;
  let selected = "*";
  const query = {
    update: (value: unknown) => {
      update(value);
      return query;
    },
    eq: () => query,
    select: (columns = "*") => {
      selected = columns;
      return query;
    },
    maybeSingle: async () => ({ data: selected === "*" ? currentRow : null, error: null }),
    limit: async () => result,
  };
  from.mockReturnValue(query);
  return { db: { from }, from, update };
}

function runDbWithPersistedStart(startedAt: string) {
  const update = vi.fn();
  let updating = false;
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: { started_at: startedAt }, error: null }),
    update: (value: unknown) => {
      updating = true;
      update(value);
      return query;
    },
    limit: async () => updating
      ? { data: [{ id: runId, status: "succeeded" }], error: null }
      : { data: [], error: null },
  };
  return { db: { from: () => query }, update };
}

async function patchRun(body: unknown) {
  return PATCH(request(body), { params: Promise.resolve({ id: runId }) });
}

describe("PATCH /api/agent/runs/[id]", () => {
  beforeEach(() => {
    routeHarness.db = runDb({ data: [{ id: runId, status: "running" }], error: null }).db;
  });

  it("rejects an empty patch before database access", async () => {
    const harness = runDb({ data: [{ id: runId }], error: null });
    routeHarness.db = harness.db;

    const response = await patchRun({});

    expect(response.status).toBe(422);
    expect(harness.from).not.toHaveBeenCalled();
  });

  it("rejects invalid terminal completion pairing before database access", async () => {
    const harness = runDb({ data: [{ id: runId }], error: null });
    routeHarness.db = harness.db;

    const response = await patchRun({ status: "succeeded" });

    expect(response.status).toBe(422);
    expect(harness.from).not.toHaveBeenCalled();
  });

  it("returns 404 when the target run does not exist", async () => {
    routeHarness.db = runDb({ data: [], error: null }).db;

    const response = await patchRun({ output_ref: { note: "finished" } });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "Agent run not found." });
  });

  it("returns a persisted terminal run for an exact replay suppressed by the database trigger", async () => {
    const persisted = {
      id: runId,
      status: "succeeded",
      started_at: "2000-01-01T00:00:00.000Z",
      completed_at: "2026-09-07T12:00:00.000Z",
      error: null,
      output_ref: { nested: { complete: true }, note: "finished" },
      metrics: { forecasts: 3, nodes: 4 },
      metadata: { attempt: 1 },
      updated_at: "2026-09-07T12:00:00.000Z",
    };
    routeHarness.db = runDb({ data: [], error: null }, persisted).db;

    const response = await patchRun({
      status: "succeeded",
      completed_at: "2026-09-07T07:00:00.000-05:00",
      error: null,
      output_ref: { note: "finished", nested: { complete: true } },
      metrics: { nodes: 4, forecasts: 3 },
      metadata: { attempt: 1 },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ run: persisted });
  });

  it("returns a lifecycle conflict when empty update readback differs from the requested terminal payload", async () => {
    routeHarness.db = runDb({ data: [], error: null }, {
      id: runId,
      status: "succeeded",
      completed_at: "2026-09-07T12:00:00.000Z",
      error: null,
      output_ref: { note: "persisted result" },
      metrics: {},
      metadata: {},
    }).db;

    const response = await patchRun({
      status: "succeeded",
      completed_at: "2026-09-07T12:00:00.000Z",
      output_ref: { note: "different result" },
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "Agent run lifecycle conflict." });
  });

  it.each([
    ["55000", 409, "Agent run lifecycle conflict."],
    ["23514", 422, "Invalid agent run lifecycle transition."],
  ])("maps database lifecycle error %s to %i", async (code, status, message) => {
    routeHarness.db = runDb({ data: null, error: { message: "database lifecycle rejection", code } }).db;

    const response = await patchRun({ status: "cancelled", completed_at: "2026-09-07T12:00:00.000Z" });

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: message, detail: code });
  });

  it("updates a valid terminal patch", async () => {
    const harness = runDb({ data: [{ id: runId, status: "succeeded" }], error: null });
    routeHarness.db = harness.db;

    const response = await patchRun({ status: "succeeded", completed_at: "2026-09-07T12:00:00.000Z" });

    expect(response.status).toBe(200);
    expect(harness.update).toHaveBeenCalledWith({ status: "succeeded", completed_at: "2026-09-07T12:00:00.000Z" });
  });

  it("rejects terminal completion before the persisted start without updating", async () => {
    const harness = runDbWithPersistedStart("2026-09-07T13:00:00.000Z");
    routeHarness.db = harness.db;

    const response = await patchRun({ status: "succeeded", completed_at: "2026-09-07T12:00:00.000Z" });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: "Validation failed." });
    expect(harness.update).not.toHaveBeenCalled();
  });
});