import { beforeEach, describe, expect, it, vi } from "vitest";

const routeHarness = vi.hoisted(() => ({
  db: null as unknown,
}));

vi.mock("@/lib/server/handlers", () => ({
  fail: (message: string, status = 400, detail?: unknown) => Response.json({ error: message, detail }, { status }),
  json: (data: unknown, init?: ResponseInit) => Response.json(data, init),
  parseBody: vi.fn(),
  parseQuery: (searchParams: URLSearchParams, schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown; error?: { issues: unknown } } }) => {
    const parsed = schema.safeParse(Object.fromEntries(searchParams.entries()));
    return parsed.success
      ? { ok: true, data: parsed.data }
      : { ok: false, res: Response.json({ error: "Invalid query parameters.", detail: parsed.error?.issues }, { status: 400 }) };
  },
  withAgent: (handler: (args: { request: { nextUrl: URL }; db: unknown; params: Record<string, string> }) => Promise<Response>) =>
    async (request: { nextUrl: URL }) => handler({ request, db: routeHarness.db, params: {} }),
}));

import { GET } from "@/app/api/agent/forecasts/route";

function cappedForecastDb(rowCount: number) {
  const rows = Array.from({ length: rowCount }, (_, index) => ({ forecast_id: `forecast-${index}` }));
  const query = {
    select: () => query,
    order: () => query,
    eq: () => query,
    range: (from: number, to: number) => Promise.resolve({
      data: rows.slice(from, Math.min(to + 1, from + 1_000)),
      error: null,
    }),
  };
  return { from: () => query };
}

describe("GET /api/agent/forecasts", () => {
  beforeEach(() => {
    routeHarness.db = cappedForecastDb(1_001);
  });

  it("keeps the configured page size below the 1,000-row PostgREST response cap", async () => {
    const response = await GET(
      { nextUrl: new URL("https://example.test/api/agent/forecasts?limit=1000") } as never,
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(400);
  });

  it("uses the provider-capped sentinel row to report continuation truthfully", async () => {
    const response = await GET(
      { nextUrl: new URL("https://example.test/api/agent/forecasts?limit=999") } as never,
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.forecasts).toHaveLength(999);
    expect(body.pagination).toEqual({
      limit: 999,
      offset: 0,
      returned: 999,
      has_more: true,
      next_offset: 999,
    });
  });
});
