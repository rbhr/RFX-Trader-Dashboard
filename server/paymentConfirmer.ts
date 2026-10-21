/**
 * Payout settlement monitor.
 *
 * A wallet payout is recorded the moment it is broadcast, so the admin's
 * request never has to be held open for the network — in a real transfer the
 * hash appeared after 1 second while GasFree took 60 to confirm, and blocking
 * for that minute made a browser time out and report a successful payout as
 * failed.
 *
 * This monitor finishes those payouts: it polls each Pending payment and either
 * marks it Confirmed — crediting the trader's lifetime income and announcing it
 * then, not before — or marks it Failed.
 *
 * The asymmetry is deliberate. A payment is only ever marked Failed on a
 * definitive rejection from the network. An unreachable node, an API error or a
 * transfer that simply has not settled yet all read as "still pending", because
 * reporting a failure we cannot prove would invite re-sending money that has
 * already moved.
 */

import {
  getPendingPayments,
  markPaymentConfirmed,
  markPaymentFailed,
  getMagicNumberById,
  setProfitShareBaseline,
} from "./db";
import { creditAndAnnouncePayment } from "./paymentRecord";
import { getGasFreeTransferStatus, getTronTxStatus } from "./tron";
import { getErc20TxStatus } from "./erc20";
import { notifyOwner } from "./_core/notification";
import { logEvent } from "./logStore";
import type { ConfirmationResult } from "./walletErrors";

const MONITOR_INTERVAL_MS = 15 * 1000;

/**
 * How long a payout may sit unsettled before we start warning about it. It is
 * not failed — it is unexplained, which needs a human either way.
 */
const STALE_AFTER_MS = 30 * 60 * 1000;

let monitorTimer: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;
let lastCheckedAt: Date | null = null;
const staleWarned = new Set<number>();

export function getLastCheckedAt(): Date | null {
  return lastCheckedAt;
}

/** A hash we wrote as a placeholder because the network had not published one. */
function isPlaceholderHash(hash: string): boolean {
  return hash.startsWith("GASFREE-") || hash.startsWith("PENDING-");
}

async function checkSettlement(payment: {
  transactionHash: string;
  confirmTransferId: string | null;
  network: "TRC20" | "ERC20" | null;
}): Promise<ConfirmationResult> {
  if (payment.confirmTransferId) {
    return getGasFreeTransferStatus(payment.confirmTransferId);
  }
  if (isPlaceholderHash(payment.transactionHash)) {
    // No usable reference at all — nothing to look up, so it stays pending for
    // a human to reconcile rather than being guessed either way.
    return {
      settled: "pending",
      txHash: null,
      detail: "no transfer id or transaction hash to look up",
    };
  }
  if (payment.network === "ERC20") {
    return getErc20TxStatus(payment.transactionHash);
  }
  return getTronTxStatus(payment.transactionHash);
}

/**
 * Undoes the profit-share baseline advance of a payout that failed to settle.
 *
 * The payout advanced the baseline when it was broadcast, because leaving it
 * low risks the next run recomputing the same payout and double-paying. If the
 * transfer is then rejected, that advance has to come back off.
 *
 * Only reverted when the trader's baseline is *still* exactly what this payout
 * set it to. If a later payout has since moved it, reverting would clobber that
 * one — so it is left alone and reported instead.
 */
async function revertBaseline(payment: any): Promise<string> {
  if (payment.baselineBefore == null || payment.baselineAfter == null) {
    return "No baseline advance was recorded for this payout, so none was undone.";
  }

  const trader = await getMagicNumberById(payment.magicNumberId);
  const current = parseFloat(trader?.profitShareBaseline ?? "0") || 0;
  const expected = parseFloat(payment.baselineAfter);
  const before = parseFloat(payment.baselineBefore);

  if (Math.abs(current - expected) > 0.005) {
    return (
      `The profit-share baseline was NOT reverted: it is now $${current.toFixed(2)}, ` +
      `not the $${expected.toFixed(2)} this payout set, so something changed it since. ` +
      `It may need lowering to $${before.toFixed(2)} by hand.`
    );
  }

  await setProfitShareBaseline(payment.magicNumberId, before);
  console.log(
    `[PaymentConfirmer] Reverted profit-share baseline for trader ${payment.magicNumberId}: $${expected.toFixed(2)} -> $${before.toFixed(2)}`
  );
  return `The profit-share baseline has been reverted from $${expected.toFixed(2)} to $${before.toFixed(2)}.`;
}

async function settlePayment(payment: any): Promise<void> {
  const result = await checkSettlement(payment);
  const amount = parseFloat(payment.amount);

  if (result.settled === "pending") {
    const ageMs = Date.now() - new Date(payment.createdAt).getTime();
    if (ageMs > STALE_AFTER_MS && !staleWarned.has(payment.id)) {
      staleWarned.add(payment.id);
      const mins = Math.round(ageMs / 60000);
      console.warn(
        `[PaymentConfirmer] Payment ${payment.id} still unsettled after ${mins}m — ${result.detail}`
      );
      logEvent(
        "payment",
        `Payout #${payment.id} of $${amount.toFixed(2)} has been unsettled for ${mins} minutes — ${result.detail}`
      );
      await notifyOwner({
        title: "⏳ Payout still unsettled",
        content: `Payment #${payment.id} of $${amount.toFixed(2)} (${payment.transactionHash}) has not settled after ${mins} minutes. ${result.detail}. The funds may already have moved — reconcile before re-sending.`,
      }).catch(e =>
        console.warn("[PaymentConfirmer] Owner notify failed:", e?.message ?? e)
      );
    }
    return;
  }

  if (result.settled === "failed") {
    await markPaymentFailed(payment.id, result.detail);
    staleWarned.delete(payment.id);
    const trader = await getMagicNumberById(payment.magicNumberId);
    const who = trader ? `${trader.name} (${trader.magicNumber})` : `trader ${payment.magicNumberId}`;
    console.error(
      `[PaymentConfirmer] Payment ${payment.id} FAILED for ${who} — ${result.detail}`
    );
    logEvent(
      "payment",
      `Payout #${payment.id} of $${amount.toFixed(2)} to ${who} failed to settle — ${result.detail}`
    );
    // The trader was never told about this payment and their lifetime income
    // was never credited, so neither has to be walked back. The profit-share
    // baseline was advanced on broadcast, so that does.
    const baselineNote = await revertBaseline(payment);
    logEvent("payment", baselineNote);

    await notifyOwner({
      title: "❌ Payout failed to settle",
      content: `Payment #${payment.id} of $${amount.toFixed(2)} to ${who} was rejected: ${result.detail}. No funds moved and the trader was not notified. ${baselineNote}`,
    }).catch(e =>
      console.warn("[PaymentConfirmer] Owner notify failed:", e?.message ?? e)
    );
    return;
  }

  // Confirmed. Fill in the real hash if we recorded a placeholder, then credit
  // and announce — the first and only point at which the trader is told.
  const realHash =
    result.txHash && isPlaceholderHash(payment.transactionHash)
      ? result.txHash
      : undefined;
  await markPaymentConfirmed(payment.id, realHash);
  staleWarned.delete(payment.id);

  const finalHash = realHash ?? payment.transactionHash;
  console.log(
    `[PaymentConfirmer] Payment ${payment.id} confirmed — ${finalHash}`
  );

  // [TEST] narration marks a testing-mode payout, the same convention
  // previewPayouts uses to keep test runs out of the waiting-period check.
  const isTest = !!payment.narration?.startsWith("[TEST]");

  await creditAndAnnouncePayment({
    magicNumberId: payment.magicNumberId,
    amount,
    transactionHash: finalHash,
    networkFee: parseFloat(payment.networkFee || "0"),
    network: payment.network ?? undefined,
    paymentDate: payment.paymentDate,
    narration: payment.narration ?? undefined,
    silent: isTest,
    skipLifetime: isTest,
  });
}

async function runCheck(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    const pending = await getPendingPayments();
    lastCheckedAt = new Date();
    if (pending.length === 0) return;

    for (const payment of pending) {
      try {
        await settlePayment(payment);
      } catch (err: any) {
        // One bad payment must not stop the others settling.
        console.error(
          `[PaymentConfirmer] Error settling payment ${payment.id}:`,
          err?.message ?? err
        );
      }
    }
  } catch (err: any) {
    console.error("[PaymentConfirmer] Check failed:", err?.message ?? err);
  } finally {
    isRunning = false;
  }
}

export function startPaymentConfirmer(): void {
  if (monitorTimer) return;
  console.log(
    `[PaymentConfirmer] Starting — settling broadcast payouts every ${MONITOR_INTERVAL_MS / 1000}s`
  );
  const tick = () => {
    void runCheck().finally(() => {
      monitorTimer = setTimeout(tick, MONITOR_INTERVAL_MS);
    });
  };
  tick();
}

export function stopPaymentConfirmer(): void {
  if (monitorTimer) {
    clearTimeout(monitorTimer);
    monitorTimer = null;
  }
}

/** Exposed for tests and for an admin-triggered immediate sweep. */
export const _runCheck = runCheck;
