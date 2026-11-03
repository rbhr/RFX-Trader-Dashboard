import { describe, expect, it } from "vitest";

import {
  clientIpOf,
  isCloudflare,
  isTrustedProxy,
  normaliseIp,
  resolveClientIp,
} from "./clientIp";

/**
 * Every IP in `trading_sessions` was Cloudflare's, so the attacker's address
 * was absent from the app's own evidence and `hasSeenDevice` was matching
 * strangers against each other. What has to hold is narrow: the real client
 * comes back for traffic through Cloudflare, and a client that writes its own
 * X-Forwarded-For cannot choose what we record.
 */

// The chain as it actually arrives: Caddy's address on rfx_edge is the socket
// peer, and Caddy appends that of its own peer — Cloudflare — to the header
// Cloudflare already set to the real client.
const CADDY = "172.19.0.4";
const CF_EDGE = "172.70.91.110";

describe("isTrustedProxy", () => {
  it("trusts the container network and private space", () => {
    for (const ip of ["172.19.0.4", "10.0.0.101", "192.168.1.1", "127.0.0.1", "::1"]) {
      expect(isTrustedProxy(ip)).toBe(true);
    }
  });

  it("trusts Cloudflare's published ranges", () => {
    // Taken from real log lines, across several of the published blocks.
    for (const ip of [
      "172.70.91.110",
      "172.71.119.5",
      "172.69.162.224",
      "162.158.111.8",
      "108.162.192.1",
      "141.101.64.1",
      "104.23.225.12",
      "173.245.48.1",
      "131.0.72.1",
    ]) {
      expect(isTrustedProxy(ip), ip).toBe(true);
    }
  });

  it("does not trust addresses just outside those ranges", () => {
    for (const ip of [
      "172.15.255.255", // below 172.16/12
      "172.32.0.1", // above 172.16/12
      "172.63.255.255", // below Cloudflare's 172.64/13
      "172.72.0.1", // above Cloudflare's 172.64/13
      "104.15.255.255",
      "104.28.0.1",
      "161.158.0.1",
      "9.255.255.255",
      "11.0.0.1",
    ]) {
      expect(isTrustedProxy(ip), ip).toBe(false);
    }
  });

  it("does not trust the attacker's addresses, or any public one", () => {
    for (const ip of ["34.76.61.135", "35.205.223.156", "8.8.8.8", "2403:580d:8c15::1"]) {
      expect(isTrustedProxy(ip), ip).toBe(false);
    }
  });

  it("trusts a tailnet address no more than any other public-looking one", () => {
    // 100.64/10 is not private space; it is simply not a proxy we put there,
    // so the walk stops on it — which is what we want for tda.rfx.capital.
    expect(isTrustedProxy("100.96.146.4")).toBe(false);
  });
});

describe("resolveClientIp", () => {
  it("returns the real client for traffic through Cloudflare", () => {
    expect(
      resolveClientIp({ peer: CADDY, forwardedFor: `34.90.82.49, ${CF_EDGE}` })
    ).toBe("34.90.82.49");
  });

  it("handles an IPv6 client behind Cloudflare", () => {
    expect(
      resolveClientIp({
        peer: CADDY,
        forwardedFor: `2403:580d:8c15:0:3138:a34c:9d9c:a4a5, ${CF_EDGE}`,
      })
    ).toBe("2403:580d:8c15:0:3138:a34c:9d9c:a4a5");
  });

  it("returns the tailnet address for traffic to the admin hostname", () => {
    // No Cloudflare in front of tda.rfx.capital, so Caddy appends the device.
    expect(resolveClientIp({ peer: CADDY, forwardedFor: "100.96.146.4" })).toBe(
      "100.96.146.4"
    );
  });

  it("ignores an X-Forwarded-For a client wrote itself", () => {
    // Straight at the origin, claiming to be someone else. Caddy appends the
    // real peer to the right, and the walk starts from the right.
    expect(
      resolveClientIp({ peer: CADDY, forwardedFor: "1.2.3.4, 203.0.113.9" })
    ).toBe("203.0.113.9");
  });

  it("cannot be fooled by claiming to be Cloudflare, or private", () => {
    expect(
      resolveClientIp({ peer: CADDY, forwardedFor: `1.2.3.4, ${CF_EDGE}, 203.0.113.9` })
    ).toBe("203.0.113.9");
    expect(
      resolveClientIp({ peer: CADDY, forwardedFor: "1.2.3.4, 10.0.0.9, 203.0.113.9" })
    ).toBe("203.0.113.9");
  });

  it("stacks of forged hops make no difference", () => {
    const forged = Array.from({ length: 50 }, (_, i) => `1.2.3.${i}`).join(", ");
    expect(
      resolveClientIp({ peer: CADDY, forwardedFor: `${forged}, 203.0.113.9` })
    ).toBe("203.0.113.9");
  });

  it("falls back to the socket peer when there is no header", () => {
    expect(resolveClientIp({ peer: "203.0.113.9", forwardedFor: null })).toBe(
      "203.0.113.9"
    );
  });

  it("reports the furthest hop rather than nothing when all are trusted", () => {
    // Would mean a request from inside the container network with no client.
    expect(resolveClientIp({ peer: CADDY, forwardedFor: "10.0.0.9" })).toBe("10.0.0.9");
    expect(resolveClientIp({ peer: CADDY, forwardedFor: null })).toBe(CADDY);
  });

  it("returns null when nothing was supplied", () => {
    expect(resolveClientIp({ peer: null, forwardedFor: null })).toBeNull();
    expect(resolveClientIp({ peer: "", forwardedFor: "" })).toBeNull();
  });

  it("accepts the header as an array, as Node may parse it", () => {
    expect(
      resolveClientIp({ peer: CADDY, forwardedFor: ["34.90.82.49", CF_EDGE] })
    ).toBe("34.90.82.49");
  });

  it("tolerates whitespace and empty entries", () => {
    expect(
      resolveClientIp({ peer: CADDY, forwardedFor: `  34.90.82.49 , , ${CF_EDGE} ,` })
    ).toBe("34.90.82.49");
  });
});

describe("normaliseIp", () => {
  it("strips the IPv4-mapped prefix Node reports on a dual-stack socket", () => {
    expect(normaliseIp("::ffff:203.0.113.9")).toBe("203.0.113.9");
  });

  it("strips a port, and leaves a bare IPv6 alone", () => {
    expect(normaliseIp("203.0.113.9:54321")).toBe("203.0.113.9");
    expect(normaliseIp("[2001:db8::1]:443")).toBe("2001:db8::1");
    expect(normaliseIp("2001:db8::1")).toBe("2001:db8::1");
  });
});

describe("clientIpOf", () => {
  it("reads the socket and header off a request", () => {
    const req = {
      socket: { remoteAddress: CADDY },
      headers: { "x-forwarded-for": `34.90.82.49, ${CF_EDGE}` },
    } as unknown as Parameters<typeof clientIpOf>[0];
    expect(clientIpOf(req)).toBe("34.90.82.49");
  });

  it("copes with a request that has neither", () => {
    const req = { headers: {} } as unknown as Parameters<typeof clientIpOf>[0];
    expect(clientIpOf(req)).toBeNull();
  });
});

describe("CF-Connecting-IP, which is where the client really is", () => {
  // Measured, not assumed: Caddy replaces X-Forwarded-For with its immediate
  // peer unless that peer is in a configured `trusted_proxies`, and the edge
  // configures none. So for traffic through Cloudflare the app receives only
  // the edge address, and the client is in CF-Connecting-IP.
  const CHAIN_VIA_CLOUDFLARE = { peer: CADDY, forwardedFor: CF_EDGE };

  it("takes the client from the header when Cloudflare is in the chain", () => {
    expect(
      resolveClientIp({ ...CHAIN_VIA_CLOUDFLARE, cfConnectingIp: "176.9.46.69" })
    ).toBe("176.9.46.69");
  });

  it("takes an IPv6 client from it too", () => {
    expect(
      resolveClientIp({
        ...CHAIN_VIA_CLOUDFLARE,
        cfConnectingIp: "2403:580d:8c15:0:3138:a34c:9d9c:a4a5",
      })
    ).toBe("2403:580d:8c15:0:3138:a34c:9d9c:a4a5");
  });

  it("accepts it as an array, as Node may parse it", () => {
    expect(
      resolveClientIp({ ...CHAIN_VIA_CLOUDFLARE, cfConnectingIp: ["176.9.46.69"] })
    ).toBe("176.9.46.69");
  });

  it("ignores it when no Cloudflare address is in the chain", () => {
    // Straight at the origin with a handmade header. The walk identifies the
    // caller by the entry Caddy wrote, and the claim is discarded.
    expect(
      resolveClientIp({
        peer: CADDY,
        forwardedFor: "203.0.113.9",
        cfConnectingIp: "8.8.8.8",
      })
    ).toBe("203.0.113.9");
    // Even from inside the container network, where every hop is trusted.
    expect(
      resolveClientIp({
        peer: CADDY,
        forwardedFor: "10.0.0.9",
        cfConnectingIp: "8.8.8.8",
      })
    ).toBe("10.0.0.9");
  });

  it("ignores a tailnet request's header entirely", () => {
    expect(
      resolveClientIp({
        peer: CADDY,
        forwardedFor: "100.96.146.4",
        cfConnectingIp: "8.8.8.8",
      })
    ).toBe("100.96.146.4");
  });

  it("falls back to the edge address when the header is missing or junk", () => {
    expect(resolveClientIp({ ...CHAIN_VIA_CLOUDFLARE, cfConnectingIp: null })).toBe(
      CF_EDGE
    );
    expect(
      resolveClientIp({ ...CHAIN_VIA_CLOUDFLARE, cfConnectingIp: "not-an-ip" })
    ).toBe(CF_EDGE);
    expect(resolveClientIp({ ...CHAIN_VIA_CLOUDFLARE, cfConnectingIp: "" })).toBe(
      CF_EDGE
    );
  });

  it("prefers a real hop over the header when the walk already found one", () => {
    // A properly appending proxy in front: the chain answers, so the header is
    // not consulted even though Cloudflare is present.
    expect(
      resolveClientIp({
        peer: CADDY,
        forwardedFor: `176.9.46.69, ${CF_EDGE}`,
        cfConnectingIp: "8.8.8.8",
      })
    ).toBe("176.9.46.69");
  });
});

describe("isCloudflare", () => {
  it("knows the edge addresses that actually appear in the logs", () => {
    for (const ip of ["104.23.239.70", "172.71.148.60", "162.158.94.216", "172.70.91.110"]) {
      expect(isCloudflare(ip), ip).toBe(true);
    }
  });

  it("does not mistake private space or the attacker for Cloudflare", () => {
    for (const ip of ["172.19.0.4", "10.0.0.101", "34.76.61.135", "176.9.46.69"]) {
      expect(isCloudflare(ip), ip).toBe(false);
    }
  });
});

describe("clientIpOf, through Cloudflare", () => {
  it("reads the header off the request", () => {
    const req = {
      socket: { remoteAddress: CADDY },
      headers: { "x-forwarded-for": CF_EDGE, "cf-connecting-ip": "176.9.46.69" },
    } as unknown as Parameters<typeof clientIpOf>[0];
    expect(clientIpOf(req)).toBe("176.9.46.69");
  });
});
