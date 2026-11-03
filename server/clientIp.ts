import type { Request } from "express";

/**
 * The address the request actually came from.
 *
 * Every IP in `trading_sessions` was Cloudflare's. The app stored `req.ip`,
 * which under `trust proxy: 1` is the entry Caddy appends — and for anything
 * arriving over the public hostnames that is a Cloudflare edge address, shared
 * by everybody on that edge. Two consequences, both of which bit on
 * 2026-11-02: the attacker's address was nowhere in the application's own
 * evidence (it was in the edge access log, as `Cf-Connecting-Ip`, which is how
 * it was eventually recovered), and `hasSeenDevice` was matching strangers
 * against each other, so a trader's 2FA could be skipped for someone who
 * merely happened through the same edge.
 *
 * `trust proxy` is left alone deliberately: it also decides `req.protocol`,
 * which `getSessionCookieOptions` reads to set the cookie's `secure` flag.
 * This walks the chain itself instead.
 *
 * The walk goes newest first — the socket peer, then X-Forwarded-For from
 * right to left — and returns the first address that is not a proxy we trust.
 * That is what makes it unforgeable: Caddy appends the real peer to the right
 * of anything a client sent, so a client arriving at the origin directly with
 * a handmade X-Forwarded-For is identified by the entry Caddy added, not by
 * what it claimed.
 */

/**
 * Cloudflare's published ranges — https://www.cloudflare.com/ips-v4
 * Refresh with: curl -s https://www.cloudflare.com/ips-v4
 *
 * These change very rarely. If one is missed the result is the old behaviour
 * for traffic through that edge (we record Cloudflare's address instead of the
 * client's), never a forgeable one: an unknown proxy is an untrusted proxy.
 *
 * The IPv6 list is deliberately absent. Cloudflare reaches this origin over
 * IPv4 — the hostnames have A records only and the host has no public IPv6 —
 * so a Cloudflare v6 address can never appear in the chain. If AAAA records
 * are ever added, add the v6 ranges here too, or sessions will quietly start
 * recording Cloudflare's address again.
 */
const CLOUDFLARE_IPV4 = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
];

/**
 * The container network between Caddy and this app. Private space in general:
 * the socket peer is always the edge container's address on `rfx_edge`, and
 * anything reaching us from private space is already inside the host.
 */
const PRIVATE_IPV4 = [
  "10.0.0.0/8",
  "172.16.0.0/12", // note: Cloudflare's 172.64/13 and 172.69-71 are NOT in here
  "192.168.0.0/16",
  "127.0.0.0/8",
  "169.254.0.0/16",
];

const TRUSTED_IPV4 = [...PRIVATE_IPV4, ...CLOUDFLARE_IPV4].map(parseCidr);

function parseCidr(cidr: string): { base: number; mask: number } {
  const [addr, bitsRaw] = cidr.split("/");
  const bits = Number(bitsRaw);
  const base = ipv4ToInt(addr!);
  if (base === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    throw new Error(`Bad CIDR in trusted proxy list: ${cidr}`);
  }
  // >>> 0 keeps it unsigned; a /0 mask has to be 0, which the shift would not give.
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return { base: (base & mask) >>> 0, mask };
}

function ipv4ToInt(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  let out = 0;
  for (let i = 1; i <= 4; i++) {
    const octet = Number(m[i]);
    if (octet > 255) return null;
    out = (out << 8) | octet;
  }
  return out >>> 0;
}

/** Strips a port, brackets and the IPv4-mapped IPv6 prefix. */
export function normaliseIp(raw: string): string {
  let ip = raw.trim();
  if (ip.startsWith("[")) {
    // [2001:db8::1]:443
    ip = ip.slice(1, ip.indexOf("]") === -1 ? undefined : ip.indexOf("]"));
  } else if ((ip.match(/:/g) ?? []).length === 1) {
    // a.b.c.d:port — a bare IPv6 always has more than one colon
    ip = ip.slice(0, ip.indexOf(":"));
  }
  if (ip.toLowerCase().startsWith("::ffff:")) ip = ip.slice(7);
  return ip.toLowerCase();
}

/** True for a proxy we put there, or private space we are already inside. */
export function isTrustedProxy(ip: string): boolean {
  const addr = normaliseIp(ip);
  const v4 = ipv4ToInt(addr);
  if (v4 !== null) {
    return TRUSTED_IPV4.some(({ base, mask }) => ((v4 & mask) >>> 0) === base);
  }
  // IPv6: loopback, and fc00::/7 unique-local (fc.. and fd..).
  if (addr === "::1") return true;
  return /^f[cd]/.test(addr);
}

/**
 * The client's address, or null when nothing usable was supplied.
 *
 * Takes the pieces rather than a Request so the walk can be tested against
 * the chains that actually occur — and the ones an attacker would construct.
 */
export function resolveClientIp(parts: {
  peer?: string | null;
  forwardedFor?: string | string[] | null;
}): string | null {
  const xff = Array.isArray(parts.forwardedFor)
    ? parts.forwardedFor.join(",")
    : (parts.forwardedFor ?? "");
  const forwarded = xff
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .map(normaliseIp);

  // Newest hop first: the socket peer, then X-Forwarded-For right to left.
  const chain = [
    ...(parts.peer ? [normaliseIp(parts.peer)] : []),
    ...forwarded.slice().reverse(),
  ].filter(ip => ip.length > 0);

  if (chain.length === 0) return null;
  for (const ip of chain) {
    if (!isTrustedProxy(ip)) return ip;
  }
  // Everything in the chain is a proxy we trust — which happens on the tailnet
  // only if Tailscale ever hands out private space. Report the furthest hop
  // rather than nothing: it is still the best answer available.
  return chain[chain.length - 1]!;
}

/** `resolveClientIp` for an Express request. */
export function clientIpOf(req: Request): string | null {
  return resolveClientIp({
    peer: req.socket?.remoteAddress ?? null,
    forwardedFor: req.headers["x-forwarded-for"] ?? null,
  });
}
