import { describe, expect, it } from "vitest";
import {
  CURRENT_10_PLUS_10_TICKERS,
  buildForecastRows,
  getCompanyModel,
  weightedAnnualizedReturn,
} from "./company-models";

const EXPECTED = [
  "MELI", "NU", "META", "GOOGL", "APPF", "ACN", "CRDO", "TCEHY", "ANET", "TSM",
  "VRT", "AMKR", "MU", "CAMT", "MRVL", "ASML", "ONTO", "FORM", "GEV", "RXRX",
];

describe("10 + 10 company models", () => {
  it("ships a complete model for every current 10 + 10 company", () => {
    expect(CURRENT_10_PLUS_10_TICKERS).toEqual(EXPECTED);
    for (const ticker of EXPECTED) {
      const model = getCompanyModel(ticker);
      expect(model?.ticker).toBe(ticker);
      expect(model?.scenarios.map((scenario) => scenario.name)).toEqual(["Bear", "Base", "Bull"]);
      expect(model?.drivers).toHaveLength(3);
      expect(model?.risks).toHaveLength(3);
      expect(model?.monitoring).toHaveLength(3);
      expect(model?.methodology.length).toBeGreaterThan(40);
      expect(model?.dataQuality.length).toBeGreaterThan(20);
    }
  });

  it("normalizes exchange-prefixed company routes", () => {
    expect(getCompanyModel("NAS:META")?.ticker).toBe("META");
    expect(getCompanyModel("nyse:nu")?.ticker).toBe("NU");
    expect(getCompanyModel("NOT-IN-LIST")).toBeNull();
  });

  it("keeps scenario probabilities and probability-weighted returns internally consistent", () => {
    for (const ticker of EXPECTED) {
      const model = getCompanyModel(ticker)!;
      expect(model.scenarios.reduce((sum, scenario) => sum + scenario.probability, 0)).toBeCloseTo(1, 6);
      expect(weightedAnnualizedReturn(model)).toBeCloseTo(model.probabilityWeightedReturn, 6);
      for (const scenario of model.scenarios) {
        expect(scenario.probability).toBeGreaterThan(0);
        expect(scenario.exitMultiple).toBeGreaterThan(0);
        expect(scenario.targetPrice).toBeGreaterThan(0);
      }
    }
  });

  it("builds a readable five-year base forecast with indexed revenue and margin progression", () => {
    const model = getCompanyModel("MELI")!;
    const rows = buildForecastRows(model, "Base");
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({ year: 0, revenueIndex: 100, operatingProfitUnits: expect.any(Number) });
    expect(rows[0]).not.toHaveProperty("operatingIncomeIndex");
    expect(rows[5]?.year).toBe(5);
    expect(rows[5]!.revenueIndex).toBeGreaterThan(rows[0]!.revenueIndex);
    expect(rows[5]!.margin).toBeCloseTo(model.scenarios[1]!.targetMargin, 6);
  });
});
