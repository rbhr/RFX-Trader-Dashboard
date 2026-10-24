import { WalletBusyError } from "./walletErrors";

/**
 * One wallet broadcast at a time, across every network and every trader.
 *
 * Both send paths sign against a nonce they read first — GasFree reads it from
 * its own API, ethers reads it from the chain — so two overlapping sends mean
 * two signatures over the same nonce. On GasFree the second is rejected; on EVM
 * one transaction silently replaces the other, which leaves a payout recorded
 * as broadcast that never lands and a trader unpaid until somebody notices.
 *
 * `routers.ts` already refuses a second payout for the same trader, but that
 * guard is keyed by trader: two browser tabs, or two admins, can still pay two
 * *different* traders at the same moment. This gate is the one that covers the
 * wallet itself.
 *
 * It refuses rather than queues, which is the part worth understanding. A
 * queued request would be held open while it waited, and holding a payout
 * request open is exactly what v4.2.0 exists to stop: the browser gives up at
 * about sixty seconds and reports a payout that succeeded as failed, and the
 * natural response to that is to send again. Refusing immediately keeps every
 * request short and leaves the waiting to the caller, which can afford it.
 *
 * The gate is per-process. One container serves every admin, so that is the
 * whole wallet; it would stop covering it the day the app runs two replicas.
 */

let inFlight: string | null = null;

export async function withWalletSendGate<T>(
  label: string,
  send: () => Promise<T>
): Promise<T> {
  if (inFlight) {
    throw new WalletBusyError(
      `The wallet is already broadcasting a transfer (${inFlight}), so nothing ` +
        `was sent. Retry once it has cleared.`
    );
  }
  inFlight = label;
  try {
    return await send();
  } finally {
    inFlight = null;
  }
}

/** What the gate currently holds, for tests and diagnostics. */
export function walletSendInFlight(): string | null {
  return inFlight;
}
