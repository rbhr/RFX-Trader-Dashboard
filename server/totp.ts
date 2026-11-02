import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * TOTP (RFC 6238) over HMAC-SHA1, 6 digits, 30-second steps — the defaults
 * every authenticator app assumes, so an `otpauth://` URI needs no parameters
 * beyond the secret.
 *
 * Written against node:crypto rather than pulling in a library: the whole of
 * it is one HMAC and a truncation, the RFC publishes test vectors, and the
 * admin account's second factor is not somewhere to inherit a dependency's
 * supply chain. `server/totp.test.ts` runs the published vectors.
 */

const DIGITS = 6;
const STEP_SECONDS = 30;
/** How many steps either side of now are accepted, for clock skew. */
const DEFAULT_WINDOW = 1;

// RFC 4648 base32, which is what otpauth:// secrets are encoded in.
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i]!;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** Tolerant of the spaces, lower case and padding people paste in. */
export function base32Decode(s: string): Buffer {
  const clean = s.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = B32.indexOf(clean[i]!);
    if (idx === -1) throw new Error(`Invalid base32 character: ${clean[i]}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh 160-bit secret, base32-encoded — the size RFC 4226 recommends. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The step number a given moment falls in. */
export function totpStep(now: Date = new Date()): number {
  return Math.floor(now.getTime() / 1000 / STEP_SECONDS);
}

/** The 6-digit code for one step. `secret` is base32. */
export function totpCodeForStep(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  // Big-endian 64-bit. Steps stay well inside 2^32 until the year 6000, but
  // write both halves so the encoding is right rather than merely adequate.
  counter.writeUInt32BE(Math.floor(step / 2 ** 32), 0);
  counter.writeUInt32BE(step >>> 0, 4);

  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  // Dynamic truncation, RFC 4226 §5.3.
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    (hmac[offset + 1]! << 16) |
    (hmac[offset + 2]! << 8) |
    hmac[offset + 3]!;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/**
 * Verifies a code and returns the step it matched, or null.
 *
 * The step is the point: the caller stores the highest step it has accepted
 * and refuses anything at or below it, so a code cannot be replayed inside its
 * own window — which is what an attacker who can read one over the shoulder,
 * or off a phishing page, would otherwise do.
 */
export function verifyTotpCode(
  secret: string,
  code: string,
  opts: { now?: Date; window?: number } = {}
): number | null {
  const candidate = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(candidate)) return null;

  const centre = totpStep(opts.now ?? new Date());
  const window = opts.window ?? DEFAULT_WINDOW;
  for (let offset = -window; offset <= window; offset++) {
    const step = centre + offset;
    const expected = Buffer.from(totpCodeForStep(secret, step));
    const given = Buffer.from(candidate);
    if (expected.length === given.length && timingSafeEqual(expected, given)) {
      return step;
    }
  }
  return null;
}

/**
 * The `otpauth://` URI an authenticator scans. The label carries the issuer
 * twice by convention — in the path and the query — so apps that read only one
 * of them still show which account the code belongs to.
 */
export function otpauthUri(opts: {
  secret: string;
  account: string;
  issuer: string;
}): string {
  const label = encodeURIComponent(`${opts.issuer}:${opts.account}`);
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer: opts.issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/* ── Recovery codes ──────────────────────────────────────────────── */

/** Unambiguous alphabet: no 0/O, 1/I/L, so a written-down code can be read. */
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const RECOVERY_GROUPS = 2;
const RECOVERY_GROUP_LEN = 5;
export const RECOVERY_CODE_COUNT = 10;

/** One code, formatted `ABCDE-FGHJK` — about 49 bits. */
function newRecoveryCode(): string {
  const bytes = randomBytes(RECOVERY_GROUPS * RECOVERY_GROUP_LEN);
  const chars = Array.from(
    bytes,
    b => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]!
  );
  const groups: string[] = [];
  for (let i = 0; i < RECOVERY_GROUPS; i++) {
    groups.push(chars.slice(i * RECOVERY_GROUP_LEN, (i + 1) * RECOVERY_GROUP_LEN).join(""));
  }
  return groups.join("-");
}

/**
 * Hashed with a single SHA-256, deliberately, not bcrypt: these are ~49-bit
 * random secrets, not passwords, so there is nothing to slow down a guesser
 * who would need 2^48 attempts — and ten bcrypt comparisons per login attempt
 * would itself be a way to exhaust the server.
 */
export function hashRecoveryCode(code: string): string {
  return createHash("sha256")
    .update(code.replace(/[\s-]/g, "").toUpperCase())
    .digest("hex");
}

/** Ten fresh codes, plus the hashes to store. The codes are never stored. */
export function generateRecoveryCodes(): {
  codes: string[];
  hashes: string[];
} {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
  return { codes, hashes: codes.map(hashRecoveryCode) };
}

/**
 * Finds which stored hash a code matches, or null. The caller removes that
 * hash: a recovery code works exactly once.
 */
export function matchRecoveryCode(
  code: string,
  hashes: string[]
): number | null {
  const given = Buffer.from(hashRecoveryCode(code), "hex");
  for (let i = 0; i < hashes.length; i++) {
    let stored: Buffer;
    try {
      stored = Buffer.from(hashes[i]!, "hex");
    } catch {
      continue;
    }
    if (stored.length === given.length && timingSafeEqual(stored, given)) {
      return i;
    }
  }
  return null;
}
