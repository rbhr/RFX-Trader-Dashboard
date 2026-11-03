import { TRPCError } from "@trpc/server";
import type { Request } from "express";

import { ENV } from "./_core/env";

/**
 * Admin accounts may only be used from the tailnet.
 *
 * On 2026-11-02 somebody logged in as `admin` from the public internet — the
 * default password, and `isAdmin` accounts are exempt from 2FA — and moved
 * 2030 USDT out of the custodial wallet. Nothing about an admin account needs
 * to be reachable from the internet, so it no longer is.
 *
 * `tda.rfx.capital` is a DNS-only record for this host's Tailscale address
 * (100.96.146.4). Off-tailnet clients cannot route to it, the edge Caddy
 * refuses anything that reaches that hostname from a non-tailnet source, and
 * this module makes the app refuse it a third time — because Caddy's guard
 * protects the hostname, while this one protects the *account* no matter which
 * hostname, procedure or route it arrives through.
 */

/** The only hostname an admin account may be used from. */
export const ADMIN_HOSTNAME = "tda.rfx.capital";

/** Tailscale's v6 prefix, fd7a:115c:a1e0::/48. */
const TAILNET_V6_PREFIX = "fd7a:115c:a1e0:";

/** True for an address in 100.64.0.0/10, the CGNAT range Tailscale uses. */
function isTailnetV4(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(ip);
  if (!m) return false;
  // 100.64.0.0/10 == first octet 100, second octet 64-127.
  return Number(m[1]) === 100 && Number(m[2]) >= 64 && Number(m[2]) <= 127;
}

/**
 * True when this request arrived at the tailnet-only admin hostname from a
 * tailnet source address. Pure, so it can be unit-tested directly; callers
 * decide whether to enforce it.
 *
 * Reads the raw Host header rather than Express's `req.hostname`: under
 * "trust proxy" that getter prefers X-Forwarded-Host, which a client can set.
 * Caddy routes on Host and passes it through untouched, so Host is "the name
 * Caddy matched". The source address is the real authority either way.
 */
export function isTailnetAdminRequest(r: {
  host?: string | undefined;
  ip?: string | undefined;
}): boolean {
  if (!r.host || !r.ip) return false;

  // Strip the port: Host carries one for any non-default port.
  const host = r.host.trim().toLowerCase().replace(/:\d+$/, "");
  if (host !== ADMIN_HOSTNAME) return false;

  // Node reports an IPv4 peer as ::ffff:a.b.c.d when the socket is dual-stack.
  const ip = r.ip.trim().toLowerCase().replace(/^::ffff:/, "");
  return isTailnetV4(ip) || ip.startsWith(TAILNET_V6_PREFIX);
}

/**
 * Throws unless an `isAdmin` account may act on this request.
 *
 * Enforced in production only: `pnpm dev` and the vitest suite run on
 * localhost, where there is no tailnet and no Caddy in front. Compose sets
 * NODE_ENV=production for rfx-app, so the bypass never applies in production.
 *
 * `req.ip` is trustworthy here because `trust proxy` is 1 (see
 * server/_core/index.ts) — Express takes the right-most X-Forwarded-For entry,
 * which is the one Caddy itself appends, so a client's own XFF values land
 * further left and are ignored. That holds only while Caddy is the sole way in:
 * the app deliberately publishes no host port.
 *
 * Deliberately NOT `clientIpOf` from server/clientIp.ts, which is for
 * recording who a user is and keeps walking through trusted proxies to the
 * end client. This gate asks a different question — did the connection arrive
 * from a tailnet device — and only the immediate peer answers it. The
 * difference matters: 100.64.0.0/10 is carrier-grade NAT space that real
 * mobile networks hand out, so an end client can legitimately hold a 100.x
 * address while being nowhere near the tailnet.
 */
export function assertAdminNetwork(req: Request): void {
  if (!ENV.isProduction) return;
  if (isTailnetAdminRequest({ host: req.headers.host, ip: req.ip })) return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Admin access is restricted to the RFX management network.",
  });
}
