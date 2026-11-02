import { TRPCError } from "@trpc/server";

import { USDT_ADDRESS_COOL_OFF_HOURS } from "@shared/const";

/**
 * A payout's destination is whatever `magic_numbers.usdtAddress` holds at the
 * moment the money moves — so an account that can change its own address can
 * point a payout anywhere. On 2026-11-02 that is exactly what happened: the
 * Administrator row's address was pointed at an attacker's wallet, 2030 USDT
 * was sent, and the address was put back. The whole sequence took 234 seconds.
 *
 * A code and a log line would only have made that noisy. What makes it
 * impossible is time: nothing pays out to an address that moved recently, so
 * the money cannot leave before the trader has been told their destination
 * changed and can say it was not them.
 *
 * Enforced at send time rather than at change time, because the send is where
 * the address is read.
 */

const COOL_OFF_MS = USDT_ADDRESS_COOL_OFF_HOURS * 60 * 60 * 1000;

/** A date as "YYYY-MM-DD HH:MM", which is how payout errors quote the hold. */
function utcMinute(d: Date): string {
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/**
 * When the hold on a freshly-changed payout address lifts, or null when there
 * is none — either because the address has never moved (`null` for every row
 * written before this existed) or because the cool-off has already passed.
 */
export function addressHoldUntil(
  trader: { usdtAddressUpdatedAt?: Date | null },
  now: Date = new Date()
): Date | null {
  const changedAt = trader.usdtAddressUpdatedAt;
  if (!changedAt) return null;
  const until = new Date(changedAt.getTime() + COOL_OFF_MS);
  return until.getTime() > now.getTime() ? until : null;
}

/** The reason a payout list shows for a held trader, or null if not held. */
export function addressHoldReason(
  trader: { usdtAddressUpdatedAt?: Date | null },
  now: Date = new Date()
): string | null {
  const until = addressHoldUntil(trader, now);
  return until ? `Address changed — held until ${utcMinute(until)}` : null;
}

/**
 * Refuses a payout whose destination address changed within the cool-off.
 * Throws CONFLICT, the same code the payout-cycle waiting period uses, so the
 * admin UI already renders it as "not yet due" rather than as a failure.
 */
export function assertAddressSettled(
  trader: { name: string; usdtAddressUpdatedAt?: Date | null },
  now: Date = new Date()
): void {
  const until = addressHoldUntil(trader, now);
  if (!until) return;
  throw new TRPCError({
    code: "CONFLICT",
    message:
      `${trader.name}'s payout address was changed less than ` +
      `${USDT_ADDRESS_COOL_OFF_HOURS} hours ago. Payouts to it are held until ` +
      `${utcMinute(until)}. If that change was not expected, confirm it with ` +
      `the trader before releasing the payout.`,
  });
}
