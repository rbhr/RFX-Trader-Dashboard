import crypto from "crypto";
import { ENV } from "./_core/env";

/**
 * Encryption for stored OAuth grants.
 *
 * A refresh token with `gmail.send` is a standing authority to send mail as a
 * real person, and this host keeps ad-hoc `.sql` dumps in the deploy root, so a
 * plaintext token in the database would end up in files nobody is guarding. The
 * key lives only in `.env`, which is neither dumped nor committed.
 *
 * AES-256-GCM, so a tampered ciphertext fails to decrypt rather than decrypting
 * to something attacker-chosen. Format: `v1.<iv>.<tag>.<ciphertext>`, base64url
 * throughout, versioned so the scheme can be changed without guessing at what
 * old rows hold.
 */

const VERSION = "v1";
const IV_BYTES = 12; // GCM standard
const KEY_BYTES = 32;

export class EmailTokenKeyError extends Error {}

let cachedKey: Buffer | null = null;

/**
 * Parses a configured key. Accepts a 64-char hex string or a base64 string
 * that decodes to 32 bytes; anything else is rejected loudly rather than
 * silently hashed or padded into a key, because a typo that still "works"
 * would encrypt every token under something nobody can reproduce later.
 *
 * Takes the raw string rather than reading ENV so the rules are testable —
 * ENV is evaluated once at module load, which is right for the server and
 * useless for a test.
 */
export function parseEmailTokenKey(raw: string): Buffer {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new EmailTokenKeyError(
      "EMAIL_TOKEN_KEY is not set, so mail senders cannot be stored. " +
        "Generate one with: openssl rand -hex 32"
    );
  }

  let key: Buffer | null = null;
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    key = Buffer.from(trimmed, "hex");
  } else if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(trimmed)) {
    // Buffer.from(..., "base64") ignores junk rather than failing, so the
    // shape is checked first and the length check below is what decides.
    const decoded = Buffer.from(trimmed, "base64");
    if (decoded.length === KEY_BYTES) key = decoded;
  }

  if (!key || key.length !== KEY_BYTES) {
    throw new EmailTokenKeyError(
      "EMAIL_TOKEN_KEY must be 32 bytes — 64 hex characters or base64 of 32 bytes. " +
        "Generate one with: openssl rand -hex 32"
    );
  }
  return key;
}

/** The configured key, parsed once. */
function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  cachedKey = parseEmailTokenKey(ENV.emailTokenKey);
  return cachedKey;
}

/** True when a usable key is configured, for surfacing setup state in the UI. */
export function hasEmailTokenKey(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptToken(stored: string): string {
  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new EmailTokenKeyError(`Stored token is not in the expected ${VERSION} format`);
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivB64, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * HMAC over the invite nonce, so an authorise link cannot be forged by someone
 * who guesses a nonce. Keyed off the same secret as the session cookie, which
 * is already required to be set for the app to run at all.
 */
export function signInviteNonce(nonce: string): string {
  return crypto
    .createHmac("sha256", ENV.cookieSecret || "unset")
    .update(`email-sender-invite:${nonce}`)
    .digest("base64url");
}

/** Constant-time compare, so a wrong signature leaks nothing by timing. */
export function verifyInviteSignature(nonce: string, signature: string): boolean {
  const expected = Buffer.from(signInviteNonce(nonce));
  const given = Buffer.from(signature);
  if (expected.length !== given.length) return false;
  return crypto.timingSafeEqual(expected, given);
}

export function newInviteNonce(): string {
  return crypto.randomBytes(24).toString("base64url");
}
