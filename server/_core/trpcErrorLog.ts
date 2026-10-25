/**
 * Formats a failed tRPC call for the log, and keeps probe noise out of it.
 *
 * Every procedure failure is logged, because before that existed a procedure
 * that threw returned a bare 500 and said nothing — which is how the P&L panel
 * came to be erroring rather than merely slow with nobody noticing.
 *
 * That only works if the log stays readable. Something outside the app probes
 * `/api/trpc/` for procedures we do not have — `settings.ai` and the empty path
 * arrive every 30 seconds — and at that rate they bury the failures worth
 * seeing. They are certainly not our own client: a tRPC client is typed against
 * this router, so it cannot ask for a procedure that does not exist.
 *
 * So an unknown path is reported the first time and then only counted, with a
 * running total on every thousandth, rather than dropped silently.
 *
 * A second kind of noise is a failure that is not one: a busy payout wallet
 * answers TOO_MANY_REQUESTS to say "wait and send this again", the client does
 * exactly that, and the payout goes through. Logging that at error level put a
 * line reading `mutation admin.processProfitSharePayout failed` in the console
 * of a payout run that worked perfectly, which is how a console you grep for
 * errors stops being worth grepping. Those are reported as what they are, at
 * warn.
 */

import { WalletBusyError } from "../walletErrors";

const UNKNOWN_PATH_REPORT_EVERY = 1000;

const unknownPathCounts = new Map<string, number>();

export type TrpcErrorForLog = {
  code: string;
  message: string;
  cause?: unknown;
};

/** A line to log and how loudly to log it. */
export type TrpcLogLine = {
  line: string;
  level: "warn" | "error";
};

/** True for "this procedure does not exist", as opposed to one that failed. */
function isUnknownProcedure(error: TrpcErrorForLog): boolean {
  return (
    error.code === "NOT_FOUND" &&
    error.message.startsWith("No procedure found on path")
  );
}

/**
 * True when the server declined *for now* and the client can simply retry.
 *
 * Keyed on the cause being a `WalletBusyError`, not on the TOO_MANY_REQUESTS
 * code, and that distinction matters: the app's other three uses of that code
 * are the brute-force caps on login, 2FA verification and password-reset
 * requests. A burst of those is evidence of an attack and has to stay loud.
 * Demoting by code would have quietly turned the console record of a
 * brute-force attempt down to warn.
 */
function isBackPressure(error: TrpcErrorForLog): boolean {
  return error.cause instanceof WalletBusyError;
}

/**
 * The line to log, or null when this failure should be counted rather than
 * logged. Exported for tests; `resetUnknownProcedureCounts()` clears counters.
 */
export function formatTrpcError(
  error: TrpcErrorForLog,
  path: string | undefined,
  type: string
): TrpcLogLine | null {
  if (isUnknownProcedure(error)) {
    const key = path && path.length > 0 ? path : "<empty>";
    const seen = (unknownPathCounts.get(key) ?? 0) + 1;
    unknownPathCounts.set(key, seen);
    if (seen === 1) {
      return {
        level: "error",
        line: `[trpc] no such procedure "${key}" — nothing in this app requests it, so this is an external probe. Further occurrences will be counted, not logged.`,
      };
    }
    if (seen % UNKNOWN_PATH_REPORT_EVERY === 0) {
      return {
        level: "error",
        line: `[trpc] no such procedure "${key}" — ${seen} probes so far.`,
      };
    }
    return null;
  }

  if (isBackPressure(error)) {
    // No "failed", and no cause appended — the cause *is* the message.
    return {
      level: "warn",
      line: `[trpc] ${type} ${path ?? "<unknown>"} declined for now, client asked to retry: ${error.message}`,
    };
  }

  const cause =
    error.cause instanceof Error ? ` — cause: ${error.cause.message}` : "";
  return {
    level: "error",
    line: `[trpc] ${type} ${path ?? "<unknown>"} failed: ${error.code} ${error.message}${cause}`,
  };
}

/** Counts of each unknown path probed, for diagnostics. */
export function unknownProcedureProbes(): Record<string, number> {
  return Object.fromEntries(unknownPathCounts);
}

/** Test helper: forget every counted probe. */
export function resetUnknownProcedureCounts(): void {
  unknownPathCounts.clear();
}
