/**
 * Second-opinion check before an equity reading is treated as a permanent
 * risk-limit breach.
 *
 * On 2026-10-15 a single account-information snapshot (socket push) reported
 * Varun's equity as -$6,113.64 on a ~$2,550 demo account with 0.03 lots open.
 * MetaCopier never closed anything and its own risk limit never fired, but the
 * breach monitor took the one sample at face value: breach row, Telegram,
 * alerts channel, in-app notification. So now:
 *
 *   1. A negative equity is rejected outright — Exness demo/incubator accounts
 *      stop out before equity goes below zero, so a negative figure is a bad
 *      feed, never a trade.
 *   2. Any other below-limit reading must be confirmed by a FRESH direct API
 *      read (never the socket cache). Only when that second reading is also
 *      below the limit is the breach recorded, and the confirmed figure is
 *      what gets stored and announced.
 */

export type FreshReading = { equity: number } | null;

export type BreachVerdict =
  | { ok: true; equity: number }
  | { ok: false; reason: string };

const money = (n: number) => `$${n.toFixed(2)}`;

/** Why a single equity reading can't be trusted, or null if it looks sane. */
export function implausibleEquityReason(equity: number): string | null {
  if (!Number.isFinite(equity)) return "equity is not a number";
  if (equity < 0) return `negative equity ${money(equity)} is a bad feed, not a trade`;
  return null;
}

/**
 * Confirm that `observedEquity` really is below `riskLimit` by taking a fresh
 * reading. `fetchFresh` must bypass every cache. Never throws.
 */
export async function confirmEquityBreach(opts: {
  observedEquity: number;
  riskLimit: number;
  fetchFresh: () => Promise<FreshReading>;
}): Promise<BreachVerdict> {
  const { observedEquity, riskLimit } = opts;

  const bad = implausibleEquityReason(observedEquity);
  if (bad) return { ok: false, reason: bad };
  if (observedEquity >= riskLimit) {
    return { ok: false, reason: `reading ${money(observedEquity)} is not below limit ${money(riskLimit)}` };
  }

  let fresh: FreshReading;
  try {
    fresh = await opts.fetchFresh();
  } catch (e: any) {
    return { ok: false, reason: `could not confirm — fresh read failed (${e?.message ?? "unknown error"})` };
  }

  const freshEquity = Number(fresh?.equity);
  if (fresh == null || !Number.isFinite(freshEquity) || freshEquity === 0) {
    return { ok: false, reason: "could not confirm — fresh read returned no usable equity" };
  }
  const freshBad = implausibleEquityReason(freshEquity);
  if (freshBad) return { ok: false, reason: `fresh read also bad: ${freshBad}` };
  if (freshEquity >= riskLimit) {
    return {
      ok: false,
      reason: `fresh read ${money(freshEquity)} is above limit ${money(riskLimit)} (first reading ${money(observedEquity)} was a glitch)`,
    };
  }
  return { ok: true, equity: freshEquity };
}
