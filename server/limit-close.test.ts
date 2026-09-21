import { describe, it, expect, vi } from "vitest";

// parseLimitClose is pure; the module's other imports are not.
vi.mock("./db", () => ({}));
vi.mock("./metacopier", () => ({ metaCopierService: {} }));
vi.mock("./metacopierSocket", () => ({ socketEvents: { on: vi.fn() } }));
vi.mock("./telegram", () => ({}));
vi.mock("./systemNotifications", () => ({}));
vi.mock("./logStore", () => ({ logEvent: vi.fn() }));

import { parseLimitClose, parseRiskLimitHit } from "./limitCloseMonitor";

describe("parseLimitClose", () => {
  it("reads an aggregated Trade Guardrails close (Sameer 81301, 2026-09-21)", () => {
    expect(
      parseLimitClose(
        "Close: 2409312898 Buy XAUUSD 0.25 (Trade Guardrails: aggregated lot size 0.25 on XAUUSD exceeds threshold 0.04)"
      )
    ).toEqual({
      kind: "lots",
      ticket: "2409312898",
      side: "Buy",
      symbol: "XAUUSD",
      volume: 0.25,
      total: 0.25,
      limit: 0.04,
    });
  });

  it("keeps the trade's own size apart from the aggregated total", () => {
    const close = parseLimitClose(
      "Close: 3179649335 Buy XAUUSD 0.5 (Trade Guardrails: aggregated lot size 1.0 on XAUUSD exceeds threshold 0.5)"
    );
    expect(close).toMatchObject({ kind: "lots", volume: 0.5, total: 1, limit: 0.5 });
  });

  it("reads a per-trade (non-aggregated) guardrail close", () => {
    expect(
      parseLimitClose(
        "Close: 123 Sell EURUSD 0.3 (Trade Guardrails: lot size 0.3 exceeds threshold 0.1)"
      )
    ).toMatchObject({ kind: "lots", symbol: "EURUSD", total: 0.3, limit: 0.1 });
  });

  it("reads a max-open-positions close", () => {
    expect(
      parseLimitClose("Close (max open positions): 2409013999 Sell XAUUSD 0.01")
    ).toEqual({
      kind: "positions",
      ticket: "2409013999",
      side: "Sell",
      symbol: "XAUUSD",
      volume: 0.01,
    });
  });

  it("ignores every other log line", () => {
    for (const text of [
      "Close: 2409312898 Buy XAUUSD 0.25 (detected)",
      "Open: 2409315504 Buy XAUUSD 0.04 TP: 4352.0 SL: 4335.0 (detected)",
      "Open skipped (exceeds max lot size): from 2128d9ca ticket: 2402903875 Sell XAUUSD 0.04",
      "Close (risk limit was hit): 1 Buy XAUUSD 0.01",
      "",
    ]) {
      expect(parseLimitClose(text)).toBeNull();
    }
  });
});

describe("parseRiskLimitHit", () => {
  it("reads a daily loss hit (Feroz 81284, 2026-09-21)", () => {
    expect(
      parseRiskLimitHit(
        "Risk limit 27b5868b-b379-4a56-a172-5f52c3b3572b was hit: reference 1970.02 USD <-> actual 1890.22 USD. Loss: 79.8 USD. Drawdown 4.1%"
      )
    ).toEqual({
      riskLimitId: "27b5868b-b379-4a56-a172-5f52c3b3572b",
      reference: 1970.02,
      actual: 1890.22,
      loss: 79.8,
      drawdownPercent: 4.1,
      absoluteLimit: null,
    });
  });

  it("captures the absolute floor when that is what was crossed (Samad 81300)", () => {
    const hit = parseRiskLimitHit(
      "Risk limit 4e4277c1-d6b7-49f4-a5b8-e4e9e9688f83 was hit: reference 1818.68 USD <-> actual 1816.56 USD. Loss: 2.12 USD. Drawdown 0.1% (absolute limit: 1818.06 USD)"
    );
    expect(hit?.absoluteLimit).toBe(1818.06);
    expect(hit?.actual).toBe(1816.56);
  });

  it("ignores the daily reset line and position closes", () => {
    expect(
      parseRiskLimitHit("Risk limit daily reference balance reset to 1837.58 USD")
    ).toBeNull();
    expect(
      parseRiskLimitHit("Close: 2407200900 Sell XAUUSD 0.02 (risk limit was hit)")
    ).toBeNull();
  });
});
