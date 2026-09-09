import { beforeEach, describe, expect, it, vi } from "vitest";
import { DbError } from "@/lib/db/query";

const handlerHarness = vi.hoisted(() => ({
  db: {} as unknown,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  adminClient: () => handlerHarness.db,
  WriteNotConfiguredError: class WriteNotConfiguredError extends Error {
    constructor() {
      super("writes unavailable");
    }
  },
}));

import { withAdmin } from "@/lib/server/handlers";

function invoke(handler: (request: never, context: { params: Promise<Record<string, string>> }) => Promise<Response>) {
  return handler(new Request("https://example.test/api/hermes/test") as never, {
    params: Promise.resolve({}),
  });
}

describe("privileged route error handling", () => {
  beforeEach(() => {
    handlerHarness.db = {};
    vi.restoreAllMocks();
  });

  it("sanitizes an unknown exception without leaking credentials or internal details", async () => {
    const sensitiveMessage = "connection failed for postgres://admin:secret-password@internal-db.local/private";
    const error = new Error(sensitiveMessage);
    const diagnostics = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const route = withAdmin(async () => {
      throw error;
    });

    const response = await invoke(route);
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: "Internal server error." });
    expect(JSON.stringify(payload)).not.toContain("secret-password");
    expect(JSON.stringify(payload)).not.toContain("internal-db.local");
    expect(diagnostics).toHaveBeenCalledWith("Unhandled privileged route error", error);
  });

  it("preserves deterministic known database error mapping", async () => {
    const route = withAdmin(async () => {
      throw new DbError("duplicate sensitive row detail", "23505");
    });

    const response = await invoke(route);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Database operation conflicts with existing state.",
      detail: "23505",
    });
  });
});
