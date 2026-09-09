import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ACCESS_COOKIE, expectedCookieValue } from "@/lib/auth";
import { proxy } from "@/proxy";

function request(path: string, cookie?: string) {
  return new NextRequest(`https://hermes.test${path}`, {
    headers: cookie ? { cookie: `${ACCESS_COOKIE}=${cookie}` } : undefined,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("request proxy access gate", () => {
  it("fails closed when a service-role deployment has no access password or session secret", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
    vi.stubEnv("HERMES_ACCESS_PASSWORD", "");
    vi.stubEnv("HERMES_SESSION_SECRET", "");

    const response = await proxy(request("/companies/MU"));

    expect(response.headers.get("location")).toBe("https://hermes.test/login?next=%2Fcompanies%2FMU");
    expect(response.headers.get("x-middleware-next")).not.toBe("1");
  });

  it("allows a valid independently signed session", async () => {
    const env = { password: "test-password", secret: "test-session-secret" };
    vi.stubEnv("HERMES_ACCESS_PASSWORD", env.password);
    vi.stubEnv("HERMES_SESSION_SECRET", env.secret);
    const cookie = await expectedCookieValue(env);

    const response = await proxy(request("/companies/MU", cookie));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("leaves the bearer-token agent API outside the cookie gate", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
    vi.stubEnv("HERMES_ACCESS_PASSWORD", "");
    vi.stubEnv("HERMES_SESSION_SECRET", "");

    const response = await proxy(request("/api/agent/tasks"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
