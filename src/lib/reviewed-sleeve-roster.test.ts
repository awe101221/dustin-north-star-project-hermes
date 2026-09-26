import { describe, expect, it } from "vitest";
import { acceptSleeveRosterPublication } from "./ai-regime";
import { REVIEWED_SLEEVE_ROSTER } from "./reviewed-sleeve-roster";

describe("reviewed sleeve roster file", () => {
  it("keeps the fields readers of the JSON file depend on", () => {
    for (const row of REVIEWED_SLEEVE_ROSTER) {
      expect(row).toEqual(expect.objectContaining({
        ticker: expect.any(String),
        symbol: expect.any(String),
        companyName: expect.any(String),
        asOf: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        reviewVerdict: expect.stringMatching(/^PASS( WITH CAVEATS)?$/),
        fiveYearExpectedIrr: expect.any(Number),
      }));
    }
  });

  it("still ranks SPSC from the file", () => {
    const spsc = REVIEWED_SLEEVE_ROSTER.find((row) => row.symbol === "SPSC");
    expect(acceptSleeveRosterPublication(spsc)).toMatchObject({ ticker: "NAS:SPSC", symbol: "SPSC", clearsCapitalLine: false });
  });
});
