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
 */

const UNKNOWN_PATH_REPORT_EVERY = 1000;

const unknownPathCounts = new Map<string, number>();

export type TrpcErrorForLog = {
  code: string;
  message: string;
  cause?: unknown;
};

/** True for "this procedure does not exist", as opposed to one that failed. */
function isUnknownProcedure(error: TrpcErrorForLog): boolean {
  return (
    error.code === "NOT_FOUND" &&
    error.message.startsWith("No procedure found on path")
  );
}

/**
 * The line to log, or null when this failure should be counted rather than
 * logged. Exported for tests; `formatTrpcError.reset()` clears the counters.
 */
export function formatTrpcError(
  error: TrpcErrorForLog,
  path: string | undefined,
  type: string
): string | null {
  if (isUnknownProcedure(error)) {
    const key = path && path.length > 0 ? path : "<empty>";
    const seen = (unknownPathCounts.get(key) ?? 0) + 1;
    unknownPathCounts.set(key, seen);
    if (seen === 1) {
      return `[trpc] no such procedure "${key}" — nothing in this app requests it, so this is an external probe. Further occurrences will be counted, not logged.`;
    }
    if (seen % UNKNOWN_PATH_REPORT_EVERY === 0) {
      return `[trpc] no such procedure "${key}" — ${seen} probes so far.`;
    }
    return null;
  }

  const cause =
    error.cause instanceof Error ? ` — cause: ${error.cause.message}` : "";
  return `[trpc] ${type} ${path ?? "<unknown>"} failed: ${error.code} ${error.message}${cause}`;
}

/** Counts of each unknown path probed, for diagnostics. */
export function unknownProcedureProbes(): Record<string, number> {
  return Object.fromEntries(unknownPathCounts);
}

/** Test helper: forget every counted probe. */
export function resetUnknownProcedureCounts(): void {
  unknownPathCounts.clear();
}
