// Payout period boundaries. Periods run Saturday 11:00 Australia/Adelaide to
// the following Saturday (Weekly) or the Saturday a fortnight later
// (Fortnightly) — when the market is closed and traders hold no open trades.
//
// We avoid adding date-fns-tz (frozen-lockfile build risk) and derive the
// Adelaide offset from the Intl API, which already knows the +9:30/+10:30 DST
// rules. Both From/To remain user-editable, so exact-instant precision isn't
// critical — this just provides sensible defaults.

export type PayoutCycle = "Weekly" | "Fortnightly" | "Ad-hoc";

const ADELAIDE_TZ = "Australia/Adelaide";

/** Adelaide UTC offset (in minutes) at a given instant. */
function adelaideOffsetMinutes(at: Date): number {
  // Format the instant as Adelaide wall-clock, parse it back as if UTC, and
  // diff against the real instant to recover the offset.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ADELAIDE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(at);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  let hour = get("hour");
  if (hour === 24) hour = 0; // Intl can emit "24" at midnight
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second")
  );
  return Math.round((asUtc - at.getTime()) / 60000);
}

/**
 * The most recent Saturday 11:00 Adelaide at or before `now`, as a UTC Date.
 */
export function lastSaturday11Adelaide(now: Date = new Date()): Date {
  const offsetMin = adelaideOffsetMinutes(now);
  // Adelaide wall-clock "now" expressed as a UTC-based Date for field math.
  const wall = new Date(now.getTime() + offsetMin * 60000);
  const dow = wall.getUTCDay(); // 0=Sun … 6=Sat
  // Days back to the most recent Saturday (same day if it's Sat).
  let daysBack = (dow - 6 + 7) % 7;
  // Build that Saturday at 11:00 in Adelaide wall-clock.
  let satWall = new Date(
    Date.UTC(
      wall.getUTCFullYear(),
      wall.getUTCMonth(),
      wall.getUTCDate() - daysBack,
      11,
      0,
      0,
      0
    )
  );
  // If that's still in the future (e.g. Saturday before 11:00), step back a week.
  let candidateUtc = new Date(satWall.getTime() - offsetMin * 60000);
  if (candidateUtc.getTime() > now.getTime()) {
    satWall = new Date(satWall.getTime() - 7 * 24 * 60 * 60 * 1000);
    candidateUtc = new Date(satWall.getTime() - offsetMin * 60000);
  }
  return candidateUtc;
}

/** Default { from, to } window for a payout cycle. */
export function defaultPayoutWindow(cycle: PayoutCycle): {
  from: Date;
  to: Date;
} {
  const to = lastSaturday11Adelaide();
  const weeks = cycle === "Weekly" ? 1 : 2; // Fortnightly + Ad-hoc default to 2
  const from = new Date(to.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
  return { from, to };
}

/** Convert a Date to the value a <input type="datetime-local"> expects (local). */
export function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
