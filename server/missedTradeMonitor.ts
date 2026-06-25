/**
 * Server-side Missed-Trade Monitor
 *
 * Each trader places trades on their own demo/incubator MetaCopier account
 * (`mcAccountId`), which copies to a shared live/master account
 * (`liveAccountNumber`). The copier's "Skip position if SL or TP missing"
 * feature (type 31) means a trade opened without the required stop-loss and/or
 * take-profit is NEVER copied to live — so the incubator position is dead weight
 * that misleads the trader into thinking they hold a live position.
 *
 * This monitor runs every minute, finds such offending OPEN trades on incubator
 * accounts, closes them immediately, notifies the trader (Telegram + in-app),
 * and records a `missed_trade` log entry. It only ever closes a trade that
 * violates that trader's OWN copier type-31 rule, so we exactly mirror what the
 * copier itself skipped. Failures are logged and retried next cycle; the trader
 * is notified only on a successful close, so there is no notification spam.
 */

import { getAllActiveMagicNumbers, createNotification } from "./db";
import { metaCopierService } from "./metacopier";
import { sendTelegramMessage, buildMissedTradeMessage } from "./telegram";
import { logEvent } from "./logStore";

const MONITOR_INTERVAL_MS = 1 * 60 * 1000; // 1 minute
let monitorTimer: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;

// Guards against closing the same position twice across overlapping cycles.
const inFlight = new Set<string>();

/** A stop-loss / take-profit value counts as "set" only if it is a positive number. */
function isSet(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/**
 * Pending orders (BuyLimit / SellStop / …) aren't yet live exposure and aren't
 * copied until they trigger, so we leave them alone — only act on filled market
 * trades. Works whether positions came from REST (`mapRestPosition`) or the
 * socket cache (`mapSocketPosition`), both of which carry `orderType`.
 */
function isPendingOrder(p: any): boolean {
  return /limit|stop/i.test(String(p?.orderType ?? ""));
}

/**
 * Given the copier's type-31 `setting` and a position, decide whether the copier
 * would have skipped it (and which protection was missing). Mirrors MetaCopier's
 * own semantics: ifSlNotDefined / ifTpNotDefined gated by logicOperatorTpSl.
 */
function evaluateSkip(
  setting: any,
  position: any
): { skipped: boolean; missing: string } {
  const needSL = setting?.ifSlNotDefined === true;
  const needTP = setting?.ifTpNotDefined === true;
  const op = setting?.logicOperatorTpSl === "AND" ? "AND" : "OR";

  const slViolation = needSL && !isSet(position?.stopLoss);
  const tpViolation = needTP && !isSet(position?.takeProfit);

  const skipped =
    op === "AND" ? slViolation && tpViolation : slViolation || tpViolation;

  const missingParts: string[] = [];
  if (slViolation) missingParts.push("stop-loss");
  if (tpViolation) missingParts.push("take-profit");

  return { skipped, missing: missingParts.join(" and ") || "stop-loss/take-profit" };
}

async function notifyMissedTrade(
  trader: { id: number; name: string; magicNumber: string; telegramHandle: string | null; telegramChatId: string | null },
  symbol: string,
  missing: string
): Promise<void> {
  // In-app notification (the warning enum value already exists).
  await createNotification({
    magicNumberId: trader.id,
    title: `[Magic ${trader.magicNumber}] Trade Not Copied to Live`,
    message: `Your ${symbol} trade had no ${missing}, so it was not copied to live and has been closed on your incubator account. Always set a stop-loss and take-profit.`,
    type: "warning",
  }).catch((e) =>
    console.warn(`[MissedTradeMonitor] In-app notify failed for ${trader.name}:`, e)
  );

  // Telegram (if connected) — graceful fallback, in-app already delivered.
  if (trader.telegramChatId) {
    const msg = buildMissedTradeMessage({
      traderName: trader.name,
      magicNumber: trader.magicNumber,
      symbol,
      missing,
    });
    await sendTelegramMessage(trader.telegramHandle ?? "", msg, trader.telegramChatId).catch(
      (e) => console.warn(`[MissedTradeMonitor] Telegram to ${trader.name} failed:`, e)
    );
  }
}

async function checkAllTraders(): Promise<void> {
  if (isRunning) return; // Prevent overlapping runs
  isRunning = true;

  // Cache per cycle so traders sharing a master fetch its copiers only once.
  const copiersByLiveId = new Map<string, any[]>();
  const liveIdByLogin = new Map<string, string | null>();

  try {
    const traders = await getAllActiveMagicNumbers();

    for (const trader of traders) {
      if (!trader.mcAccountId || !trader.liveAccountNumber) continue;

      try {
        // 1. Open positions on the incubator account.
        const positions = await metaCopierService.getOpenPositionsFromAccount(
          trader.mcAccountId
        );

        // 2. Candidates: open market trades missing SL and/or TP.
        const candidates = positions.filter(
          (p: any) =>
            !isPendingOrder(p) &&
            (!isSet(p.stopLoss) || !isSet(p.takeProfit))
        );
        if (candidates.length === 0) continue;

        // 3. Resolve this trader's copier type-31 rule (cached per master).
        let liveId = liveIdByLogin.get(trader.liveAccountNumber);
        if (liveId === undefined) {
          liveId = await metaCopierService.getAccountIdByLoginNumber(
            trader.liveAccountNumber
          );
          liveIdByLogin.set(trader.liveAccountNumber, liveId);
        }
        if (!liveId) continue; // Can't resolve master — fail safe, don't close.

        let copiers = copiersByLiveId.get(liveId);
        if (!copiers) {
          copiers = await metaCopierService.getCopiersByAccount(liveId);
          copiersByLiveId.set(liveId, copiers);
        }

        const copier = copiers.find(
          (c: any) =>
            c.fromAccountId === trader.mcAccountId ||
            String(c.customMagicNumber) === String(trader.magicNumber)
        );
        if (!copier) continue; // No copier on this master — fail safe.

        const features = await metaCopierService.getCopierFeatures(liveId, copier.id);
        const skipFeature = features.find((f: any) => f?.type?.id === 31);
        if (!skipFeature) continue; // Copier doesn't require SL/TP — leave alone.

        // 4. Close each position the copier would have skipped.
        for (const position of candidates) {
          const { skipped, missing } = evaluateSkip(skipFeature.setting, position);
          if (!skipped) continue;

          const posId = String(position.id);
          if (inFlight.has(posId)) continue;
          inFlight.add(posId);

          try {
            await metaCopierService.closePosition(trader.mcAccountId, posId);
            logEvent(
              "missed_trade",
              `Closed ${position.symbol} on ${trader.name} (${trader.magicNumber}) — missing ${missing}, not copied to live (position ${posId})`,
              "warn"
            );
            await notifyMissedTrade(trader, String(position.symbol ?? ""), missing);
          } catch (closeErr: any) {
            logEvent(
              "missed_trade",
              `Failed to close ${position.symbol} on ${trader.name} (${trader.magicNumber}) position ${posId}: ${closeErr?.response?.status ?? closeErr?.message ?? "unknown error"} — will retry`,
              "error"
            );
          } finally {
            inFlight.delete(posId);
          }
        }
      } catch (traderError: any) {
        // One trader's transient error must not stop the sweep.
        const status = traderError?.response?.status;
        console.warn(
          `[MissedTradeMonitor] Skipped ${trader.name} (${trader.magicNumber}): ` +
            (status
              ? `MetaCopier returned ${status} (transient, will retry next cycle)`
              : traderError?.message || "unknown error")
        );
      }
    }
  } catch (error) {
    console.error("[MissedTradeMonitor] Fatal error during check:", error);
  } finally {
    isRunning = false;
  }
}

export function startMissedTradeMonitor(): void {
  if (monitorTimer) return; // Already started

  console.log("[MissedTradeMonitor] Starting — checking every 1 minute");

  // Run immediately on startup, then on interval.
  checkAllTraders();

  monitorTimer = setInterval(checkAllTraders, MONITOR_INTERVAL_MS);
}

export function stopMissedTradeMonitor(): void {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
    console.log("[MissedTradeMonitor] Stopped");
  }
}
