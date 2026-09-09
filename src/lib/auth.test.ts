import { afterEach, describe, expect, it, vi } from "vitest";
import { expectedCookieValue, gateEnabled, verifyCookie } from "@/lib/auth";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("access session configuration", () => {
  it("does not enable the gate without both a password and a separate session secret", () => {
    expect(gateEnabled({ password: "test-password" })).toBe(false);
    expect(gateEnabled({ secret: "test-session-secret" })).toBe(false);
    expect(gateEnabled({ password: "test-password", secret: "test-session-secret" })).toBe(true);
  });

  it("never derives a signing secret from the access password", async () => {
    await expect(expectedCookieValue({ password: "test-password" })).rejects.toThrow(/session secret/i);
  });

  it("requires the session signing secret to differ from the access password", async () => {
    const reused = { password: "reused-value", secret: "reused-value" };

    expect(gateEnabled(reused)).toBe(false);
    await expect(expectedCookieValue(reused)).rejects.toThrow(/different|separate/i);
  });

  it("fails closed when the access gate is not completely configured", async () => {
    await expect(verifyCookie(undefined, {})).resolves.toBe(false);
    await expect(verifyCookie(undefined, { password: "test-password" })).resolves.toBe(false);
  });
});
