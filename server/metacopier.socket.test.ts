import { describe, it, expect, vi, beforeEach } from "vitest";

// Force the socket on and control the cache getters.
vi.mock("./_core/env", () => ({ ENV: { mcSocketEnabled: true } }));
vi.mock("./metacopierSocket", () => ({
  getCachedInfo: vi.fn(),
  getCachedPositions: vi.fn(),
}));

import { metaCopierService } from "./metacopier";
import { getCachedInfo, getCachedPositions } from "./metacopierSocket";

const mockInfo = getCachedInfo as unknown as ReturnType<typeof vi.fn>;
const mockPos = getCachedPositions as unknown as ReturnType<typeof vi.fn>;

describe("metacopier cache-first reads", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("serves open positions from the socket cache (filtered by magic) without a REST call", async () => {
    mockPos.mockReturnValue([
      { id: 1, symbol: "EURUSD", dealType: "Buy", magicNumber: "111", profit: 5, swap: -1, commission: -2, volume: 0.1, openPrice: 1.1 },
      { id: 2, symbol: "XAUUSD", dealType: "Sell", magicNumber: "222", profit: 9, swap: 0, commission: 0 },
    ]);
    const fetchSpy = vi.spyOn(metaCopierService as any, "fetchWithAuth");

    const positions = await metaCopierService.getOpenPositionsFromAccount("acct-1", "111");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({
      id: "1",
      type: "BUY",
      magicNumber: "111",
      profit: 5,
      swap: -1,
      commission: -2,
    });
  });

  it("maps SELL direction and preserves P&L fields", async () => {
    mockPos.mockReturnValue([
      { id: 9, symbol: "XAUUSD", dealType: "Sell", magicNumber: "222", profit: 9, swap: 1, commission: 2 },
    ]);
    const all = await metaCopierService.getOpenPositionsFromAccount("acct-1");
    expect(all[0].type).toBe("SELL");
    expect(all[0]).toMatchObject({ profit: 9, swap: 1, commission: 2 });
  });

  it("falls back to REST when the position cache is empty/stale", async () => {
    mockPos.mockReturnValue(null);
    const fetchSpy = vi
      .spyOn(metaCopierService as any, "fetchWithAuth")
      .mockResolvedValue([
        { id: "r1", symbol: "EURUSD", type: "BUY", magicNumber: "111", profit: 1, swap: 0, commission: 0 },
      ]);

    const positions = await metaCopierService.getOpenPositionsFromAccount("acct-1", "111");

    expect(fetchSpy).toHaveBeenCalledWith("/accounts/acct-1/positions");
    expect(positions).toHaveLength(1);
    expect(positions[0].id).toBe("r1");
  });

  it("serves account info from cache when equity+balance are finite", async () => {
    mockInfo.mockReturnValue({ equity: 1234.5, balance: 1300, leverage: 100 });
    const fetchSpy = vi.spyOn(metaCopierService as any, "fetchWithAuth");

    const info = await metaCopierService.getAccountInfoById("acct-1");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(info.equity).toBe(1234.5);
    expect(info.balance).toBe(1300);
  });

  it("falls back to REST when cached info lacks finite equity/balance (shape guard)", async () => {
    mockInfo.mockReturnValue({ status: "connected" }); // no equity/balance
    const fetchSpy = vi
      .spyOn(metaCopierService as any, "fetchWithAuth")
      .mockResolvedValue({
        equity: 1, balance: 2, margin: 0, freeMargin: 0, marginLevel: 0,
        profit: 0, currency: "USD", leverage: 100, name: "", server: "", company: "",
      });

    const info = await metaCopierService.getAccountInfoById("acct-1");

    expect(fetchSpy).toHaveBeenCalledWith("/accounts/acct-1/information");
    expect(info.equity).toBe(1);
  });
});
