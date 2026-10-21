import { describe, expect, it } from "vitest";
import { retryDelayMs } from "./metacopier";

// Each 429 is expensive — the retry chain is what pinned failing requests at
// ~15s — so what this returns is load-bearing. `now` and `random` are injected
// so the arithmetic can be pinned rather than sampled.

const NOW = Date.parse("2026-10-21T02:00:00.000Z");

describe("429 retry delay", () => {
  it("backs off exponentially when the server gives no hint", () => {
    // random()=1 is the top of each window, i.e. the old fixed chain.
    expect(retryDelayMs(0, undefined, NOW, () => 1)).toBe(1000);
    expect(retryDelayMs(1, undefined, NOW, () => 1)).toBe(2000);
    expect(retryDelayMs(2, undefined, NOW, () => 1)).toBe(4000);
    expect(retryDelayMs(3, undefined, NOW, () => 1)).toBe(8000);
  });

  it("jitters within the upper half of the window", () => {
    // Never earlier than half the slot, so the backoff keeps its shape...
    expect(retryDelayMs(2, undefined, NOW, () => 0)).toBe(2000);
    expect(retryDelayMs(2, undefined, NOW, () => 0.5)).toBe(3000);
    expect(retryDelayMs(2, undefined, NOW, () => 1)).toBe(4000);

    // ...and two callers that collided are no longer in lockstep.
    const a = retryDelayMs(2, undefined, NOW, () => 0.1);
    const b = retryDelayMs(2, undefined, NOW, () => 0.9);
    expect(a).not.toBe(b);
  });

  it("honours Retry-After given in seconds", () => {
    const d = retryDelayMs(0, { "retry-after": "4" }, NOW, () => 1);
    expect(d).toBe(4000);
    // Jittered too, so a hint shared by many callers does not re-synchronise them.
    expect(retryDelayMs(0, { "retry-after": "4" }, NOW, () => 0)).toBe(2000);
  });

  it("honours Retry-After given as an HTTP date", () => {
    const when = new Date(NOW + 6000).toUTCString();
    expect(retryDelayMs(0, { "retry-after": when }, NOW, () => 1)).toBe(6000);
  });

  it("treats a date already in the past as no wait", () => {
    const when = new Date(NOW - 30_000).toUTCString();
    expect(retryDelayMs(0, { "retry-after": when }, NOW, () => 1)).toBe(0);
  });

  it("caps the wait however long the server asks for", () => {
    // Blocking a user-facing request for minutes is worse than failing it.
    expect(retryDelayMs(0, { "retry-after": "600" }, NOW, () => 1)).toBe(10_000);
    // Also caps the exponential fallback at high attempt numbers.
    expect(retryDelayMs(9, undefined, NOW, () => 1)).toBe(10_000);
  });

  it("falls back to the exponential delay for an unparseable header", () => {
    expect(retryDelayMs(1, { "retry-after": "soon" }, NOW, () => 1)).toBe(2000);
  });
});
