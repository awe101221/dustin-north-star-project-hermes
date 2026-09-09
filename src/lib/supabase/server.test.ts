import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, cookiesMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(() => ({ kind: "supabase-client" })),
  cookiesMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));

import { expectedCookieValue } from "@/lib/auth";
import { HERMES_PROJECT_REF } from "@/lib/env";
import { adminClient, underwritingReadClient } from "@/lib/supabase/server";

const CANONICAL_URL = `https://${HERMES_PROJECT_REF}.supabase.co`;

function configurePrivilegedEnv() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", CANONICAL_URL);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
}

beforeEach(() => {
  createClientMock.mockClear();
  cookiesMock.mockReset();
  cookiesMock.mockResolvedValue({ get: vi.fn(() => undefined) });
  configurePrivilegedEnv();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("privileged Supabase clients", () => {
  it("refuses a service-role underwriting read when the access gate is absent", async () => {
    vi.stubEnv("HERMES_ACCESS_PASSWORD", "");
    vi.stubEnv("HERMES_SESSION_SECRET", "");

    await expect(Promise.resolve(underwritingReadClient())).rejects.toThrow(/access.*password|session/i);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("refuses a service-role underwriting read when the separate session secret is absent", async () => {
    vi.stubEnv("HERMES_ACCESS_PASSWORD", "test-password");
    vi.stubEnv("HERMES_SESSION_SECRET", "");

    await expect(Promise.resolve(underwritingReadClient())).rejects.toThrow(/session secret/i);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("refuses an invalid signed session in the privileged read path", async () => {
    vi.stubEnv("HERMES_ACCESS_PASSWORD", "test-password");
    vi.stubEnv("HERMES_SESSION_SECRET", "test-session-secret");
    cookiesMock.mockResolvedValue({ get: vi.fn(() => ({ value: "invalid-session" })) });

    await expect(Promise.resolve(underwritingReadClient())).rejects.toThrow(/unauthorized|session/i);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("builds the privileged read client for a valid signed session", async () => {
    const authEnv = { password: "test-password", secret: "test-session-secret" };
    vi.stubEnv("HERMES_ACCESS_PASSWORD", authEnv.password);
    vi.stubEnv("HERMES_SESSION_SECRET", authEnv.secret);
    const cookie = await expectedCookieValue(authEnv);
    cookiesMock.mockResolvedValue({ get: vi.fn(() => ({ value: cookie })) });

    await expect(Promise.resolve(underwritingReadClient())).resolves.toEqual({ kind: "supabase-client" });
    expect(createClientMock).toHaveBeenCalledWith(CANONICAL_URL, "test-service-role-key", expect.any(Object));
  });

  it("rejects a hostile Supabase hostname before building or dispatching credentials", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${HERMES_PROJECT_REF}.supabase.co.attacker.invalid`);
    vi.stubEnv("HERMES_ACCESS_PASSWORD", "test-password");
    vi.stubEnv("HERMES_SESSION_SECRET", "test-session-secret");
    const cookie = await expectedCookieValue({ password: "test-password", secret: "test-session-secret" });
    cookiesMock.mockResolvedValue({ get: vi.fn(() => ({ value: cookie })) });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(Promise.resolve(underwritingReadClient())).rejects.toThrow(/database target|Supabase URL/i);
    expect(createClientMock).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("rejects a hostile Supabase hostname before building an admin client", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${HERMES_PROJECT_REF}.supabase.co.attacker.invalid`);

    expect(() => adminClient()).toThrow(/database target|Supabase URL/i);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it.each([":443", ":0443", "/.", "/%2e"])(
    "rejects the prohibited lexical Supabase URL form %s before building an admin client",
    (suffix) => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `${CANONICAL_URL}${suffix}`);
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      expect(() => adminClient()).toThrow(/database target|Supabase URL/i);
      expect(createClientMock).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    },
  );

  it.each([
    ["leading", ` ${CANONICAL_URL}`],
    ["trailing", `${CANONICAL_URL} `],
    ["tab padded", `\t${CANONICAL_URL}\t`],
  ])("rejects a %s-whitespace Supabase URL before building or dispatching credentials", (_label, rawUrl) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", rawUrl);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    expect(() => adminClient()).toThrow(/database target|Supabase URL/i);
    expect(createClientMock).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("accepts the existing sole trailing-slash form and canonicalizes it before client construction", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `${CANONICAL_URL}/`);

    expect(adminClient()).toEqual({ kind: "supabase-client" });
    expect(createClientMock).toHaveBeenCalledWith(CANONICAL_URL, "test-service-role-key", expect.any(Object));
  });
});
