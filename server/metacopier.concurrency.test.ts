import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The global request limiter in metacopier.ts is the only thing keeping a
 * fan-out loop under the MetaCopier API's ~8-concurrent ceiling, and a leaked
 * slot would deadlock every MetaCopier call in the process. Both properties are
 * pinned here.
 */

const CONCURRENCY = 5;

const state = vi.hoisted(() => ({
  inFlight: 0,
  maxInFlight: 0,
  mode: "resolve" as "resolve" | "reject",
}));

vi.mock("axios", () => ({
  default: vi.fn(async () => {
    state.inFlight++;
    state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
    await new Promise(r => setTimeout(r, 10));
    state.inFlight--;
    if (state.mode === "reject") {
      const err: any = new Error("upstream blew up");
      err.response = { status: 500 };
      throw err;
    }
    return { data: { ok: true } };
  }),
}));

process.env.METACOPIER_MAX_CONCURRENCY = String(CONCURRENCY);
process.env.METACOPIER_API_KEY = "test-key";
process.env.METACOPIER_ACCOUNT_ID = "test-account";

const { metaCopierService } = await import("./metacopier");
const call = (n: number) =>
  (metaCopierService as any).fetchWithAuth(`/test/${n}`) as Promise<unknown>;

describe("MetaCopier request limiter", () => {
  beforeEach(() => {
    state.inFlight = 0;
    state.maxInFlight = 0;
    state.mode = "resolve";
  });

  it("never runs more than the configured number of requests at once", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => call(i))
    );

    expect(results).toHaveLength(20);
    expect(state.maxInFlight).toBe(CONCURRENCY);
    expect(state.inFlight).toBe(0);
  });

  it("releases the slot when a request throws, so later calls still run", async () => {
    state.mode = "reject";
    const failed = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => call(i))
    );
    expect(failed.every(r => r.status === "rejected")).toBe(true);

    // If a rejection leaked its slot, these would queue behind nothing and hang.
    state.mode = "resolve";
    const recovered = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) => call(i))
    );
    expect(recovered).toHaveLength(CONCURRENCY);
    expect(state.inFlight).toBe(0);
  });
});
