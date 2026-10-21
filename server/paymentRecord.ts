/**
 * Recording and announcing a payout.
 *
 * A wallet payout is recorded the moment it is broadcast, before the network
 * confirms it — so the trader must not be told they have been paid, and their
 * lifetime income must not move, until settlement is confirmed. That split is
 * why this lives apart from the routers: `paymentConfirmer` needs the same
 * credit-and-announce step, and importing it from `routers.ts` would be a
 * cycle.
 */

import {
  createPayment,
  createPaymentReturningId,
  getMagicNumberById,
  incrementLifetimeIncome,
} from "./db";
import { createSystemNotification } from "./systemNotifications";
import {
  sendTelegramMessage,
  buildPaymentMessage,
  localizedTelegram,
} from "./telegram";
import { logEvent } from "./logStore";

export type PaymentDetails = {
  magicNumberId: number;
  amount: number;
  transactionHash: string;
  networkFee?: number;
  network?: "TRC20" | "ERC20";
  paymentDate: Date;
  narration?: string;
  paymentType?: string;
  payoutPeriodFrom?: Date;
  payoutPeriodTo?: Date;
  /** Skip trader notifications (Telegram + in-app) — used for test payouts. */
  silent?: boolean;
  /** Skip incrementing the trader's lifetimeIncome — used for test payouts. */
  skipLifetime?: boolean;
};

/** Rounds to cents, as the decimal(15,2) columns store them. */
function toCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Credits the trader's lifetime income, logs the payment and announces it.
 * Called when a payout is known to have settled — immediately for a manually
 * recorded payment, or later by `paymentConfirmer` for a broadcast one.
 */
export async function creditAndAnnouncePayment(params: PaymentDetails) {
  const {
    magicNumberId,
    transactionHash,
    network,
    paymentDate,
    silent,
    skipLifetime,
  } = params;
  const amount = toCents(params.amount);
  const networkFee = toCents(params.networkFee ?? 0);

  const trader = await getMagicNumberById(magicNumberId);
  if (trader) {
    if (!skipLifetime) {
      await incrementLifetimeIncome(magicNumberId, amount);
    }

    logEvent(
      "payment",
      `Paid $${amount.toFixed(2)}${network ? ` (${network})` : ""} to ${trader.name} (${trader.magicNumber}) — tx ${transactionHash.slice(0, 10)}…`
    );

    if (silent) {
      return;
    }

    await createSystemNotification({
      magicNumberId,
      key: "payment",
      params: {
        magicNumber: trader.magicNumber,
        amount: amount.toFixed(2),
        hash: transactionHash,
      },
      type: "payment",
    });
    console.log(
      `[Payment] In-app notification sent to ${trader.name} for payment of $${amount}`
    );

    if (trader.telegramHandle && trader.telegramChatId) {
      const { message: telegramMsg, opts: telegramOpts } = localizedTelegram(
        buildPaymentMessage,
        {
          traderName: trader.name,
          magicNumber: trader.magicNumber,
          amount,
          network: network || trader.usdtNetwork || "TRC20",
          networkFee,
          transactionHash,
          paymentDate,
        },
        trader.language
      );
      const sent = await sendTelegramMessage(
        trader.telegramHandle,
        telegramMsg,
        trader.telegramChatId,
        telegramOpts
      );
      if (sent) {
        console.log(
          `[Payment] Telegram notification sent to ${trader.telegramHandle}`
        );
      } else {
        console.warn(
          `[Payment] Telegram notification failed for ${trader.telegramHandle} — in-app notification still delivered`
        );
      }
    }
  }
}

/**
 * Records a settled payment and announces it at once. For payments that are
 * confirmed by definition — one the admin made externally and is recording.
 */
export async function recordConfirmedPayment(params: PaymentDetails) {
  const amount = toCents(params.amount);
  const networkFee = toCents(params.networkFee ?? 0);

  await createPayment({
    magicNumberId: params.magicNumberId,
    amount: amount.toFixed(2),
    networkFee: networkFee.toFixed(2),
    transactionHash: params.transactionHash,
    paymentDate: params.paymentDate,
    network: params.network ?? null,
    narration: params.narration ?? null,
    paymentType: params.paymentType ?? "Profit Share",
    payoutPeriodFrom: params.payoutPeriodFrom ?? null,
    payoutPeriodTo: params.payoutPeriodTo ?? null,
    notificationSent: true,
    status: "Confirmed",
    confirmedAt: new Date(),
  });

  await creditAndAnnouncePayment(params);
}

/**
 * Records a payout that has been broadcast but not yet settled, and returns its
 * id. Deliberately does not credit or announce anything: the money may still
 * fail to land, and telling a trader they have been paid is not retractable.
 * `paymentConfirmer` finishes the job.
 */
export async function recordPendingPayment(
  params: PaymentDetails & { confirmTransferId?: string | null }
): Promise<number> {
  const amount = toCents(params.amount);
  const networkFee = toCents(params.networkFee ?? 0);

  return createPaymentReturningId({
    magicNumberId: params.magicNumberId,
    amount: amount.toFixed(2),
    networkFee: networkFee.toFixed(2),
    transactionHash: params.transactionHash,
    paymentDate: params.paymentDate,
    network: params.network ?? null,
    narration: params.narration ?? null,
    paymentType: params.paymentType ?? "Profit Share",
    payoutPeriodFrom: params.payoutPeriodFrom ?? null,
    payoutPeriodTo: params.payoutPeriodTo ?? null,
    notificationSent: false,
    status: "Pending",
    confirmTransferId: params.confirmTransferId ?? null,
  });
}
