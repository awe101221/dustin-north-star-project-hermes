import { afterEach, describe, expect, it, vi } from "vitest";
import { HERMES_PROJECT_REF } from "./env";
import { hermesClient } from "./rest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("script privileged destination guard", () => {
  it("does not dispatch the service-role credential to a hostname containing the project ref", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${HERMES_PROJECT_REF}.supabase.co.attacker.invalid`);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network should not be reached"));

    expect(() => hermesClient()).toThrow(/database target|Supabase URL/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([":443", ":0443", "/.", "/%2e"])(
    "rejects the prohibited lexical Supabase URL form %s before script credential dispatch",
    (suffix) => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${HERMES_PROJECT_REF}.supabase.co${suffix}`);
      vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network should not be reached"));

      expect(() => hermesClient()).toThrow(/database target|Supabase URL/i);
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it.each([" ", "\t"])(
    "rejects leading and trailing %j around the canonical script destination before credential dispatch",
    (padding) => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `${padding}https://${HERMES_PROJECT_REF}.supabase.co${padding}`);
      vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network should not be reached"));

      expect(() => hermesClient()).toThrow(/database target|Supabase URL/i);
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );
});
