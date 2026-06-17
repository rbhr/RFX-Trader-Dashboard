/**
 * System event log for the admin "Logs" tab.
 *
 * logEvent() mirrors to the console (so `docker logs` is unchanged) and persists
 * the event to the `logs` table. The write is fire-and-forget — logging must
 * never block or throw into the calling path. Reads/pagination are served from
 * the DB via db.getLogsPaged().
 */

import { createLog } from "./db";

export type LogCategory =
  | "onboarding"
  | "trailing"
  | "breach"
  | "telegram"
  | "metacopier"
  | "socket"
  | "payment"
  | "system";

export type LogLevel = "info" | "warn" | "error";

/** Record an event: mirror to the console and persist to the DB. */
export function logEvent(
  category: LogCategory,
  message: string,
  level: LogLevel = "info"
): void {
  const line = `[${category}] ${message}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);

  // Fire-and-forget — never let logging break the caller.
  void createLog({ category, level, message }).catch(() => {});
}
