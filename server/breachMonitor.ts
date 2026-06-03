/**
 * Server-side Risk Limit Breach Monitor
 *
 * Runs every 5 minutes and checks all active traders' equity against their
 * MetaCopier risk limits. Creates breach records and sends notifications
 * automatically — independent of whether the trader is logged in.
 */

import {
  getAllActiveMagicNumbers,
  getActiveBreachByMagicNumberId,
  createRiskLimitBreach,
  createNotification,
} from "./db";
import { metaCopierService } from "./metacopier";
import {
  sendTelegramMessage,
  buildRiskLimitBreachMessage,
  buildAdminRiskLimitAlertMessage,
} from "./telegram";
import { notifyOwner } from "./_core/notification";

const MONITOR_INTERVAL_MS = 1 * 60 * 1000; // 1 minute
let monitorTimer: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;
let lastCheckedAt: Date | null = null;

export function getLastCheckedAt(): Date | null {
  return lastCheckedAt;
}

async function checkAllTraders(): Promise<void> {
  if (isRunning) return; // Prevent overlapping runs
  isRunning = true;

  try {
    const traders = await getAllActiveMagicNumbers();

    for (const trader of traders) {
      if (!trader.mcAccountId) continue;

      try {
        // Fetch equity and risk limits in parallel
        const [accountInfo, limits] = await Promise.all([
          metaCopierService.getAccountInfoById(trader.mcAccountId),
          metaCopierService.getAccountRiskLimits(trader.mcAccountId),
        ]);

        const equity = accountInfo?.equity;
        if (equity == null || equity === 0) continue; // Skip null/zero — zero usually means API returned bad data

        // Find the first active absolute risk limit
        const activeLimit = limits?.find(
          (l: any) => l.active && l.absoluteRiskLimit != null
        );
        if (!activeLimit) continue;

        const riskLimit = activeLimit.absoluteRiskLimit as number;

        if (equity < riskLimit) {
          // Check if there's already an active (unresolved) breach for this trader
          const existingBreach = await getActiveBreachByMagicNumberId(trader.id);
          if (existingBreach) continue; // Already recorded — skip

          console.log(
            `[BreachMonitor] Breach detected for trader ${trader.name} (Magic: ${trader.magicNumber}) — equity: $${equity.toFixed(2)}, limit: $${riskLimit.toFixed(2)}`
          );

          // Record the breach
          await createRiskLimitBreach({
            magicNumberId: trader.id,
            equityAtBreach: String(equity),
            riskLimitAtBreach: String(riskLimit),
          });

          // In-app notification for the trader
          await createNotification({
            magicNumberId: trader.id,
            title: `[Magic ${trader.magicNumber}] ⚠️ Risk Limit Breached`,
            message: `Your incubator account equity dropped to $${equity.toFixed(2)}, below your risk limit of $${riskLimit.toFixed(2)}. All trades have been closed. Please contact an admin to re-enable trading.`,
            type: "warning",
          });

          // Telegram notification to the trader (if connected)
          if (trader.telegramChatId) {
            const msg = buildRiskLimitBreachMessage({ traderName: trader.name, magicNumber: trader.magicNumber, equity, riskLimit });
            await sendTelegramMessage(trader.telegramHandle ?? "", msg, trader.telegramChatId).catch(
              (e) => console.warn(`[BreachMonitor] Telegram to trader failed:`, e)
            );
          }

          // Admin notification
          await notifyOwner({
            title: "⚠️ Risk Limit Breach Detected",
            content: `Trader ${trader.name} (Magic: ${trader.magicNumber}) breached their risk limit. Equity: $${equity.toFixed(2)}, Limit: $${riskLimit.toFixed(2)}.`,
          }).catch((e) => console.warn(`[BreachMonitor] Owner notify failed:`, e));
        }
      } catch (traderError: any) {
        // Don't let one trader's error stop the whole monitor. MetaCopier's
        // /information endpoint intermittently fails when a demo account is
        // momentarily disconnected — transient and harmless (trader skipped
        // this cycle) — so log a concise line, not a full AxiosError stack.
        const status = traderError?.response?.status;
        console.warn(
          `[BreachMonitor] Skipped ${trader.name} (${trader.magicNumber}): ` +
            (status
              ? `MetaCopier returned ${status} (transient, will retry next cycle)`
              : traderError?.message || "unknown error")
        );
      }
    }
  } catch (error) {
    console.error("[BreachMonitor] Fatal error during check:", error);
  } finally {
    isRunning = false;
    lastCheckedAt = new Date();
  }
}

export function startBreachMonitor(): void {
  if (monitorTimer) return; // Already started

  console.log("[BreachMonitor] Starting — checking every 1 minute");

  // Run immediately on startup, then on interval
  checkAllTraders();

  monitorTimer = setInterval(checkAllTraders, MONITOR_INTERVAL_MS);
}

export function stopBreachMonitor(): void {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
    console.log("[BreachMonitor] Stopped");
  }
}
