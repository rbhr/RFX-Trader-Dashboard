import { describe, it, expect } from "vitest";
import { withWalletSendGate, walletSendInFlight } from "./walletSendGate";
import { WalletBusyError } from "./walletErrors";

/**
 * The gate exists so two payouts can never sign against the same nonce. What
 * has to hold for money is narrow but absolute: a second send is refused while
 * one is in flight, the refusal is typed as retryable rather than as a failure,
 * and the gate is released however the first send ends — a gate that leaks on
 * an error would wedge the wallet until the container restarted.
 */

const deferred = () => {
  let resolve!: (v: unknown) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("withWalletSendGate", () => {
  it("lets a single send through and reports its result", async () => {
    await expect(withWalletSendGate("a", async () => "sent")).resolves.toBe("sent");
    expect(walletSendInFlight()).toBeNull();
  });

  it("refuses a second send while the first is still in flight", async () => {
    const first = deferred();
    const running = withWalletSendGate("TRC20 payout of 10.00 USDT", () => first.promise);

    await expect(withWalletSendGate("b", async () => "sent")).rejects.toThrow(
      WalletBusyError
    );

    first.resolve("done");
    await running;
  });

  it("names what it is busy with, and says nothing was sent", async () => {
    const first = deferred();
    const running = withWalletSendGate("TRC20 payout of 10.00 USDT", () => first.promise);

    const err = await withWalletSendGate("b", async () => "x").catch(e => e);
    expect(err.message).toContain("TRC20 payout of 10.00 USDT");
    expect(err.message).toContain("nothing");

    first.resolve("done");
    await running;
  });

  it("never runs the second send at all", async () => {
    const first = deferred();
    const running = withWalletSendGate("a", () => first.promise);

    let ran = false;
    await withWalletSendGate("b", async () => {
      ran = true;
    }).catch(() => {});
    expect(ran).toBe(false);

    first.resolve("done");
    await running;
  });

  it("releases the gate once the first send resolves", async () => {
    const first = deferred();
    const running = withWalletSendGate("a", () => first.promise);
    first.resolve("done");
    await running;

    expect(walletSendInFlight()).toBeNull();
    await expect(withWalletSendGate("b", async () => "sent")).resolves.toBe("sent");
  });

  it("releases the gate when the first send throws, rather than wedging the wallet", async () => {
    await expect(
      withWalletSendGate("a", async () => {
        throw new Error("RPC unreachable");
      })
    ).rejects.toThrow("RPC unreachable");

    expect(walletSendInFlight()).toBeNull();
    await expect(withWalletSendGate("b", async () => "sent")).resolves.toBe("sent");
  });

  it("passes the send's own error through untouched", async () => {
    // A real failure must not be dressed up as back-pressure: one means the
    // payout will never work, the other means try the same one again.
    const original = new Error("transfer reverted");
    const err = await withWalletSendGate("a", async () => {
      throw original;
    }).catch(e => e);
    expect(err).toBe(original);
    expect(err).not.toBeInstanceOf(WalletBusyError);
  });

  it("carries a retry delay for the caller to pace itself with", async () => {
    const first = deferred();
    const running = withWalletSendGate("a", () => first.promise);

    const err = (await withWalletSendGate("b", async () => "x").catch(
      e => e
    )) as WalletBusyError;
    expect(err.retryAfterMs).toBeGreaterThan(0);

    first.resolve("done");
    await running;
  });
});
