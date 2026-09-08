import { describe, expect, it } from "vitest";
import {
  HERMES_PROJECT_REF,
  HERMES_SUPABASE_URL_DEFAULT,
  assertHermesProjectUrl,
  supabaseProjectRefFromUrl,
} from "./env";

describe("Hermes project-ref guard", () => {
  it("parses the INVESTING-BRAIN-AG host", () => {
    expect(supabaseProjectRefFromUrl(HERMES_SUPABASE_URL_DEFAULT)).toBe(HERMES_PROJECT_REF);
    expect(supabaseProjectRefFromUrl(`${HERMES_SUPABASE_URL_DEFAULT}/`)).toBe(HERMES_PROJECT_REF);
  });

  it("rejects other Supabase projects and malformed URLs", () => {
    expect(supabaseProjectRefFromUrl("https://vnxypnpepwxurhbdtswn.supabase.co")).toBe("vnxypnpepwxurhbdtswn");
    expect(supabaseProjectRefFromUrl("https://dsfyvyubhqjzfwuztgfr.supabase.co")).toBe("dsfyvyubhqjzfwuztgfr");
    expect(supabaseProjectRefFromUrl("https://example.com")).toBeNull();
    expect(supabaseProjectRefFromUrl("not-a-url")).toBeNull();
  });

  it("throws unless the URL is the live Hermes brain", () => {
    expect(assertHermesProjectUrl(HERMES_SUPABASE_URL_DEFAULT)).toBe(HERMES_SUPABASE_URL_DEFAULT);
    expect(() => assertHermesProjectUrl("https://vnxypnpepwxurhbdtswn.supabase.co")).toThrow(/refuses Supabase project ref/);
    expect(() => assertHermesProjectUrl("https://example.com")).toThrow(/unknown/);
  });
});
