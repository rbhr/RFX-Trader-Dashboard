import { ENV } from "./env";

/**
 * Tiny namespaced debug logger. Output is gated by the `DEBUG` env var so the
 * default log stream stays quiet (e.g. no per-request "[Auth] Missing session
 * cookie" spam) while staying greppable when you opt in.
 *
 * Enable with a comma-separated list of namespaces, or a wildcard for all:
 *   DEBUG=auth                  → only the "auth" namespace
 *   DEBUG=auth,onboarding       → both
 *   DEBUG=*  (or 1 / true)      → everything
 *   DEBUG=   (unset/empty)      → nothing (default)
 *
 * Usage:
 *   const debug = createDebug("auth");
 *   debug("Missing session cookie");   // logs "[auth] Missing session cookie" when enabled
 */
const enabled = new Set(
  ENV.debug
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

const allEnabled = enabled.has("*") || enabled.has("1") || enabled.has("true");

export function isDebugEnabled(namespace: string): boolean {
  return allEnabled || enabled.has(namespace.toLowerCase());
}

export function createDebug(namespace: string): (...args: unknown[]) => void {
  const on = isDebugEnabled(namespace);
  const prefix = `[${namespace}]`;
  return (...args: unknown[]) => {
    if (on) console.log(prefix, ...args);
  };
}
