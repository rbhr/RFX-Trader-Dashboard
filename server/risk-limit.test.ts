import { describe, it, expect } from "vitest";
import {
  copierLimitsFor,
  computeAccruedProfitShare,
  computeDailyLossLimit,
  findActiveNewsBlock,
  findActualRiskLimit,
  findDailyRiskLimit,
} from "./tradingControls";

// Shaped like "RFX - Bisma - 81279": MetaCopier lists the daily limit first,
// and it carries an absoluteRiskLimit of its own.
const daily = {
  id: "daily",
  active: true,
  riskType: { id: 1 },
  riskLimit: 0.04,
  absoluteRiskLimit: 1000,
};
const actual = {
  id: "actual",
  active: true,
  riskType: { id: 4 },
  riskLimit: 0,
  absoluteRiskLimit: 1337.58,
};

describe("findActualRiskLimit", () => {
  it("picks the Actual limit even when the daily limit is listed first", () => {
    expect(findActualRiskLimit([daily, actual])?.id).toBe("actual");
  });

  it("ignores an inactive Actual limit", () => {
    expect(
      findActualRiskLimit([daily, { ...actual, active: false }])
    ).toBeUndefined();
  });

  it("returns undefined for no limits", () => {
    expect(findActualRiskLimit([])).toBeUndefined();
    expect(findActualRiskLimit(null)).toBeUndefined();
  });
});

describe("findDailyRiskLimit", () => {
  it("never returns the Actual limit", () => {
    expect(findDailyRiskLimit([actual])).toBeUndefined();
  });

  it("finds a switched-off daily limit so it can be re-enabled", () => {
    const off = { ...daily, active: false };
    expect(findDailyRiskLimit([actual, off])?.id).toBe("daily");
  });
});

describe("computeDailyLossLimit", () => {
  it("measures the loss from the balance recorded at the daily reset", () => {
    const status = [{ riskLimitId: "daily", referenceBalance: 1837.58 }];
    // Current balance differs on purpose: the reference balance must win.
    expect(computeDailyLossLimit([daily, actual], status, 1900)).toEqual({
      percent: 4,
      maxLossAmount: 73.5,
      breachEquity: 1764.08,
    });
  });

  it("falls back to the current balance before the first reset", () => {
    expect(computeDailyLossLimit([daily], [], 2000)).toEqual({
      percent: 4,
      maxLossAmount: 80,
      breachEquity: 1920,
    });
  });

  it("returns null when the daily limit is off or missing", () => {
    expect(computeDailyLossLimit([actual], [], 2000)).toBeNull();
    expect(
      computeDailyLossLimit([{ ...daily, active: false }], [], 2000)
    ).toBeNull();
    expect(
      computeDailyLossLimit([{ ...daily, riskLimit: 0 }], [], 2000)
    ).toBeNull();
  });

  it("returns null without any balance to measure from", () => {
    expect(computeDailyLossLimit([daily], [], null)).toBeNull();
  });
});

describe("findActiveNewsBlock", () => {
  const window = (from: string, to: string, title: string) => ({
    eventId: title,
    title,
    currencyCode: "USD",
    blackoutFromUtc: from,
    blackoutToUtc: to,
  });
  const symbols = [
    {
      symbol: "XAUUSD",
      windows: [
        window("2026-09-25T11:30:00Z", "2026-09-25T13:30:00Z", "Durable Goods"),
      ],
    },
    { symbol: "EURUSD", windows: [] },
  ];

  it("reports the blocked symbols and when the blackout ends", () => {
    const now = new Date("2026-09-25T12:00:00Z").getTime();
    expect(findActiveNewsBlock(symbols, now)).toEqual({
      symbols: ["XAUUSD"],
      title: "Durable Goods",
      untilUtc: "2026-09-25T13:30:00.000Z",
    });
  });

  it("is null outside every window, and at the instant one ends", () => {
    expect(
      findActiveNewsBlock(symbols, new Date("2026-09-25T11:29:59Z").getTime())
    ).toBeNull();
    expect(
      findActiveNewsBlock(symbols, new Date("2026-09-25T13:30:00Z").getTime())
    ).toBeNull();
  });
});

describe("copierLimitsFor", () => {
  it("passes the trader's limits through a multiplier", () => {
    expect(copierLimitsFor({ maxTotalLots: 0.05, maxOpenTrades: 2 }, { mode: "multiplier", value: 1 }))
      .toEqual({ maximumLot: 0.05, maxOpenPositions: 2 });
    expect(copierLimitsFor({ maxTotalLots: 0.05, maxOpenTrades: 2 }, { mode: "multiplier", value: 2 }))
      .toEqual({ maximumLot: 0.1, maxOpenPositions: 2 });
    expect(copierLimitsFor({ maxTotalLots: 0.05, maxOpenTrades: 2 }, { mode: "multiplier", value: 0.5 }))
      .toEqual({ maximumLot: 0.03, maxOpenPositions: 2 });
  });

  it("never rounds a live limit down to zero", () => {
    expect(copierLimitsFor({ maxTotalLots: 0.01, maxOpenTrades: 0 }, { mode: "multiplier", value: 0.1 }).maximumLot)
      .toBe(0.01);
  });

  it("caps a fixed-lot copier by fixed lot × max open trades", () => {
    expect(copierLimitsFor({ maxTotalLots: 0.04, maxOpenTrades: 2 }, { mode: "fixed", value: 0.01 }))
      .toEqual({ maximumLot: 0.02, maxOpenPositions: 2 });
    // No limit on trades means no meaningful cap on total lots either.
    expect(copierLimitsFor({ maxTotalLots: 0.04, maxOpenTrades: 0 }, { mode: "fixed", value: 0.01 }))
      .toEqual({ maximumLot: 0, maxOpenPositions: 0 });
  });

  it("0 on the account is 0 (no limit) on the copier", () => {
    expect(copierLimitsFor({ maxTotalLots: 0, maxOpenTrades: 0 }, { mode: "multiplier", value: 1 }))
      .toEqual({ maximumLot: 0, maxOpenPositions: 0 });
  });
});

describe("computeAccruedProfitShare", () => {
  it("is zero while earlier losses are still unrecovered", () => {
    // Paid up to 5,000 cumulative, since fallen to 4,600: a +200 week only
    // brings it back to 4,800, still under the high-water mark.
    expect(computeAccruedProfitShare(4800, 5000, 0.35)).toBe(0);
  });

  it("shares only the profit above the high-water mark", () => {
    expect(computeAccruedProfitShare(5400, 5000, 0.35)).toBeCloseTo(140);
  });
});
