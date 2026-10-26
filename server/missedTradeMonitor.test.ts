import { describe, expect, it } from "vitest";
import { copierCopiesNewTrades, evaluateSkip } from "./missedTradeMonitor";

// This monitor closes real positions on a trader's account and tells them why,
// so both halves of its decision need pinning: that the copier would have
// copied the trade at all, and that it would then have skipped it.

describe("copierCopiesNewTrades", () => {
  it("is true only for a copier in MetaCopier's ACTIVE state", () => {
    expect(copierCopiesNewTrades({ active: true, monitorOnly: false })).toBe(true);
  });

  it("is false for a disabled copier", () => {
    // active:false is "fully disabled/detached" — it copies nothing, so a
    // missing SL/TP cannot be why a trade did not reach live. This was
    // Zeeshan DZero (51190) on 2026-10-26.
    expect(copierCopiesNewTrades({ active: false, monitorOnly: false })).toBe(false);
  });

  it("is false for a monitor-only copier", () => {
    // MANAGE: existing positions are still managed, new trades never copy.
    // Twenty of the twenty-one traders carrying a type-31 feature were here.
    expect(copierCopiesNewTrades({ active: true, monitorOnly: true })).toBe(false);
  });

  it("is false when either flag is missing, rather than assuming it copies", () => {
    // The guard decides whether to close someone's position, so an absent
    // field must not read as permission to act.
    expect(copierCopiesNewTrades({})).toBe(false);
    expect(copierCopiesNewTrades({ monitorOnly: false })).toBe(false);
    expect(copierCopiesNewTrades({ active: true })).toBe(true);
  });
});

describe("evaluateSkip", () => {
  const pos = (stopLoss: number, takeProfit: number) => ({ stopLoss, takeProfit });
  const both = { ifSlNotDefined: true, ifTpNotDefined: true, logicOperatorTpSl: "OR" };

  it("skips on either missing protection under OR, and names both", () => {
    expect(evaluateSkip(both, pos(0, 0))).toEqual({
      skipped: true,
      missing: "stop-loss and take-profit",
    });
    expect(evaluateSkip(both, pos(0, 2400))).toEqual({
      skipped: true,
      missing: "stop-loss",
    });
    expect(evaluateSkip(both, pos(2300, 0))).toEqual({
      skipped: true,
      missing: "take-profit",
    });
  });

  it("leaves a fully protected trade alone", () => {
    expect(evaluateSkip(both, pos(2300, 2400)).skipped).toBe(false);
  });

  it("requires both to be missing under AND", () => {
    const and = { ...both, logicOperatorTpSl: "AND" };
    expect(evaluateSkip(and, pos(0, 0)).skipped).toBe(true);
    expect(evaluateSkip(and, pos(0, 2400)).skipped).toBe(false);
    expect(evaluateSkip(and, pos(2300, 0)).skipped).toBe(false);
  });

  it("ignores a protection the copier does not require", () => {
    const slOnly = { ifSlNotDefined: true, ifTpNotDefined: false, logicOperatorTpSl: "OR" };
    expect(evaluateSkip(slOnly, pos(2300, 0)).skipped).toBe(false);
    expect(evaluateSkip(slOnly, pos(0, 2400))).toEqual({
      skipped: true,
      missing: "stop-loss",
    });
  });

  it("treats a non-positive or absent level as unset", () => {
    // MetaCopier reports "no stop-loss" as 0, and a socket position may omit
    // the field entirely. Neither may read as protected.
    expect(evaluateSkip(both, { stopLoss: 0, takeProfit: 0 }).skipped).toBe(true);
    expect(evaluateSkip(both, {}).skipped).toBe(true);
    expect(evaluateSkip(both, { stopLoss: null, takeProfit: null }).skipped).toBe(true);
    expect(evaluateSkip(both, { stopLoss: "2300", takeProfit: "2400" }).skipped).toBe(true);
  });

  it("never skips when the copier requires neither", () => {
    const neither = { ifSlNotDefined: false, ifTpNotDefined: false, logicOperatorTpSl: "OR" };
    expect(evaluateSkip(neither, pos(0, 0)).skipped).toBe(false);
  });

  it("defaults a missing or unknown operator to OR", () => {
    expect(evaluateSkip({ ...both, logicOperatorTpSl: undefined }, pos(0, 2400)).skipped).toBe(true);
    expect(evaluateSkip({ ...both, logicOperatorTpSl: "and" }, pos(0, 2400)).skipped).toBe(true);
  });
});
