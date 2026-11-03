import { createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * "Is this a device the trader has already proved themselves on?"
 *
 * The login 2FA challenge is skipped for a device already known, and until now
 * "known" meant *an unexpired session exists from this same IP*. That was the
 * fourth finding of the 2026-07-24 review and it was wrong in both directions:
 * every stored address was a Cloudflare edge, so unrelated traders matched each
 * other; and once real addresses were recorded (v4.16.0) the comparison became
 * honest but still coarse, because 100.64.0.0/10 carrier NAT and ordinary
 * household NAT put strangers behind one address while a phone changes address
 * between cells.
 *
 * A device is now identified by a secret it was given, in a cookie, the first
 * time it completed a full login. That is precise in both directions: nobody
 * else's device is mistaken for yours, and yours is not re-challenged for
 * moving network.
 *
 * Stateful on purpose — the token is stored hashed, one row per device, so a
 * device can expire and can be revoked. A signed stateless cookie would have
 * needed no table and could never have been taken back.
 */

/** How long a device stays trusted without signing in again. */
export const TRUSTED_DEVICE_DAYS = 180;

/** The cookie carrying the device secret. Not the session cookie: it outlives it. */
export const DEVICE_COOKIE = "rfx_device";

/** A fresh device secret — 256 bits, like the session token. */
export function newDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Stored as a single SHA-256, deliberately, not bcrypt: this is a 256-bit
 * random secret rather than a password, so there is nothing for a work factor
 * to slow down, and a login should not pay for one.
 */
export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time compare of two stored hashes. */
export function deviceHashesMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** When a device trusted now should stop being trusted. */
export function deviceExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * A short description of the device, for the row — enough for a person to
 * recognise an entry they did not expect, without storing the whole header.
 */
export function describeDevice(userAgent: string | undefined): string | null {
  if (!userAgent) return null;
  return userAgent.slice(0, 255);
}
