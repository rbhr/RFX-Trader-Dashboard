import { describe, expect, it } from "vitest";

import { ADMIN_HOSTNAME, isTailnetAdminRequest } from "./adminNetwork";

/**
 * The gate that keeps admin accounts off the public internet. Tests the pure
 * predicate rather than assertAdminNetwork, which short-circuits outside
 * production and so cannot be exercised from the suite.
 */
describe("isTailnetAdminRequest", () => {
  const cases: [string, { host?: string; ip?: string }, boolean][] = [
    // Tailnet v4: 100.64.0.0/10, including this host and its edges.
    ["this host", { host: ADMIN_HOSTNAME, ip: "100.96.146.4" }, true],
    ["range start", { host: ADMIN_HOSTNAME, ip: "100.64.0.0" }, true],
    ["range end", { host: ADMIN_HOSTNAME, ip: "100.127.255.255" }, true],
    ["another node", { host: ADMIN_HOSTNAME, ip: "100.72.22.61" }, true],

    // Addresses just outside the /10 — 100.0.0.0/8 is public space.
    ["below range", { host: ADMIN_HOSTNAME, ip: "100.63.255.255" }, false],
    ["above range", { host: ADMIN_HOSTNAME, ip: "100.128.0.1" }, false],

    // The two address shapes that actually show up in the logs.
    ["cloudflare egress", { host: ADMIN_HOSTNAME, ip: "172.69.162.224" }, false],
    ["host LAN address", { host: ADMIN_HOSTNAME, ip: "10.0.0.101" }, false],
    ["docker bridge", { host: ADMIN_HOSTNAME, ip: "172.19.0.1" }, false],
    ["loopback", { host: ADMIN_HOSTNAME, ip: "127.0.0.1" }, false],

    // Node reports a v4 peer this way on a dual-stack socket.
    ["v4-mapped tailnet", { host: ADMIN_HOSTNAME, ip: "::ffff:100.72.22.61" }, true],
    ["v4-mapped public", { host: ADMIN_HOSTNAME, ip: "::ffff:172.69.1.1" }, false],

    // Tailscale v6, fd7a:115c:a1e0::/48.
    ["tailnet v6", { host: ADMIN_HOSTNAME, ip: "fd7a:115c:a1e0::1" }, true],
    [
      "tailnet v6, full",
      { host: ADMIN_HOSTNAME, ip: "fd7a:115c:a1e0:ab12:4843:cd96:6264:9204" },
      true,
    ],
    ["other ULA", { host: ADMIN_HOSTNAME, ip: "fd00::1" }, false],
    ["public v6", { host: ADMIN_HOSTNAME, ip: "2403:580d:8c15::1" }, false],

    // Host must be the admin hostname, whatever the source address.
    ["trader hostname", { host: "tradersdash.rfx.capital", ip: "100.96.146.4" }, false],
    ["other hostname", { host: "rfx.capital", ip: "100.96.146.4" }, false],
    ["lookalike suffix", { host: "evil-tda.rfx.capital", ip: "100.96.146.4" }, false],
    ["lookalike prefix", { host: "tda.rfx.capital.evil.com", ip: "100.96.146.4" }, false],

    // Host carries a port for any non-default port, and case is not significant.
    ["with port", { host: `${ADMIN_HOSTNAME}:443`, ip: "100.96.146.4" }, true],
    ["upper case", { host: "TDA.RFX.CAPITAL", ip: "100.96.146.4" }, true],

    // Anything missing fails closed.
    ["no host", { ip: "100.96.146.4" }, false],
    ["empty host", { host: "", ip: "100.96.146.4" }, false],
    ["no ip", { host: ADMIN_HOSTNAME }, false],
    ["empty ip", { host: ADMIN_HOSTNAME, ip: "" }, false],
    ["neither", {}, false],
    ["not an address", { host: ADMIN_HOSTNAME, ip: "100.96.146" }, false],
  ];

  for (const [label, req, expected] of cases) {
    it(`${expected ? "accepts" : "refuses"} ${label}`, () => {
      expect(isTailnetAdminRequest(req)).toBe(expected);
    });
  }
});
