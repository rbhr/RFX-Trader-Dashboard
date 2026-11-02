import { describe, expect, it } from "vitest";

import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  matchRecoveryCode,
  otpauthUri,
  totpCodeForStep,
  totpStep,
  verifyTotpCode,
} from "./totp";

/**
 * The admin account's second factor. Correctness here is not a matter of
 * opinion — RFC 6238 publishes the vectors, so they are the test. The rest
 * covers what the RFC does not: that a code cannot be replayed, that skew is
 * bounded, and that a recovery code works exactly once.
 */

// RFC 6238 Appendix B, SHA-1 column: the ASCII secret "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "ascii"));

describe("RFC 6238 test vectors (SHA-1)", () => {
  const vectors: [number, string][] = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ];

  for (const [unixSeconds, expected] of vectors) {
    it(`T=${unixSeconds} gives ${expected}`, () => {
      const step = Math.floor(unixSeconds / 30);
      expect(totpCodeForStep(RFC_SECRET, step)).toBe(expected);
    });
  }
});

describe("base32", () => {
  it("round-trips arbitrary bytes", () => {
    for (const len of [1, 2, 5, 10, 20, 32]) {
      const buf = Buffer.from(Array.from({ length: len }, (_, i) => (i * 37) % 256));
      expect(base32Decode(base32Encode(buf))).toEqual(buf);
    }
  });

  it("matches the known encoding of the RFC secret", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });

  it("tolerates the spaces, dashes, padding and case people paste", () => {
    const tidy = base32Decode("GEZDGNBVGY3TQOJQ");
    expect(base32Decode("gezd gnbv gy3t qojq")).toEqual(tidy);
    expect(base32Decode("GEZD-GNBV-GY3T-QOJQ")).toEqual(tidy);
    expect(base32Decode("GEZDGNBVGY3TQOJQ====")).toEqual(tidy);
  });

  it("refuses a character outside the alphabet", () => {
    expect(() => base32Decode("GEZD1NBV")).toThrow();
  });
});

describe("generateTotpSecret", () => {
  it("is 160 bits of base32, and never the same twice", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(base32Decode(a)).toHaveLength(20);
    expect(a).not.toBe(b);
  });
});

describe("verifyTotpCode", () => {
  const now = new Date("2026-11-02T12:00:00Z");
  const step = totpStep(now);

  it("accepts the current code and returns its step", () => {
    const code = totpCodeForStep(RFC_SECRET, step);
    expect(verifyTotpCode(RFC_SECRET, code, { now })).toBe(step);
  });

  it("accepts one step either side, for clock skew", () => {
    expect(
      verifyTotpCode(RFC_SECRET, totpCodeForStep(RFC_SECRET, step - 1), { now })
    ).toBe(step - 1);
    expect(
      verifyTotpCode(RFC_SECRET, totpCodeForStep(RFC_SECRET, step + 1), { now })
    ).toBe(step + 1);
  });

  it("refuses a code two steps away", () => {
    expect(
      verifyTotpCode(RFC_SECRET, totpCodeForStep(RFC_SECRET, step - 2), { now })
    ).toBeNull();
    expect(
      verifyTotpCode(RFC_SECRET, totpCodeForStep(RFC_SECRET, step + 2), { now })
    ).toBeNull();
  });

  it("refuses anything that is not six digits", () => {
    for (const bad of ["", "12345", "1234567", "abcdef", "12 34 5", "0x1234"]) {
      expect(verifyTotpCode(RFC_SECRET, bad, { now })).toBeNull();
    }
  });

  it("refuses a code for a different secret", () => {
    const other = generateTotpSecret();
    expect(
      verifyTotpCode(RFC_SECRET, totpCodeForStep(other, step), { now })
    ).toBeNull();
  });

  it("returns a step the caller can use to refuse a replay", () => {
    // What the login path does: remember the highest step accepted, then
    // require the next one to be strictly higher.
    const code = totpCodeForStep(RFC_SECRET, step);
    const matched = verifyTotpCode(RFC_SECRET, code, { now });
    expect(matched).toBe(step);
    expect(matched! > step - 1).toBe(true);
    expect(matched! > step).toBe(false);
  });
});

describe("otpauthUri", () => {
  it("carries the secret, issuer and explicit parameters", () => {
    const uri = otpauthUri({
      secret: RFC_SECRET,
      account: "RFXAdmin",
      issuer: "RFX Trader",
    });
    expect(uri.startsWith("otpauth://totp/RFX%20Trader%3ARFXAdmin?")).toBe(true);
    expect(uri).toContain(`secret=${RFC_SECRET}`);
    expect(uri).toContain("issuer=RFX+Trader");
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });
});

describe("recovery codes", () => {
  it("issues ten codes with their hashes, and no code twice", () => {
    const { codes, hashes } = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(hashes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    codes.forEach((c, i) => expect(hashRecoveryCode(c)).toBe(hashes[i]));
  });

  it("uses an alphabet without look-alike characters", () => {
    const { codes } = generateRecoveryCodes();
    for (const code of codes) {
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  it("matches a code however it is typed back", () => {
    const { codes, hashes } = generateRecoveryCodes();
    expect(matchRecoveryCode(codes[3]!, hashes)).toBe(3);
    expect(matchRecoveryCode(codes[3]!.toLowerCase(), hashes)).toBe(3);
    expect(matchRecoveryCode(codes[3]!.replace("-", ""), hashes)).toBe(3);
    expect(matchRecoveryCode(` ${codes[3]!} `, hashes)).toBe(3);
  });

  it("does not match a code that was not issued", () => {
    const { hashes } = generateRecoveryCodes();
    expect(matchRecoveryCode("ABCDE-FGHJK", hashes)).toBeNull();
    expect(matchRecoveryCode("", hashes)).toBeNull();
  });

  it("stops matching once its hash is removed — a code works once", () => {
    const { codes, hashes } = generateRecoveryCodes();
    const used = codes[0]!;
    const remaining = hashes.filter((_, i) => i !== 0);
    expect(matchRecoveryCode(used, hashes)).toBe(0);
    expect(matchRecoveryCode(used, remaining)).toBeNull();
  });

  it("survives a corrupt stored hash instead of throwing", () => {
    const { codes, hashes } = generateRecoveryCodes();
    const withJunk = ["not-hex", ...hashes];
    expect(matchRecoveryCode(codes[0]!, withJunk)).toBe(1);
  });
});
