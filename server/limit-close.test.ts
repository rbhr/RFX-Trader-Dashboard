import { describe, it, expect, vi } from "vitest";

// parseLimitClose is pure; the module's other imports are not.
vi.mock("./db", () => ({}));
vi.mock("./metacopier", () => ({ metaCopierService: {} }));
vi.mock("./metacopierSocket", () => ({ socketEvents: { on: vi.fn() } }));
vi.mock("./telegram", () => ({}));
vi.mock("./systemNotifications", () => ({}));
vi.mock("./logStore", () => ({ logEvent: vi.fn() }));

import { parseLimitClose } from "./limitCloseMonitor";

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
