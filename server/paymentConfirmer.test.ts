import { describe, it, expect, vi, beforeEach } from "vitest";

// paymentConfirmer is where the money-safety rules live, because it is the only
// thing that decides whether a broadcast payout counts as settled. These pin
// the three that matter: a trader is told only once settlement is confirmed, a
// payment is marked Failed only on a definitive rejection, and anything we
// cannot prove stays pending rather than being guessed either way.

const g = vi.hoisted(() => ({
  pending: [] as any[],
  gasFreeStatus: null as any,
  tronStatus: null as any,
  erc20Status: null as any,
  confirmed: [] as Array<{ id: number; hash?: string }>,
  failed: [] as Array<{ id: number; reason: string }>,
  announced: [] as any[],
  ownerNotices: [] as any[],
  baselineWrites: [] as Array<{ id: number; amount: number }>,
  traderBaseline: "0.00" as string | null,
}));

vi.mock("./db", () => ({
  getPendingPayments: vi.fn(async () => g.pending),
  markPaymentConfirmed: vi.fn(async (id: number, hash?: string) => {
    g.confirmed.push({ id, hash });
  }),
  markPaymentFailed: vi.fn(async (id: number, reason: string) => {
    g.failed.push({ id, reason });
  }),
  getMagicNumberById: vi.fn(async () => ({
    id: 1,
    name: "Test Trader",
    magicNumber: "12345",
    profitShareBaseline: g.traderBaseline,
  })),
  setProfitShareBaseline: vi.fn(async (id: number, amount: number) => {
    g.baselineWrites.push({ id, amount });
  }),
}));

vi.mock("./paymentRecord", () => ({
  creditAndAnnouncePayment: vi.fn(async (p: any) => {
    g.announced.push(p);
  }),
}));

vi.mock("./tron", () => ({
  getGasFreeTransferStatus: vi.fn(async () => g.gasFreeStatus),
  getTronTxStatus: vi.fn(async () => g.tronStatus),
}));

vi.mock("./erc20", () => ({
  getErc20TxStatus: vi.fn(async () => g.erc20Status),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn(async (payload: any) => {
    g.ownerNotices.push(payload);
    return true;
  }),
}));

vi.mock("./logStore", () => ({ logEvent: vi.fn() }));

function pendingPayment(overrides: Partial<any> = {}) {
  return {
    id: 501,
    magicNumberId: 1,
    amount: "25.00",
    networkFee: "1.50",
    transactionHash: "GASFREE-transfer-1",
    confirmTransferId: "transfer-1",
    network: "TRC20",
    narration: "Profit share 2026-10-01 – 2026-10-14",
    paymentDate: new Date("2026-10-20T12:00:00Z"),
    createdAt: new Date(),
    status: "Pending",
    baselineBefore: null,
    baselineAfter: null,
    ...overrides,
  };
}

beforeEach(() => {
  g.pending = [];
  g.gasFreeStatus = null;
  g.tronStatus = null;
  g.erc20Status = null;
  g.confirmed = [];
  g.failed = [];
  g.announced = [];
  g.ownerNotices = [];
  g.baselineWrites = [];
  g.traderBaseline = "0.00";
  vi.clearAllMocks();
});

describe("payout settlement", () => {
  it("confirms a settled payout, filling in the real hash and announcing it", async () => {
    const { _runCheck } = await import("./paymentConfirmer");
    g.pending = [pendingPayment()];
    g.gasFreeStatus = {
      settled: "confirmed",
      txHash: "0xrealhash",
      detail: "SUCCEED",
    };

    await _runCheck();

    // The placeholder is replaced by the hash the network published.
    expect(g.confirmed).toEqual([{ id: 501, hash: "0xrealhash" }]);
    expect(g.failed).toEqual([]);
    // Only now is the trader credited and told.
    expect(g.announced).toHaveLength(1);
    expect(g.announced[0]).toMatchObject({
      magicNumberId: 1,
      amount: 25,
      transactionHash: "0xrealhash",
      silent: false,
      skipLifetime: false,
    });
  });

  it("does not announce or credit anything while a payout is still pending", async () => {
    const { _runCheck } = await import("./paymentConfirmer");
    g.pending = [pendingPayment()];
    g.gasFreeStatus = {
      settled: "pending",
      txHash: "0xrealhash",
      detail: "CONFIRMING",
    };

    await _runCheck();

    expect(g.confirmed).toEqual([]);
    expect(g.failed).toEqual([]);
    expect(g.announced).toEqual([]);
  });

  it("marks a rejected payout failed, tells the admin and never the trader", async () => {
    const { _runCheck } = await import("./paymentConfirmer");
    g.pending = [pendingPayment()];
    g.gasFreeStatus = {
      settled: "failed",
      txHash: null,
      detail: "GasFree reported REJECTED",
    };

    await _runCheck();

    expect(g.failed).toEqual([
      { id: 501, reason: "GasFree reported REJECTED" },
    ]);
    expect(g.confirmed).toEqual([]);
    // The trader must not hear about money that never moved.
    expect(g.announced).toEqual([]);
    // The admin must still hear about it.
    expect(g.ownerNotices).toHaveLength(1);
    expect(g.ownerNotices[0].content).toMatch(/baseline/);
  });

  it("reverts the profit-share baseline when a payout fails to settle", async () => {
    const { _runCheck } = await import("./paymentConfirmer");
    // The payout advanced the baseline 1000 -> 1500 when it was broadcast.
    g.pending = [
      pendingPayment({ baselineBefore: "1000.00", baselineAfter: "1500.00" }),
    ];
    g.traderBaseline = "1500.00";
    g.gasFreeStatus = { settled: "failed", txHash: null, detail: "REJECTED" };

    await _runCheck();

    expect(g.baselineWrites).toEqual([{ id: 1, amount: 1000 }]);
    expect(g.ownerNotices[0].content).toMatch(/reverted from \$1500\.00 to \$1000\.00/);
  });

  it("refuses to revert a baseline that something else has since moved", async () => {
    const { _runCheck } = await import("./paymentConfirmer");
    g.pending = [
      pendingPayment({ baselineBefore: "1000.00", baselineAfter: "1500.00" }),
    ];
    // A later payout has already advanced it past this one's value.
    g.traderBaseline = "2200.00";
    g.gasFreeStatus = { settled: "failed", txHash: null, detail: "REJECTED" };

    await _runCheck();

    // Reverting would clobber the later payout, so it is reported, not done.
    expect(g.baselineWrites).toEqual([]);
    expect(g.ownerNotices[0].content).toMatch(/NOT reverted/);
    expect(g.ownerNotices[0].content).toMatch(/by hand/);
  });

  it("has no baseline to revert for a manual or test payment", async () => {
    const { _runCheck } = await import("./paymentConfirmer");
    g.pending = [pendingPayment({ baselineBefore: null, baselineAfter: null })];
    g.gasFreeStatus = { settled: "failed", txHash: null, detail: "REJECTED" };

    await _runCheck();

    expect(g.baselineWrites).toEqual([]);
    expect(g.ownerNotices[0].content).toMatch(/none was undone/);
  });

  it("leaves the baseline alone when a payout confirms", async () => {
    const { _runCheck } = await import("./paymentConfirmer");
    g.pending = [
      pendingPayment({ baselineBefore: "1000.00", baselineAfter: "1500.00" }),
    ];
    g.traderBaseline = "1500.00";
    g.gasFreeStatus = { settled: "confirmed", txHash: "0xok", detail: "SUCCEED" };

    await _runCheck();

    expect(g.baselineWrites).toEqual([]);
    expect(g.confirmed).toEqual([{ id: 501, hash: "0xok" }]);
  });

  it("treats an unreachable status lookup as pending, not failed", async () => {
    const { _runCheck } = await import("./paymentConfirmer");
    g.pending = [pendingPayment()];
    // This is what tron.ts returns when the API call itself failed.
    g.gasFreeStatus = {
      settled: "pending",
      txHash: null,
      detail: "status lookup failed: ECONNRESET",
    };

    await _runCheck();

    expect(g.failed).toEqual([]);
    expect(g.confirmed).toEqual([]);
    expect(g.announced).toEqual([]);
  });

  it("keeps a test-mode payout silent and out of lifetime income", async () => {
    const { _runCheck } = await import("./paymentConfirmer");
    g.pending = [pendingPayment({ narration: "[TEST] Profit share" })];
    g.gasFreeStatus = { settled: "confirmed", txHash: "0xabc", detail: "SUCCEED" };

    await _runCheck();

    expect(g.announced[0]).toMatchObject({ silent: true, skipLifetime: true });
  });

  it("settles an ERC-20 payout from its receipt, by hash", async () => {
    const { _runCheck } = await import("./paymentConfirmer");
    g.pending = [
      pendingPayment({
        network: "ERC20",
        transactionHash: "0xevmhash",
        confirmTransferId: null,
      }),
    ];
    g.erc20Status = {
      settled: "confirmed",
      txHash: "0xevmhash",
      detail: "mined in block 42",
    };

    await _runCheck();

    // The hash was already real, so it is not rewritten.
    expect(g.confirmed).toEqual([{ id: 501, hash: undefined }]);
    expect(g.announced).toHaveLength(1);
  });

  it("warns about a payout left unsettled, without failing it", async () => {
    const { _runCheck } = await import("./paymentConfirmer");
    g.pending = [
      pendingPayment({
        createdAt: new Date(Date.now() - 45 * 60 * 1000),
      }),
    ];
    g.gasFreeStatus = { settled: "pending", txHash: null, detail: "INPROGRESS" };

    await _runCheck();

    expect(g.failed).toEqual([]);
    expect(g.ownerNotices).toHaveLength(1);
    expect(g.ownerNotices[0].title).toMatch(/unsettled/i);

    // Warned once, not on every sweep.
    g.ownerNotices = [];
    await _runCheck();
    expect(g.ownerNotices).toEqual([]);
  });

  it("does not let one bad payment stop the others settling", async () => {
    const { _runCheck } = await import("./paymentConfirmer");
    const { getGasFreeTransferStatus } = await import("./tron");
    g.pending = [pendingPayment({ id: 1 }), pendingPayment({ id: 2 })];
    vi.mocked(getGasFreeTransferStatus)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        settled: "confirmed",
        txHash: "0xok",
        detail: "SUCCEED",
      });

    await _runCheck();

    expect(g.confirmed).toEqual([{ id: 2, hash: "0xok" }]);
  });
});
