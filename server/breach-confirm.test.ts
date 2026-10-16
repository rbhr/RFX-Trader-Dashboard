import { describe, it, expect } from "vitest";
import { confirmEquityBreach, implausibleEquityReason } from "./breachConfirm";

const fresh = (equity: number | null) => async () => (equity == null ? null : { equity });

describe("implausibleEquityReason", () => {
  it("rejects negative and non-numeric equity", () => {
    expect(implausibleEquityReason(-6113.64)).toMatch(/negative equity/);
    expect(implausibleEquityReason(Number.NaN)).toMatch(/not a number/);
  });
  it("accepts ordinary readings", () => {
    expect(implausibleEquityReason(1500)).toBeNull();
    expect(implausibleEquityReason(0.5)).toBeNull();
  });
});

describe("confirmEquityBreach", () => {
  it("rejects Varun's -6113.64 without even taking a fresh read", async () => {
    let calls = 0;
    const v = await confirmEquityBreach({
      observedEquity: -6113.64,
      riskLimit: 2054.54,
      fetchFresh: async () => {
        calls++;
        return { equity: 2500 };
      },
    });
    expect(v.ok).toBe(false);
    expect(calls).toBe(0);
  });

  it("drops a below-limit glitch when the fresh read is above the limit", async () => {
    const v = await confirmEquityBreach({
      observedEquity: 1000,
      riskLimit: 2054.54,
      fetchFresh: fresh(2500),
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/glitch/);
  });

  it("confirms a real breach and reports the fresh figure", async () => {
    const v = await confirmEquityBreach({
      observedEquity: 2040,
      riskLimit: 2054.54,
      fetchFresh: fresh(2038.2),
    });
    expect(v).toEqual({ ok: true, equity: 2038.2 });
  });

  it("does not confirm when the fresh read is missing, zero or negative", async () => {
    for (const f of [fresh(null), fresh(0), fresh(-5)]) {
      const v = await confirmEquityBreach({ observedEquity: 1000, riskLimit: 2000, fetchFresh: f });
      expect(v.ok).toBe(false);
    }
  });

  it("does not confirm when the fresh read throws", async () => {
    const v = await confirmEquityBreach({
      observedEquity: 1000,
      riskLimit: 2000,
      fetchFresh: async () => {
        throw new Error("503");
      },
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/503/);
  });

  it("ignores a reading that is not below the limit", async () => {
    const v = await confirmEquityBreach({ observedEquity: 2100, riskLimit: 2000, fetchFresh: fresh(1000) });
    expect(v.ok).toBe(false);
  });
});
