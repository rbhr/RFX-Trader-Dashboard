import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TxFailedError, TxPendingError } from "./walletErrors";

// The GasFree confirmation poll decides how long an admin's payout request
// hangs, and how a half-finished transfer is reported. Neither had any
// coverage, so these pin the behaviour that matters for money: never report a
// timeout for a transfer GasFree called successful, never claim failure for
// one that only lacks a hash yet, and don't make a fast transfer wait.

const g = vi.hoisted(() => ({
  statusQueue: [] as any[],
  lastStatus: null as any,
  statusPolls: 0,
}));

vi.mock("./_core/env", () => ({
  ENV: {
    tronPrivateKey: "a".repeat(64),
    tronFullNode: "https://api.trongrid.io",
    tronUsdtContract: "TUsdtContract",
    gasFreeApiKey: "test-key",
    gasFreeApiSecret: "test-secret",
  },
}));

vi.mock("tronweb", () => ({
  TronWeb: class {
    defaultAddress = { base58: "TUserAddress" };
    trx = { _signTypedData: async () => "0xsignature" };
    isAddress() {
      return true;
    }
  },
}));

vi.mock("@gasfree/gasfree-sdk", () => ({
  default: {
    TronGasFree: class {
      assembleGasFreeTransactionJson() {
        return { domain: {}, types: {}, message: {} };
      }
    },
  },
}));

/** The shipped timings, restored after each test. */
const REAL_POLL = {
  budgetMs: 120_000,
  fastWindowMs: 10_000,
  fastIntervalMs: 1_000,
  slowIntervalMs: 3_000,
  hashGraceMs: 15_000,
};

function jsonOk(data: any) {
  return { ok: true, status: 200, json: async () => ({ code: 200, data }) };
}

beforeEach(() => {
  g.statusQueue = [];
  g.lastStatus = null;
  g.statusPolls = 0;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/v1/address/")) return jsonOk({ nonce: 1 });
      if (url.includes("/config/provider/all"))
        return jsonOk({
          providers: [
            { address: "TProvider", config: { defaultDeadlineDuration: 300 } },
          ],
        });
      if (url.includes("/config/token/all"))
        return jsonOk({
          tokens: [{ tokenAddress: "TUsdtContract", transferFee: "2000000" }],
        });
      if (url.includes("/gasfree/submit")) return jsonOk({ id: "transfer-1" });
      if (url.includes("/gasfree/transfer-1")) {
        g.statusPolls++;
        if (g.statusQueue.length) g.lastStatus = g.statusQueue.shift();
        return jsonOk(g.lastStatus);
      }
      throw new Error(`unexpected fetch: ${url}`);
    })
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  const { GASFREE_POLL } = await import("./tron");
  Object.assign(GASFREE_POLL, REAL_POLL);
});

describe("GasFree transfer confirmation", () => {
  it("returns as soon as the transfer is confirmed, without a fixed pre-wait", async () => {
    const { sendUsdt } = await import("./tron");
    g.statusQueue = [{ state: "SUCCESS", txnHash: "0xabc" }];

    const startedAt = Date.now();
    await expect(sendUsdt("TRecipient", 10)).resolves.toBe("0xabc");

    // One poll, and it happened before any sleep. The old loop slept 3s first,
    // so every payout — however fast — paid that 3s.
    expect(g.statusPolls).toBe(1);
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });

  it("keeps polling through PENDING and returns the hash when it lands", async () => {
    const { sendUsdt, GASFREE_POLL } = await import("./tron");
    Object.assign(GASFREE_POLL, { fastIntervalMs: 10, slowIntervalMs: 10 });
    g.statusQueue = [
      { state: "PENDING", txnHash: null },
      { state: "PROCESSING", txnHash: null },
      { state: "SUCCESS", txnHash: "0xdef" },
    ];

    await expect(sendUsdt("TRecipient", 10)).resolves.toBe("0xdef");
    expect(g.statusPolls).toBe(3);
  });

  it("throws TxFailedError on a rejected transfer so no payment is recorded", async () => {
    const { sendUsdt } = await import("./tron");
    g.statusQueue = [{ state: "REJECTED", txnHash: null }];

    await expect(sendUsdt("TRecipient", 10)).rejects.toThrow(TxFailedError);
  });

  it("gives up on a hash-less success in the grace window, not the full budget", async () => {
    const { sendUsdt, GASFREE_POLL } = await import("./tron");
    // Keep the budget far longer than the grace, so finishing early can only
    // mean the grace window ended it.
    Object.assign(GASFREE_POLL, {
      budgetMs: 10_000,
      fastWindowMs: 10_000,
      fastIntervalMs: 10,
      slowIntervalMs: 10,
      hashGraceMs: 100,
    });
    // GasFree says it worked but never publishes a hash.
    g.statusQueue = [{ state: "SUCCESS", txnHash: null }];

    const startedAt = Date.now();
    const err = await sendUsdt("TRecipient", 10).catch(e => e);

    expect(err).toBeInstanceOf(TxPendingError);
    // Reported as "almost certainly moved", not as a timeout — the admin must
    // confirm and record it, never re-send.
    expect(err.message).toMatch(/successful but published no/);
    expect(err.message).not.toMatch(/timed out/);
    expect(Date.now() - startedAt).toBeLessThan(GASFREE_POLL.budgetMs / 2);
  });

  it("reports a never-confirmed transfer as pending, not failed", async () => {
    const { sendUsdt, GASFREE_POLL } = await import("./tron");
    Object.assign(GASFREE_POLL, {
      budgetMs: 200,
      fastWindowMs: 200,
      fastIntervalMs: 10,
      slowIntervalMs: 10,
      hashGraceMs: 15_000,
    });
    g.statusQueue = [{ state: "PENDING", txnHash: null }];

    const err = await sendUsdt("TRecipient", 10).catch(e => e);

    expect(err).toBeInstanceOf(TxPendingError);
    expect(err.message).toMatch(/timed out/);
    expect((err as TxPendingError).txHash).toBeNull();
    // Polled repeatedly rather than giving up after one look.
    expect(g.statusPolls).toBeGreaterThan(5);
  });
});
