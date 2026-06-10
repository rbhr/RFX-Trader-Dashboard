/**
 * In-memory sliding-window rate limiter for auth endpoints.
 * Single-instance deployment (one Docker container), so process-local
 * state is sufficient. Counters reset on restart, which is acceptable
 * for brute-force protection.
 */

const buckets = new Map<string, number[]>();

const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  buckets.forEach((timestamps: number[], key: string) => {
    const live = timestamps.filter(t => now - t < windowMs);
    if (live.length === 0) buckets.delete(key);
    else buckets.set(key, live);
  });
}

/**
 * Records an attempt and returns true if the caller is within the limit.
 * Returns false when `max` attempts have already been made inside `windowMs`.
 */
export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number
): boolean {
  cleanup(windowMs);
  const now = Date.now();
  const timestamps = (buckets.get(key) ?? []).filter(t => now - t < windowMs);
  if (timestamps.length >= max) {
    buckets.set(key, timestamps);
    return false;
  }
  timestamps.push(now);
  buckets.set(key, timestamps);
  return true;
}

/** Clears the counter for a key (e.g. after a successful login). */
export function resetRateLimit(key: string) {
  buckets.delete(key);
}
