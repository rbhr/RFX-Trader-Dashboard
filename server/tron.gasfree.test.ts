import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TxFailedError, WalletBusyError } from "./walletErrors";

// A payout returns as soon as the transfer has a hash; settlement is left to
// paymentConfirmer. These pin what that contract has to guarantee for money:
// a hash is returned the moment it exists, `confirmed` is only true when the
// network really said so, a definitive rejection is the one case that throws
// (because it is the one case where nothing was sent), and a transfer with no
// hash yet still comes back as a recordable payout rather than an error.

const g = vi.hoisted(() => ({
  statusQueue: [] as any[],
  lastStatus: null as any,
  statusPolls: 0,
  /** Set to make the submit call return a refusal instead of a transfer id. */
  submitResponse: null as any,
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
  hashWaitMs: 20_000,
  fastWindowMs: 10_000,
  fastIntervalMs: 1_000,
  slowIntervalMs: 3_000,
};

function jsonOk(data: any) {
  return { ok: true, status: 200, json: async () => ({ code: 200, data }) };
}

/** How GasFree refuses: HTTP 200, with a non-200 code in the body. */
function jsonRefusal(message: string, code = 400) {
  return { ok: true, status: 200, json: async () => ({ code, message }) };
}

beforeEach(() => {
  g.statusQueue = [];
  g.lastStatus = null;
  g.statusPolls = 0;
  g.submitResponse = null;

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
      if (url.includes("/gasfree/submit"))
        return g.submitResponse ?? jsonOk({ id: "transfer-1" });
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
  it("returns immediately when the hash is there on the first look", async () => {
    const { sendUsdt } = await import("./tron");
    g.statusQueue = [{ state: "SUCCESS", txnHash: "0xabc" }];

    const startedAt = Date.now();
    await expect(sendUsdt("TRecipient", 10)).resolves.toEqual({
      txHash: "0xabc",
      confirmed: true,
      transferId: "transfer-1",
    });

    // One poll, and it happened before any sleep.
    expect(g.statusPolls).toBe(1);
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });

  it("returns the hash while the transfer is still unconfirmed", async () => {
    // The real shape of a payout: GasFree publishes the hash within a second
    // and only reports success about a minute later. We must not wait for it.
    const { sendUsdt, GASFREE_POLL } = await import("./tron");
    Object.assign(GASFREE_POLL, { fastIntervalMs: 10, slowIntervalMs: 10 });
    g.statusQueue = [
      { state: "WAITING", txnHash: null },
      { state: "INPROGRESS", txnHash: "0xfeed" },
    ];

    await expect(sendUsdt("TRecipient", 10)).resolves.toEqual({
      txHash: "0xfeed",
      confirmed: false,
      transferId: "transfer-1",
    });
    expect(g.statusPolls).toBe(2);
  });

  it("keeps polling while there is no hash at all", async () => {
    const { sendUsdt, GASFREE_POLL } = await import("./tron");
    Object.assign(GASFREE_POLL, { fastIntervalMs: 10, slowIntervalMs: 10 });
    g.statusQueue = [
      { state: "PENDING", txnHash: null },
      { state: "PROCESSING", txnHash: null },
      { state: "SUCCESS", txnHash: "0xdef" },
    ];

    await expect(sendUsdt("TRecipient", 10)).resolves.toEqual({
      txHash: "0xdef",
      confirmed: true,
      transferId: "transfer-1",
    });
    expect(g.statusPolls).toBe(3);
  });

  it("throws TxFailedError on a rejected transfer so no payment is recorded", async () => {
    const { sendUsdt } = await import("./tron");
    g.statusQueue = [{ state: "REJECTED", txnHash: null }];

    await expect(sendUsdt("TRecipient", 10)).rejects.toThrow(TxFailedError);
  });

  it("returns a recordable payout when no hash arrives in time", async () => {
    // Without a hash we still hold the transfer id, so this is a payout to
    // record and settle later — never an error, which would invite a re-send.
    const { sendUsdt, GASFREE_POLL } = await import("./tron");
    Object.assign(GASFREE_POLL, {
      hashWaitMs: 200,
      fastWindowMs: 200,
      fastIntervalMs: 10,
      slowIntervalMs: 10,
    });
    g.statusQueue = [{ state: "PENDING", txnHash: null }];

    await expect(sendUsdt("TRecipient", 10)).resolves.toEqual({
      txHash: null,
      confirmed: false,
      transferId: "transfer-1",
    });
    // Polled repeatedly rather than giving up after one look.
    expect(g.statusPolls).toBeGreaterThan(5);
  });
});

/**
 * GasFree takes one transfer at a time per account, and a payout returns as
 * soon as the hash is published rather than when the transfer settles — so a
 * serial run reaches the next submit while the previous one is still pending
 * and is refused. That refusal is back-pressure: nothing was sent, and the
 * identical payout can be retried. Confusing it with a failure sent an admin
 * looking for a problem that was not there, three times on 2026-10-24.
 */
describe("GasFree back-pressure", () => {
  it("reports a busy wallet as retryable, not as a failed transfer", async () => {
    const { sendUsdt } = await import("./tron");
    g.submitResponse = jsonRefusal("too many pending transfers");

    const err = await sendUsdt("TRecipient", 10).catch(e => e);
    expect(err).toBeInstanceOf(WalletBusyError);
    expect(err).not.toBeInstanceOf(TxFailedError);
  });

  it("says plainly that nothing was sent", async () => {
    const { sendUsdt } = await import("./tron");
    g.submitResponse = jsonRefusal("too many pending transfers");

    const err = await sendUsdt("TRecipient", 10).catch(e => e);
    expect(err.message).toContain("nothing was sent");
  });

  it("matches the refusal whatever case GasFree sends it in", async () => {
    const { sendUsdt } = await import("./tron");
    g.submitResponse = jsonRefusal("Too Many Pending Transfers");

    await expect(sendUsdt("TRecipient", 10)).rejects.toBeInstanceOf(WalletBusyError);
  });

  it("leaves every other refusal a plain error", async () => {
    // Only the pending-transfer limit is retryable. Treating, say, a balance
    // problem as back-pressure would have the caller retry it six times.
    const { sendUsdt } = await import("./tron");
    g.submitResponse = jsonRefusal("insufficient balance");

    const err = await sendUsdt("TRecipient", 10).catch(e => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(WalletBusyError);
    expect(err.message).toContain("insufficient balance");
  });

  it("keeps GasFree's own code on the error, for a sturdier match later", async () => {
    const { sendUsdt } = await import("./tron");
    g.submitResponse = jsonRefusal("insufficient balance", 4001);

    const err: any = await sendUsdt("TRecipient", 10).catch(e => e);
    expect(err.gasFreeCode).toBe(4001);
  });

  it("frees the wallet after a refusal, so the retry can actually go through", async () => {
    // The gate must not be left held by a send that was turned away, or one
    // busy wallet would wedge every later payout until the container restarted.
    const { sendUsdt } = await import("./tron");
    g.submitResponse = jsonRefusal("too many pending transfers");
    await expect(sendUsdt("TRecipient", 10)).rejects.toBeInstanceOf(WalletBusyError);

    g.submitResponse = null;
    g.statusQueue = [{ state: "SUCCESS", txnHash: "0xabc" }];
    await expect(sendUsdt("TRecipient", 10)).resolves.toMatchObject({
      txHash: "0xabc",
    });
  });
});
