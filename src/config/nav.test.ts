import { describe, expect, it } from "vitest";
import { NAV, navFor } from "./nav";

describe("primary navigation", () => {
  it("uses one consolidated 10 + 10 surface instead of separate Best Ideas and Top 10 pages", () => {
    const rankingItems = NAV.filter((item) => item.href === "/" || item.href === "/best-ideas");
    expect(rankingItems).toHaveLength(1);
    expect(rankingItems[0]).toMatchObject({ href: "/", label: "10 + 10" });
    expect(navFor("/best-ideas")?.href).toBe("/");
  });
});
