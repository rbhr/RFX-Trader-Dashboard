import { beforeAll, describe, expect, it } from "vitest";

/**
 * These tokens are a standing authority to send mail as a real person, so the
 * properties worth pinning are: a ciphertext cannot be read without the key, a
 * tampered one fails loudly rather than decrypting to something chosen by
 * whoever tampered, and a bad key is rejected at setup instead of silently
 * encrypting everything under something nobody can reproduce.
 */

process.env.EMAIL_TOKEN_KEY = "a".repeat(64);
process.env.JWT_SECRET = "test-cookie-secret";

let mod: typeof import("./emailTokenCrypto");

beforeAll(async () => {
  mod = await import("./emailTokenCrypto");
});

describe("token encryption", () => {
  it("round-trips a token", () => {
    const token = "1//0gAbCdEf-refresh-token_value";
    expect(mod.decryptToken(mod.encryptToken(token))).toBe(token);
  });

  it("does not leave the plaintext anywhere in the ciphertext", () => {
    const token = "super-secret-refresh-token";
    const enc = mod.encryptToken(token);
    expect(enc).not.toContain(token);
    expect(Buffer.from(enc, "utf8").toString("base64")).not.toContain(token);
  });

  it("produces a different ciphertext each time, so repeats are not detectable", () => {
    const token = "same-token";
    expect(mod.encryptToken(token)).not.toBe(mod.encryptToken(token));
  });

  it("is versioned, so the scheme can change without guessing at old rows", () => {
    expect(mod.encryptToken("x").startsWith("v1.")).toBe(true);
    expect(mod.encryptToken("x").split(".")).toHaveLength(4);
  });

  it("refuses a tampered ciphertext instead of returning wrong bytes", () => {
    const enc = mod.encryptToken("a-real-token");
    const parts = enc.split(".");
    // Flip a character of the ciphertext segment.
    const flipped = parts[3][0] === "A" ? "B" : "A";
    parts[3] = flipped + parts[3].slice(1);
    expect(() => mod.decryptToken(parts.join("."))).toThrow();
  });

  it("refuses a swapped auth tag", () => {
    const a = mod.encryptToken("token-a").split(".");
    const b = mod.encryptToken("token-b").split(".");
    expect(() => mod.decryptToken([a[0], a[1], b[2], a[3]].join("."))).toThrow();
  });

  it("rejects a value that is not in the expected format", () => {
    expect(() => mod.decryptToken("not-a-token")).toThrow(/expected v1 format/i);
    expect(() => mod.decryptToken("v2.a.b.c")).toThrow(/expected v1 format/i);
  });

  it("reports that a key is configured", () => {
    expect(mod.hasEmailTokenKey()).toBe(true);
  });
});

describe("invite signatures", () => {
  it("verifies a signature it produced", () => {
    const nonce = mod.newInviteNonce();
    expect(mod.verifyInviteSignature(nonce, mod.signInviteNonce(nonce))).toBe(true);
  });

  it("rejects a signature for a different nonce", () => {
    const a = mod.newInviteNonce();
    const b = mod.newInviteNonce();
    expect(mod.verifyInviteSignature(a, mod.signInviteNonce(b))).toBe(false);
  });

  it("rejects a wrong-length signature without throwing", () => {
    const nonce = mod.newInviteNonce();
    expect(mod.verifyInviteSignature(nonce, "short")).toBe(false);
    expect(mod.verifyInviteSignature(nonce, "")).toBe(false);
  });

  it("mints url-safe nonces that do not repeat", () => {
    const seen = new Set(Array.from({ length: 200 }, () => mod.newInviteNonce()));
    expect(seen.size).toBe(200);
    for (const n of seen) expect(n).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("key validation", () => {
  it("accepts 64 hex characters", () => {
    expect(mod.parseEmailTokenKey("a".repeat(64))).toHaveLength(32);
  });

  it("accepts base64 of 32 bytes", () => {
    const b64 = Buffer.alloc(32, 7).toString("base64");
    expect(mod.parseEmailTokenKey(b64).equals(Buffer.alloc(32, 7))).toBe(true);
  });

  it("tolerates surrounding whitespace, which a copy-paste usually brings", () => {
    expect(mod.parseEmailTokenKey(`  ${"b".repeat(64)}\n`)).toHaveLength(32);
  });

  it("rejects a short key rather than padding or hashing it into one", () => {
    // A short key that still "worked" would encrypt every token under
    // something nobody could reproduce later.
    expect(() => mod.parseEmailTokenKey("too-short")).toThrow(/32 bytes/);
  });

  it("rejects hex of the wrong length", () => {
    expect(() => mod.parseEmailTokenKey("ab".repeat(16))).toThrow(/32 bytes/);
    expect(() => mod.parseEmailTokenKey("ab".repeat(48))).toThrow(/32 bytes/);
  });

  it("rejects base64 that decodes to the wrong length", () => {
    expect(() => mod.parseEmailTokenKey(Buffer.alloc(16, 1).toString("base64"))).toThrow(
      /32 bytes/
    );
  });

  it("says what to do when no key is set at all", () => {
    expect(() => mod.parseEmailTokenKey("")).toThrow(/openssl rand -hex 32/);
    expect(() => mod.parseEmailTokenKey("   ")).toThrow(/is not set/);
  });
});
