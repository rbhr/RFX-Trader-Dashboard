import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ingestDto,
  getCachedInfo,
  getCachedPositions,
  socketEvents,
} from "./metacopierSocket";

describe("metacopierSocket cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("caches account info and is last-write-wins", () => {
    ingestDto({
      type: "UpdateAccountInformationDTO",
      data: { accountId: "a1", info: { equity: 100, balance: 200 } },
    });
    expect(getCachedInfo("a1", 60_000)?.equity).toBe(100);

    ingestDto({
      type: "UpdateAccountInformationDTO",
      data: { accountId: "a1", info: { equity: 150, balance: 250 } },
    });
    expect(getCachedInfo("a1", 60_000)?.equity).toBe(150);
  });

  it("caches open positions", () => {
    ingestDto({
      type: "UpdateOpenPositionsDTO",
      data: { accountId: "a2", openPositions: [{ id: 1 }, { id: 2 }] },
    });
    expect(getCachedPositions("a2", 60_000)).toHaveLength(2);
  });

  it("returns null once the cached entry is older than maxAgeMs", () => {
    ingestDto({
      type: "UpdateAccountInformationDTO",
      data: { accountId: "a3", info: { equity: 1, balance: 2 } },
    });
    expect(getCachedInfo("a3", 60_000)).not.toBeNull();
    vi.advanceTimersByTime(61_000);
    expect(getCachedInfo("a3", 60_000)).toBeNull();
  });

  it("emits an update event with accountId and type", () => {
    const spy = vi.fn();
    socketEvents.on("update", spy);
    ingestDto({
      type: "UpdateOpenPositionsDTO",
      data: { accountId: "a4", openPositions: [] },
    });
    expect(spy).toHaveBeenCalledWith({
      accountId: "a4",
      type: "UpdateOpenPositionsDTO",
    });
    socketEvents.off("update", spy);
  });

  it("ignores unknown or malformed DTOs without caching or throwing", () => {
    ingestDto({ type: "MysteryDTO", data: { accountId: "a5" } });
    expect(getCachedInfo("a5", 60_000)).toBeNull();
    expect(getCachedPositions("a5", 60_000)).toBeNull();
    expect(() => ingestDto({ nonsense: true })).not.toThrow();
  });
});
