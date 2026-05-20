/**
 * Trailing Risk Limit Monitor
 *
 * Periodically checks traders with trailing risk limits enabled.
 * When a trader has no open positions and their balance has grown,
 * raises the MC risk limit to (balance - trailingRiskLimit) to lock in gains.
 */

import {
  getTrailingRiskLimitTraders,
  getAdminSetting,
  createNotification,
} from "./db";
import { metaCopierService } from "./metacopier";
import {
  sendTelegramMessage,
  buildTrailingRiskLimitMessage,
} from "./telegram";

const DEFAULT_INTERVAL_MINUTES = 5;
let monitorTimeout: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;
let lastCheckedAt: Date | null = null;

export function getTrailingLastCheckedAt(): Date | null {
  return lastCheckedAt;
}

async function getIntervalMs(): Promise<number> {
  const val = await getAdminSetting("trailing_risk_limit_interval_minutes");
  const minutes = val ? parseInt(val, 10) : DEFAULT_INTERVAL_MINUTES;
  return (isNaN(minutes) || minutes < 1 ? DEFAULT_INTERVAL_MINUTES : minutes) * 60 * 1000;
}

async function checkTrailingRiskLimits(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  try {
    const traders = await getTrailingRiskLimitTraders();

    for (const trader of traders) {
      if (!trader.mcAccountId || !trader.trailingRiskLimit) continue;

      try {
        const openPositions = await metaCopierService.getOpenPositionsFromAccount(
          trader.mcAccountId
        );
        if (openPositions.length > 0) continue;

        const [accountInfo, limits] = await Promise.all([
          metaCopierService.getAccountInfoById(trader.mcAccountId),
          metaCopierService.getAccountRiskLimits(trader.mcAccountId),
        ]);

        const balance = accountInfo?.balance;
        if (balance == null || balance === 0) continue;

        const activeLimit = limits?.find(
          (l: any) => l.active && l.absoluteRiskLimit != null
        );
        if (!activeLimit) continue;

        const currentAbsoluteLimit = activeLimit.absoluteRiskLimit as number;
        const buffer = parseFloat(trader.trailingRiskLimit);
        const newLimit = balance - buffer;

        if (newLimit > currentAbsoluteLimit) {
          await metaCopierService.updateAccountRiskLimit(
            trader.mcAccountId,
            activeLimit.id,
            newLimit
          );

          console.log(
            `[TrailingRiskLimit] Updated ${trader.name} (${trader.magicNumber}): $${currentAbsoluteLimit.toFixed(2)} → $${newLimit.toFixed(2)} (balance: $${balance.toFixed(2)}, buffer: $${buffer.toFixed(2)})`
          );

          await createNotification({
            magicNumberId: trader.id,
            title: "Risk Limit Updated",
            message: `New Stopout $${newLimit.toFixed(2)}. Manage risk and lot size accordingly.`,
            type: "info",
          });

          if (trader.telegramChatId) {
            const msg = buildTrailingRiskLimitMessage({
              traderName: trader.name,
              newStopout: newLimit,
            });
            await sendTelegramMessage(
              trader.telegramHandle ?? "",
              msg,
              trader.telegramChatId
            ).catch((e) =>
              console.warn(`[TrailingRiskLimit] Telegram to ${trader.name} failed:`, e)
            );
          }
        }
      } catch (traderError) {
        console.warn(
          `[TrailingRiskLimit] Error checking ${trader.name} (${trader.magicNumber}):`,
          traderError
        );
      }
    }
  } catch (error) {
    console.error("[TrailingRiskLimit] Fatal error during check:", error);
  } finally {
    isRunning = false;
    lastCheckedAt = new Date();
    scheduleNext();
  }
}

async function scheduleNext(): Promise<void> {
  const intervalMs = await getIntervalMs();
  monitorTimeout = setTimeout(checkTrailingRiskLimits, intervalMs);
}

export function startTrailingRiskLimitMonitor(): void {
  if (monitorTimeout) return;
  console.log("[TrailingRiskLimit] Starting monitor");
  checkTrailingRiskLimits();
}

export function stopTrailingRiskLimitMonitor(): void {
  if (monitorTimeout) {
    clearTimeout(monitorTimeout);
    monitorTimeout = null;
    console.log("[TrailingRiskLimit] Stopped");
  }
}
