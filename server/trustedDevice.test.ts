import { describe, expect, it } from "vitest";

import {
  DEVICE_COOKIE,
  TRUSTED_DEVICE_DAYS,
  describeDevice,
  deviceExpiry,
  deviceHashesMatch,
  hashDeviceToken,
  newDeviceToken,
} from "./trustedDevice";

/**
 * The secret that decides whether a login is challenged. What has to hold is
 * narrow: tokens are unguessable and never equal, only their hashes are ever
 * stored, and trust lapses on its own.
 */

describe("newDeviceToken", () => {
  it("is 256 bits, URL-safe, and never the same twice", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const token = newDeviceToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      // 32 bytes in base64url, unpadded.
      expect(token).toHaveLength(43);
      expect(seen.has(token)).toBe(false);
      seen.add(token);
    }
  });

  it("carries no padding that a cookie would have to escape", () => {
    expect(newDeviceToken()).not.toContain("=");
  });
});

describe("hashDeviceToken", () => {
  it("is stable, 64 hex characters, and not the token", () => {
    const token = newDeviceToken();
    const hash = hashDeviceToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashDeviceToken(token));
    expect(hash).not.toContain(token);
  });

  it("differs for different tokens", () => {
    expect(hashDeviceToken(newDeviceToken())).not.toBe(
      hashDeviceToken(newDeviceToken())
    );
  });

  it("matches a known vector, so a stored hash stays readable later", () => {
    // Plain sha256("rfx"), from `printf 'rfx' | sha256sum`. If the algorithm
    // or encoding is ever changed, every stored row becomes unmatchable and
    // every trader is challenged on every login — this is what notices.
    expect(hashDeviceToken("rfx")).toBe(
      "4e6709b437017197ac3f5b9be03c549e26fd157227eeef8ef7fb237aa0865e44"
    );
  });
});

describe("deviceHashesMatch", () => {
  it("accepts equal hashes and rejects anything else", () => {
    const a = hashDeviceToken("one");
    expect(deviceHashesMatch(a, a)).toBe(true);
    expect(deviceHashesMatch(a, hashDeviceToken("two"))).toBe(false);
  });

  it("rejects a length mismatch rather than throwing", () => {
    // timingSafeEqual throws on unequal lengths, which a truncated cookie
    // would otherwise turn into a 500.
    expect(deviceHashesMatch(hashDeviceToken("one"), "short")).toBe(false);
    expect(deviceHashesMatch("", hashDeviceToken("one"))).toBe(false);
  });
});

describe("deviceExpiry", () => {
  it("is the configured number of days out", () => {
    const now = new Date("2026-11-03T12:00:00Z");
    const until = deviceExpiry(now);
    const days = (until.getTime() - now.getTime()) / 86_400_000;
    expect(days).toBe(TRUSTED_DEVICE_DAYS);
  });
});

describe("describeDevice", () => {
  it("keeps a user agent, truncated to the column", () => {
    expect(describeDevice("Mozilla/5.0 (iPhone)")).toBe("Mozilla/5.0 (iPhone)");
    expect(describeDevice("x".repeat(400))).toHaveLength(255);
  });

  it("is null when there is nothing to describe", () => {
    expect(describeDevice(undefined)).toBeNull();
    expect(describeDevice("")).toBeNull();
  });
});

describe("DEVICE_COOKIE", () => {
  it("is not the session cookie — it outlives it", () => {
    expect(DEVICE_COOKIE).toBe("rfx_device");
    expect(DEVICE_COOKIE).not.toBe("rfx_trading_session");
  });
});
