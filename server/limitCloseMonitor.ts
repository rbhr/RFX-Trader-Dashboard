/**
 * Limit-Close Monitor
 *
 * MetaCopier enforces two account-level limits on a trader's incubator account
 * by CLOSING the offending trade: Trade Guardrails (total open lots per symbol)
 * and Max open positions. It does that on its own and only writes a line to its
 * project log, so without this monitor the trader sees a trade vanish a second
 * after opening it and nobody is told why.
 *
 * This reads that log, picks out those closes on trader accounts, records each
 * under the `limit_close` log category and tells the trader (in-app + Telegram,
 * in their language).
 *
 * Timing: the close happens within ~1s, far quicker than any poll. MetaCopier's
 * socket has no log stream, but it does push a history/positions update for the
 * account the moment the trade closes — so that push triggers a log read a
 * moment later (typically 2-3s end to end). A 30s poll sits behind it for when
 * the socket is down. Each read is one ~50KB request for the whole project.
 *
 * Note this reports the close; it cannot prevent it. By the time the guardrail
 * closes the incubator trade the copier has usually already opened it on live.
 */
import { getAllActiveMagicNumbers, getAdminSetting, setAdminSetting } from "./db";
import { metaCopierService } from "./metacopier";
import { socketEvents } from "./metacopierSocket";
import { ENV } from "./_core/env";
import { logEvent } from "./logStore";
import { createSystemNotification } from "./systemNotifications";
import { sendTelegramMessage, localizedTelegram } from "./telegram";
import { translate, type Language } from "@shared/i18n";
import { FEATURE_MAX_OPEN_POSITIONS } from "./tradingControls";

const POLL_INTERVAL_MS = 30_000;
// Wait for MetaCopier to have written the log line before reading it.
const SOCKET_TRIGGER_DELAY_MS = 1_500;
const MIN_GAP_BETWEEN_READS_MS = 3_000;
const LOG_LINES_PER_READ = 300;
// After downtime, record older closes but don't message the trader about a
// trade that closed long ago.
const NOTIFY_MAX_AGE_MS = 30 * 60_000;
const CURSOR_KEY = "limit_close_cursor";

export type LimitClose =
  | {
      kind: "lots";
      ticket: string;
      side: "Buy" | "Sell";
      symbol: string;
      volume: number;
      /** Open lots on the symbol including this trade (or just this trade's
       *  size when the guardrail is not aggregated). */
      total: number;
      limit: number;
    }
  | {
      kind: "positions";
      ticket: string;
      side: "Buy" | "Sell";
      symbol: string;
      volume: number;
    };

const LOTS_RE =
  /^Close: (\S+) (Buy|Sell) (\S+) ([\d.]+) \(Trade Guardrails: (?:aggregated )?lot size ([\d.]+)(?: on \S+)? exceeds threshold ([\d.]+)\)/;
const POSITIONS_RE =
  /^Close \(max open positions\): (\S+) (Buy|Sell) (\S+) ([\d.]+)/;

/** Parse one MetaCopier log line; null unless it is a lot- or trade-limit close. */
export function parseLimitClose(text: string): LimitClose | null {
  const lots = LOTS_RE.exec(text);
  if (lots) {
    return {
      kind: "lots",
      ticket: lots[1],
      side: lots[2] as "Buy" | "Sell",
      symbol: lots[3],
      volume: parseFloat(lots[4]),
      total: parseFloat(lots[5]),
      limit: parseFloat(lots[6]),
    };
  }
  const positions = POSITIONS_RE.exec(text);
  if (positions) {
    return {
      kind: "positions",
      ticket: positions[1],
      side: positions[2] as "Buy" | "Sell",
      symbol: positions[3],
      volume: parseFloat(positions[4]),
    };
  }
  return null;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
let triggerTimer: ReturnType<typeof setTimeout> | null = null;
let socketListenerBound = false;
let isRunning = false;
let lastReadAt = 0;
let cursor: string | null = null; // ISO date of the newest log line handled
const handledIds = new Set<string>(); // ties on the cursor's timestamp
let traderAccountIds = new Set<string>();

type Trader = Awaited<ReturnType<typeof getAllActiveMagicNumbers>>[number];

async function notifyTrader(trader: Trader, close: LimitClose): Promise<void> {
  const base = {
    magicNumber: trader.magicNumber,
    symbol: close.symbol,
    volume: String(close.volume),
  };

  let key: "lotLimitClose" | "tradeLimitClose" | "tradeLimitCloseNoMax";
  let params: Record<string, string>;
  if (close.kind === "lots") {
    key = "lotLimitClose";
    params = { ...base, total: String(close.total), limit: String(close.limit) };
  } else {
    // The log line doesn't carry the limit; read it from the account.
    let max: number | null = null;
    try {
      const features = await metaCopierService.getAccountFeatures(trader.mcAccountId!);
      max =
        features.find((f: any) => f?.type?.id === FEATURE_MAX_OPEN_POSITIONS)
          ?.setting?.maxOpenPositions || null;
    } catch {
      max = null;
    }
    key = max ? "tradeLimitClose" : "tradeLimitCloseNoMax";
    params = max ? { ...base, limit: String(max) } : base;
  }

  await createSystemNotification({
    magicNumberId: trader.id,
    key,
    params,
    type: "warning",
  }).catch(e =>
    console.warn(`[LimitCloseMonitor] In-app notify failed for ${trader.name}:`, e)
  );

  if (trader.telegramChatId) {
    const { message, opts } = localizedTelegram(
      (p: Record<string, string>, lang: Language) =>
        translate(lang, `telegram.${key}`, {
          ...p,
          greeting: translate(lang, "telegram.greeting", { name: trader.name }),
        }),
      params,
      trader.language
    );
    await sendTelegramMessage(
      trader.telegramHandle ?? "",
      message,
      trader.telegramChatId,
      opts
    ).catch(e =>
      console.warn(`[LimitCloseMonitor] Telegram to ${trader.name} failed:`, e)
    );
  }
}

async function checkLog(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  lastReadAt = Date.now();

  try {
    // First run ever: start from now, so a fresh deploy doesn't message traders
    // about closes that happened hours or days ago.
    if (cursor === null) {
      cursor = (await getAdminSetting(CURSOR_KEY)) ?? new Date().toISOString();
      await setAdminSetting(CURSOR_KEY, cursor);
    }

    const traders = (await getAllActiveMagicNumbers()).filter(
      t => !t.isAdmin && !!t.mcAccountId
    );
    const byAccount = new Map(traders.map(t => [t.mcAccountId as string, t]));
    traderAccountIds = new Set(byAccount.keys());

    const lines = await metaCopierService.getProjectLogs(LOG_LINES_PER_READ);
    const fresh = lines
      .filter(l => l.date > cursor! || (l.date === cursor && !handledIds.has(l.id)))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (fresh.length === 0) return;

    for (const line of fresh) {
      const close = parseLimitClose(line.text ?? "");
      const trader = close ? byAccount.get(line.accountId) : undefined;
      if (!close || !trader) continue;

      const stale = Date.now() - new Date(line.date).getTime() > NOTIFY_MAX_AGE_MS;
      const what =
        close.kind === "lots"
          ? `open lots on ${close.symbol} reached ${close.total}, limit ${close.limit}`
          : "already at their max open trades";
      logEvent(
        "limit_close",
        `MetaCopier closed ${close.symbol} ${close.side} ${close.volume} on ${trader.name} (${trader.magicNumber}) — ${what} (position ${close.ticket})` +
          (stale ? " — too old to notify the trader" : ""),
        "warn"
      );
      if (!stale) await notifyTrader(trader, close);
    }

    const newest = fresh[fresh.length - 1].date;
    if (newest !== cursor) handledIds.clear();
    for (const l of fresh) if (l.date === newest) handledIds.add(l.id);
    cursor = newest;
    await setAdminSetting(CURSOR_KEY, cursor);
  } catch (error: any) {
    // Transient MetaCopier/DB trouble: the cursor hasn't moved, so the next
    // read picks the same lines up again.
    console.warn(
      "[LimitCloseMonitor] Read failed (will retry):",
      error?.response?.status ?? error?.message ?? error
    );
  } finally {
    isRunning = false;
  }
}

/** A position just closed (or opened) on a trader account: read the log shortly. */
function scheduleSocketTriggeredRead(): void {
  if (triggerTimer) return;
  const wait = Math.max(
    SOCKET_TRIGGER_DELAY_MS,
    MIN_GAP_BETWEEN_READS_MS - (Date.now() - lastReadAt)
  );
  triggerTimer = setTimeout(() => {
    triggerTimer = null;
    void checkLog();
  }, wait);
}

export function startLimitCloseMonitor(): void {
  if (pollTimer) return;
  console.log(
    `[LimitCloseMonitor] Starting — socket-triggered, polling every ${POLL_INTERVAL_MS / 1000}s behind it`
  );
  void checkLog();
  pollTimer = setInterval(() => void checkLog(), POLL_INTERVAL_MS);

  if (ENV.mcSocketEnabled && !socketListenerBound) {
    socketListenerBound = true;
    socketEvents.on("update", (payload: { accountId?: string; type?: string }) => {
      if (
        payload?.type !== "UpdateHistoryDTO" &&
        payload?.type !== "UpdateOpenPositionsDTO"
      ) {
        return;
      }
      if (!payload.accountId || !traderAccountIds.has(payload.accountId)) return;
      scheduleSocketTriggeredRead();
    });
  }
}

export function stopLimitCloseMonitor(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (triggerTimer) {
    clearTimeout(triggerTimer);
    triggerTimer = null;
  }
}
