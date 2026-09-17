import { describe, expect, it } from "vitest";
import { NAV, navFor } from "./nav";

describe("primary navigation", () => {
  it("uses one consolidated 10 + 10 surface instead of separate Best Ideas and Top 10 pages", () => {
    const rankingItems = NAV.filter((item) => item.href === "/" || item.href === "/best-ideas");
    expect(rankingItems).toHaveLength(1);
    expect(rankingItems[0]).toMatchObject({ href: "/", label: "10 + 10" });
    expect(navFor("/best-ideas")?.href).toBe("/");
  });

  it("links the challenger tournament, AI Regime sleeve, underwriting evaluation loop, and system reality map", () => {
    expect(NAV).toEqual(expect.arrayContaining([
      expect.objectContaining({ href: "/challengers", label: "Challengers" }),
      expect.objectContaining({ href: "/ai-regime", label: "AI Regime" }),
      expect.objectContaining({ href: "/evaluation", label: "Evaluation" }),
      expect.objectContaining({ href: "/system", label: "System Map" }),
    ]));
    expect(navFor("/challengers")?.href).toBe("/challengers");
    expect(navFor("/ai-regime")?.href).toBe("/ai-regime");
    expect(navFor("/evaluation")?.href).toBe("/evaluation");
    expect(navFor("/system")?.href).toBe("/system");
    const hotkeys = NAV.map((item) => item.hotkey);
    expect(new Set(hotkeys).size).toBe(hotkeys.length);
    expect(NAV.find((item) => item.href === "/ai-regime")).toMatchObject({ label: "AI Regime", hotkey: "d" });
  });
});
