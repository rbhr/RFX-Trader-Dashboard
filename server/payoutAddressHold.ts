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
 *
 * The same hold covers the account's Telegram chat, because that chat is what
 * authorises an address change: a code sent there is the second factor. An
 * attacker who moves the chat can then change the address with a code they
 * receive themselves, which would satisfy the 2FA rather than defeat it — so
 * moving the channel waits out the same cool-off as moving the address.
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

/**
 * When the hold from moving the account's Telegram chat lifts, or null.
 *
 * The same cool-off, because it protects the same thing. A trader's
 * payout-address change is authorised by a code sent to their Telegram, so
 * whoever controls that chat controls the destination — moving the chat is a
 * step towards moving the address, and gets the same waiting period. Stamped
 * on a rebind and on an admin unlink; a first link does not stamp it, as
 * there was no channel to take over.
 */
export function telegramHoldUntil(
  trader: { telegramChangedAt?: Date | null },
  now: Date = new Date()
): Date | null {
  const changedAt = trader.telegramChangedAt;
  if (!changedAt) return null;
  const until = new Date(changedAt.getTime() + COOL_OFF_MS);
  return until.getTime() > now.getTime() ? until : null;
}

export type PayoutHoldTrader = {
  usdtAddressUpdatedAt?: Date | null;
  telegramChangedAt?: Date | null;
};

/** Which hold is in force, and until when — the later one if both are. */
export function payoutHold(
  trader: PayoutHoldTrader,
  now: Date = new Date()
): { until: Date; what: "address" | "telegram" } | null {
  const address = addressHoldUntil(trader, now);
  const telegram = telegramHoldUntil(trader, now);
  if (address && (!telegram || address.getTime() >= telegram.getTime())) {
    return { until: address, what: "address" };
  }
  if (telegram) return { until: telegram, what: "telegram" };
  return null;
}

/** When any hold on paying this trader lifts, or null if none is in force. */
export function payoutHoldUntil(
  trader: PayoutHoldTrader,
  now: Date = new Date()
): Date | null {
  return payoutHold(trader, now)?.until ?? null;
}

/** The reason a payout list shows for a held trader, or null if not held. */
export function payoutHoldReason(
  trader: PayoutHoldTrader,
  now: Date = new Date()
): string | null {
  const hold = payoutHold(trader, now);
  if (!hold) return null;
  const what = hold.what === "address" ? "Address changed" : "Telegram moved";
  return `${what} — held until ${utcMinute(hold.until)}`;
}

/**
 * Refuses a payout whose destination — or the channel that authorises changing
 * that destination — moved within the cool-off. Throws CONFLICT, the same code
 * the payout-cycle waiting period uses, so the admin UI already renders it as
 * "not yet due" rather than as a failure.
 */
export function assertPayoutSettled(
  trader: { name: string } & PayoutHoldTrader,
  now: Date = new Date()
): void {
  const hold = payoutHold(trader, now);
  if (!hold) return;
  const what =
    hold.what === "address"
      ? "payout address was changed"
      : "Telegram account was moved";
  throw new TRPCError({
    code: "CONFLICT",
    message:
      `${trader.name}'s ${what} less than ` +
      `${USDT_ADDRESS_COOL_OFF_HOURS} hours ago. Payouts are held until ` +
      `${utcMinute(hold.until)}. If that change was not expected, confirm it ` +
      `with the trader before releasing the payout.`,
  });
}
