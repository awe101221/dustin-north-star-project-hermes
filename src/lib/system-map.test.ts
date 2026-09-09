import { describe, expect, it } from "vitest";
import { SYSTEM_COMPONENTS, SYSTEM_CONNECTIONS, systemSummary } from "@/lib/system-map";

describe("North Star system map", () => {
  it("documents the complete decision loop and its real system boundaries", () => {
    const ids = new Set(SYSTEM_COMPONENTS.map((component) => component.id));
    for (const required of ["telegram", "hermes-runtime", "underwriting-graph", "supabase", "north-star-web", "evaluation-loop"]) {
      expect(ids.has(required), `${required} is absent from the system map`).toBe(true);
    }
    expect(new Set(SYSTEM_COMPONENTS.map((component) => component.layer))).toEqual(
      new Set(["interface", "orchestration", "agent", "tool", "structure", "database", "delivery"]),
    );
  });

  it("only connects documented components and labels operational reality", () => {
    const ids = new Set(SYSTEM_COMPONENTS.map((component) => component.id));
    for (const connection of SYSTEM_CONNECTIONS) {
      expect(ids.has(connection.from), `${connection.from} is not documented`).toBe(true);
      expect(ids.has(connection.to), `${connection.to} is not documented`).toBe(true);
      expect(connection.label.trim().length).toBeGreaterThan(0);
    }
    for (const component of SYSTEM_COMPONENTS) {
      expect(["live", "available", "planned"]).toContain(component.status);
      expect(component.reality.trim().length).toBeGreaterThan(0);
    }
  });

  it("summarizes live, available, and planned components without hiding roadmap items", () => {
    const summary = systemSummary(SYSTEM_COMPONENTS);
    expect(summary.total).toBe(SYSTEM_COMPONENTS.length);
    expect(summary.live).toBeGreaterThan(0);
    expect(summary.available).toBeGreaterThan(0);
    expect(summary.planned).toBeGreaterThan(0);
    expect(summary.live + summary.available + summary.planned).toBe(summary.total);
  });
});
