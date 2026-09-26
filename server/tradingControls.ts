/**
 * Per-trader trading controls that live in MetaCopier rather than our DB:
 * max daily loss, daily profit limit, news trading, total open lots and max
 * open trades. Pure helpers only — the MetaCopier calls are in metacopier.ts.
 *
 * Reference configuration: "RFX - Bisma - 81279" and her copier into
 * "01 exness Master 8220" (checked 2026-09-19).
 */

/** MetaCopier riskType ids (GET /types/riskTypes). */
export const RISK_TYPE_DAILY = 1; // "Balance-equity daily" — the max daily loss
export const RISK_TYPE_ACTUAL = 4; // "Actual" — the absolute, permanent stopout

/** MetaCopier feature type ids (GET /types/featureTypes). */
export const FEATURE_DAILY_PROFIT_TARGET = 10;
export const FEATURE_MAX_OPEN_POSITIONS = 17;
/** Copier-level: total open lots of the copier, overall or per symbol. */
export const FEATURE_MAXIMUM_LOT = 18;
export const FEATURE_SKIP_POSITION = 31;
export const FEATURE_TRADE_GUARDRAILS = 37;
export const FEATURE_NEWS_FILTER = 49;

/** Only the time of day is read by MetaCopier; the date is ignored. */
export const DAILY_RESET_TIME = "2023-12-30T00:00:00.000Z";

/** Starting values for a newly created incubator account. */
export const DEFAULT_DAILY_LOSS_PERCENT = 4;
export const DEFAULT_DAILY_PROFIT_PERCENT = 5;

/** Settings for a new daily profit target (type 10); the percent is added by the caller. */
export const DAILY_PROFIT_TARGET_DEFAULTS = {
  dailyRelativeProfitTarget: 0,
  dailyAbsoluteProfitTarget: 0,
  resetTime: DAILY_RESET_TIME,
  autoResetIfBalanceIsBelow: false,
  // Pause rather than close: open trades run on, new ones are blocked.
  pauseInsteadOfClose: true,
  resetOnBalanceChange: true,
  trackByOpenDate: false,
};

/** Settings for a new trade guardrail (type 37); the lot threshold is added by the caller. */
export const TRADE_GUARDRAILS_DEFAULTS = {
  enabled: true,
  // The threshold caps the total lots open per symbol, not each trade.
  aggregatePerSymbol: true,
  maxOpenTimeSeconds: 0,
  symbolsConfiguration: {},
};

/** Settings for a new max-open-positions feature (type 17). */
export const MAX_OPEN_POSITIONS_DEFAULTS = {
  maxPositionsInTimeWindow: 0,
  timeWindowSeconds: 0,
  symbolsConfiguration: {},
};

/** News filter (type 49) as configured on the reference copier. */
export const NEWS_FILTER_DEFAULTS = {
  enableNewsFilter: true,
  events: {
    minImpact: "HIGH",
    includeGlobalEvents: true,
    includeHolidays: false,
    categoryBlacklist: ["bnd"],
    currencyWhitelist: [],
    eventTitleBlacklist: [],
    eventTitleWhitelist: [],
    symbolMappings: [],
  },
  blackoutBeforeMinutes: 60,
  blackoutAfterMinutes: 60,
  skipMarketOrders: true,
  skipPendingOrders: true,
  blockModifications: true,
  logSkippedTrades: true,
};

interface RiskLimitLike {
  id?: string;
  active?: boolean;
  riskType?: { id?: number } | null;
  riskLimit?: number | null;
  absoluteRiskLimit?: number | null;
}

/**
 * The absolute "Actual" limit — the equity floor that permanently breaches the
 * account. Never match on `absoluteRiskLimit != null`: the daily limit carries
 * that field too, and MetaCopier often lists the daily limit first.
 */
export function findActualRiskLimit<T extends RiskLimitLike>(
  limits: T[] | null | undefined
): T | undefined {
  return limits?.find(l => l.active && l.riskType?.id === RISK_TYPE_ACTUAL);
}

/** The "Balance-equity daily" limit, active or not (so it can be re-enabled). */
export function findDailyRiskLimit<T extends RiskLimitLike>(
  limits: T[] | null | undefined
): T | undefined {
  return (
    limits?.find(l => l.active && l.riskType?.id === RISK_TYPE_DAILY) ??
    limits?.find(l => l.riskType?.id === RISK_TYPE_DAILY)
  );
}

export interface DailyLossLimit {
  /** e.g. 4 for 4% */
  percent: number;
  /** Dollars the trader may lose today. */
  maxLossAmount: number;
  /** Equity at which the daily limit closes all trades. */
  breachEquity: number;
}

/**
 * Today's max daily loss. MetaCopier measures it from the balance it recorded
 * at the daily reset (`referenceBalance` in riskLimitsStatus); until the first
 * reset has happened that is missing, so fall back to the current balance.
 */
export function computeDailyLossLimit(
  limits: RiskLimitLike[] | null | undefined,
  riskLimitsStatus:
    | Array<{ riskLimitId?: string; referenceBalance?: number | null }>
    | null
    | undefined,
  currentBalance: number | null | undefined
): DailyLossLimit | null {
  const limit = limits?.find(
    l => l.active && l.riskType?.id === RISK_TYPE_DAILY
  );
  const fraction = limit?.riskLimit ?? 0;
  if (!limit || fraction <= 0) return null;

  const status = riskLimitsStatus?.find(s => s.riskLimitId === limit.id);
  const reference = status?.referenceBalance ?? currentBalance;
  if (reference == null || reference <= 0) return null;

  const maxLossAmount = Math.round(reference * fraction * 100) / 100;
  return {
    percent: Math.round(fraction * 10000) / 100,
    maxLossAmount,
    breachEquity: Math.round((reference - maxLossAmount) * 100) / 100,
  };
}

export interface NewsWindow {
  eventId: string;
  title: string;
  currencyCode: string;
  blackoutFromUtc: string;
  blackoutToUtc: string;
}

export interface NewsBlock {
  symbols: string[];
  title: string;
  /** ISO time the last overlapping blackout ends. */
  untilUtc: string;
}

/** The blackout in force at `nowMs`, merged across symbols, or null if none. */
export function findActiveNewsBlock(
  symbols: Array<{ symbol: string; windows: NewsWindow[] }>,
  nowMs: number
): NewsBlock | null {
  const blocked: string[] = [];
  let title = "";
  let untilMs = 0;
  for (const s of symbols) {
    const active = s.windows.filter(
      w =>
        new Date(w.blackoutFromUtc).getTime() <= nowMs &&
        nowMs < new Date(w.blackoutToUtc).getTime()
    );
    if (active.length === 0) continue;
    blocked.push(s.symbol);
    for (const w of active) {
      const end = new Date(w.blackoutToUtc).getTime();
      if (end > untilMs) {
        untilMs = end;
        title = w.title;
      }
    }
  }
  if (blocked.length === 0) return null;
  return { symbols: blocked, title, untilUtc: new Date(untilMs).toISOString() };
}

export interface CopierLimits {
  /** Total open lots the copier may hold, per symbol. 0 = no limit. */
  maximumLot: number;
  /** Open positions the copier may hold. 0 = no limit. */
  maxOpenPositions: number;
}

/**
 * The copier-level limits that mirror a trader's account limits.
 *
 * The account guardrail measures the trader's own lots; the copier's Maximum
 * lot measures the COPIED lots. So the trader's figure is passed through the
 * copy settings: at 2x a 0.05 limit becomes 0.10 on live, at a fixed lot every
 * trade is the same size so the cap is fixed lot × max open trades (no limit
 * on lots when there is no limit on trades). Max open positions carries over
 * unchanged. Everything is rounded to 2 decimals, the broker's lot step.
 */
export function copierLimitsFor(
  account: { maxTotalLots: number; maxOpenTrades: number },
  scaling: { mode: "multiplier" | "fixed"; value: number }
): CopierLimits {
  const round = (n: number) => Math.round(n * 100) / 100;
  let maximumLot = 0;
  if (scaling.mode === "fixed") {
    if (account.maxOpenTrades > 0) {
      maximumLot = round(scaling.value * account.maxOpenTrades);
    }
  } else if (account.maxTotalLots > 0) {
    // Never round a live limit down to nothing.
    maximumLot = Math.max(0.01, round(account.maxTotalLots * scaling.value));
  }
  return { maximumLot, maxOpenPositions: account.maxOpenTrades };
}

/**
 * Profit share accrued since the last payout. Mirrors the payout run:
 * max(0, cumulative profit - high-water-mark baseline) x share. A winning week
 * that has not yet recovered earlier losses therefore shows $0.
 */
export function computeAccruedProfitShare(
  cumulativeProfit: number,
  baseline: number,
  profitShare: number
): number {
  return Math.max(0, cumulativeProfit - baseline) * profitShare;
}
