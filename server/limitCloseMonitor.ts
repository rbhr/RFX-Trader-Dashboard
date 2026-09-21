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
 * The same log is the only place a DAILY LOSS LIMIT hit shows up ("Risk limit
 * <id> was hit"): MetaCopier closes everything and blocks new trades until
 * rollover without telling anyone. Those are recorded as `daily` rows on the
 * Risk Limit Breaches screen and the trader is told. Equity ("Actual") breaches
 * stay with breachMonitor, which compares equity with the absolute limit itself.
 *
 * Everything sent to a trader here is copied to the team's alerts channel.
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
import {
  getAllActiveMagicNumbers,
  getAdminSetting,
  setAdminSetting,
  createRiskLimitBreach,
  hasDailyBreachSince,
} from "./db";
import { metaCopierService } from "./metacopier";
import { socketEvents } from "./metacopierSocket";
import { ENV } from "./_core/env";
import { logEvent } from "./logStore";
import { createSystemNotification } from "./systemNotifications";
import {
  sendTelegramMessage,
  localizedTelegram,
  copyToAlertChannel,
} from "./telegram";
import { translate, type Language } from "@shared/i18n";
import {
  FEATURE_MAX_OPEN_POSITIONS,
  RISK_TYPE_ACTUAL,
  RISK_TYPE_DAILY,
} from "./tradingControls";

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

export interface RiskLimitHit {
  riskLimitId: string;
  /** Balance the loss is measured from. */
  reference: number;
  /** Equity when the limit was hit. */
  actual: number;
  loss: number;
  drawdownPercent: number;
  /** Present when it was the limit's absolute equity floor that was crossed. */
  absoluteLimit: number | null;
}

const RISK_HIT_RE =
  /^Risk limit ([0-9a-f-]{36}) was hit: reference ([\d.]+) \w+ <-> actual ([\d.]+) \w+\. Loss: ([\d.]+) \w+\. Drawdown ([\d.]+)%(?: \(absolute limit: ([\d.]+) \w+\))?/;

/** Parse MetaCopier's "Risk limit <id> was hit" line; null for anything else. */
export function parseRiskLimitHit(text: string): RiskLimitHit | null {
  const m = RISK_HIT_RE.exec(text);
  if (!m) return null;
  return {
    riskLimitId: m[1],
    reference: parseFloat(m[2]),
    actual: parseFloat(m[3]),
    loss: parseFloat(m[4]),
    drawdownPercent: parseFloat(m[5]),
    absoluteLimit: m[6] ? parseFloat(m[6]) : null,
  };
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

  await sendToTraderAndChannel(trader, key, params);
}

/** Telegram to the trader (if linked) in their language, and the English copy
 *  to the alerts channel either way. */
async function sendToTraderAndChannel(
  trader: Trader,
  key: "lotLimitClose" | "tradeLimitClose" | "tradeLimitCloseNoMax" | "dailyLossHit",
  params: Record<string, string>
): Promise<void> {
  const { message, english, opts } = localizedTelegram(
    (p: Record<string, string>, lang: Language) =>
      translate(lang, `telegram.${key}`, {
        ...p,
        greeting: translate(lang, "telegram.greeting", { name: trader.name }),
      }),
    params,
    trader.language
  );
  if (trader.telegramChatId) {
    await sendTelegramMessage(
      trader.telegramHandle ?? "",
      message,
      trader.telegramChatId,
      opts
    ).catch(e =>
      console.warn(`[LimitCloseMonitor] Telegram to ${trader.name} failed:`, e)
    );
  }
  await copyToAlertChannel(english);
}

/**
 * A "Risk limit <id> was hit" line on a trader's account. Only the daily loss
 * limit is acted on here; see the file header for why.
 */
async function handleRiskLimitHit(
  trader: Trader,
  hit: RiskLimitHit,
  stale: boolean
): Promise<void> {
  const limits = await metaCopierService.getAccountRiskLimits(trader.mcAccountId!);
  const limit = limits.find((l: any) => l.id === hit.riskLimitId);
  const typeId: number | undefined = limit?.riskType?.id;
  const who = `${trader.name} (${trader.magicNumber})`;
  const detail = `equity $${hit.actual.toFixed(2)}, down ${hit.drawdownPercent}% ($${hit.loss.toFixed(2)}) from $${hit.reference.toFixed(2)}`;

  if (typeId === RISK_TYPE_ACTUAL) {
    // Crossing the absolute floor is breachMonitor's to record and announce.
    // A percentage on an Actual limit is not something the dashboard models
    // (or tells traders about), so just make it visible to the admin.
    if (hit.absoluteLimit === null) {
      logEvent(
        "breach",
        `${who}: MetaCopier hit the PERCENTAGE set on their Actual limit (${((limit?.riskLimit ?? 0) * 100).toFixed(1)}%) — ${detail}. Trades closed. The dashboard only tracks the Actual limit's absolute floor; check that percentage is intended.`,
        "warn"
      );
    }
    return;
  }
  if (typeId !== RISK_TYPE_DAILY) {
    logEvent(
      "breach",
      `${who}: MetaCopier risk limit ${limit?.riskType?.name ?? hit.riskLimitId} was hit — ${detail}. Trades closed.`,
      "warn"
    );
    return;
  }

  // One record per day: MetaCopier can log the same hit again while it holds.
  const since = new Date(Date.now() - 20 * 60 * 60 * 1000);
  if (await hasDailyBreachSince(trader.id, since)) return;

  const allowedLoss = hit.reference * (limit?.riskLimit ?? 0);
  await createRiskLimitBreach({
    magicNumberId: trader.id,
    breachType: "daily",
    equityAtBreach: hit.actual.toFixed(2),
    riskLimitAtBreach: (hit.reference - allowedLoss).toFixed(2),
    referenceBalance: hit.reference.toFixed(2),
    traderNotified: !stale,
    adminNotified: !stale,
    // Lifts by itself at rollover, so there is nothing for an admin to resolve.
    resolvedAt: new Date(),
  });
  logEvent(
    "breach",
    `Daily loss limit: ${who} ${detail} — trades closed until rollover` +
      (stale ? " — too old to notify the trader" : ""),
    "warn"
  );
  if (stale) return;

  const params = {
    magicNumber: trader.magicNumber,
    limit: allowedLoss.toFixed(2),
    equity: hit.actual.toFixed(2),
  };
  await createSystemNotification({
    magicNumberId: trader.id,
    key: "dailyLossHit",
    params,
    type: "warning",
  }).catch(e =>
    console.warn(`[LimitCloseMonitor] In-app notify failed for ${trader.name}:`, e)
  );
  await sendToTraderAndChannel(trader, "dailyLossHit", params);
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
      const trader = byAccount.get(line.accountId);
      if (!trader) continue;
      const stale = Date.now() - new Date(line.date).getTime() > NOTIFY_MAX_AGE_MS;

      const hit = parseRiskLimitHit(line.text ?? "");
      if (hit) {
        await handleRiskLimitHit(trader, hit, stale).catch(e =>
          console.warn(`[LimitCloseMonitor] Risk limit hit for ${trader.name} failed:`, e)
        );
        continue;
      }

      const close = parseLimitClose(line.text ?? "");
      if (!close) continue;

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
