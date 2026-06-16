/**
 * In-memory event log for the admin "Logs" tab.
 *
 * A bounded ring buffer of structured events (category + level + message). Each
 * logEvent() also mirrors to the console, so `docker logs` is unchanged — this
 * just gives the frontend a queryable, filterable view of recent activity.
 * Not persisted: the buffer resets on restart (fine for a live activity view).
 */

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

export interface LogEntry {
  id: number;
  ts: number; // epoch ms
  category: LogCategory;
  level: LogLevel;
  message: string;
}

const MAX_ENTRIES = 2000;
const buffer: LogEntry[] = [];
let nextId = 1;

/** Record an event (and mirror to the console for docker logs). */
export function logEvent(
  category: LogCategory,
  message: string,
  level: LogLevel = "info"
): void {
  const entry: LogEntry = { id: nextId++, ts: Date.now(), category, level, message };
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_ENTRIES);
  }
  const line = `[${category}] ${message}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Most-recent-first slice of the buffer, optionally filtered by category. */
export function getRecentLogs(
  opts: { category?: LogCategory; limit?: number } = {}
): LogEntry[] {
  const limit = Math.min(opts.limit ?? 500, MAX_ENTRIES);
  const source = opts.category
    ? buffer.filter((e) => e.category === opts.category)
    : buffer;
  return source.slice(-limit).reverse();
}
