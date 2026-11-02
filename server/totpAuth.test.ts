import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";

// The database and the key both stay out of this: what is under test is the
// rules around a code, not storage or AES.
const updateMagicNumber = vi.fn();
vi.mock("./db", () => ({
  updateMagicNumber: (...args: unknown[]) => updateMagicNumber(...args),
}));
vi.mock("./emailTokenCrypto", () => ({
  encryptToken: (s: string) => `enc:${s}`,
  decryptToken: (s: string) => s.replace(/^enc:/, ""),
}));

const { completeTotpEnrolment, consumeTotpCode, recoveryCodesRemaining, totpEnabled } =
  await import("./totpAuth");
const { generateRecoveryCodes, generateTotpSecret, totpCodeForStep, totpStep } =
  await import("./totp");

/**
 * The rules that make a correct code fail. The arithmetic is covered by the
 * RFC vectors in totp.test.ts; everything here is about what must not happen
 * twice — the defence against a code read over a shoulder or off a phishing
 * page, which is otherwise good for a full 30 seconds.
 */

const SECRET = generateTotpSecret();
const now = new Date("2026-11-02T12:00:00Z");
const STEP = totpStep(now);

// Each test uses its own id: the attempt limiter is process-local and keyed on
// the trader, so sharing one would leak state between tests.
let nextId = 5000;
const trader = (over: Partial<Parameters<typeof consumeTotpCode>[0]> = {}) => ({
  id: nextId++,
  magicNumber: "RFXAdmin",
  totpSecret: `enc:${SECRET}`,
  totpEnabledAt: new Date("2026-11-01T00:00:00Z"),
  totpLastStep: null,
  totpRecoveryCodes: null,
  ...over,
});

beforeEach(() => updateMagicNumber.mockReset());

describe("totpEnabled", () => {
  it("needs both a secret and a confirmed enrolment", () => {
    expect(totpEnabled({ totpSecret: "enc:x", totpEnabledAt: now })).toBe(true);
    // A started-but-unconfirmed enrolment must not lock anybody out.
    expect(totpEnabled({ totpSecret: "enc:x", totpEnabledAt: null })).toBe(false);
    expect(totpEnabled({ totpSecret: null, totpEnabledAt: now })).toBe(false);
  });
});

describe("consumeTotpCode", () => {
  it("accepts a current code and records the step it spent", async () => {
    const t = trader();
    const code = totpCodeForStep(SECRET, STEP);
    await expect(consumeTotpCode(t, code, now)).resolves.toBe("totp");
    expect(updateMagicNumber).toHaveBeenCalledWith(t.id, { totpLastStep: STEP });
  });

  it("refuses a code for a step already spent — no replay", async () => {
    const t = trader({ totpLastStep: STEP });
    const code = totpCodeForStep(SECRET, STEP);
    await expect(consumeTotpCode(t, code, now)).resolves.toBeNull();
    expect(updateMagicNumber).not.toHaveBeenCalled();
  });

  it("refuses an earlier step than the one spent, inside the skew window", async () => {
    const t = trader({ totpLastStep: STEP });
    const code = totpCodeForStep(SECRET, STEP - 1);
    await expect(consumeTotpCode(t, code, now)).resolves.toBeNull();
  });

  it("accepts the next step after one has been spent", async () => {
    const t = trader({ totpLastStep: STEP - 1 });
    const code = totpCodeForStep(SECRET, STEP);
    await expect(consumeTotpCode(t, code, now)).resolves.toBe("totp");
  });

  it("does nothing for an account with no authenticator", async () => {
    const t = trader({ totpSecret: null, totpEnabledAt: null });
    await expect(
      consumeTotpCode(t, totpCodeForStep(SECRET, STEP), now)
    ).resolves.toBeNull();
    expect(updateMagicNumber).not.toHaveBeenCalled();
  });

  it("accepts a recovery code and stores the list without it", async () => {
    const { codes, hashes } = generateRecoveryCodes();
    const t = trader({ totpRecoveryCodes: JSON.stringify(hashes) });

    await expect(consumeTotpCode(t, codes[2]!, now)).resolves.toBe("recovery");
    const [, patch] = updateMagicNumber.mock.calls[0]!;
    const remaining: string[] = JSON.parse(patch.totpRecoveryCodes);
    expect(remaining).toHaveLength(9);
    expect(remaining).not.toContain(hashes[2]);
  });

  it("will not take the same recovery code twice", async () => {
    const { codes, hashes } = generateRecoveryCodes();
    const t = trader({ totpRecoveryCodes: JSON.stringify(hashes) });
    await consumeTotpCode(t, codes[0]!, now);

    // Second attempt sees the row as it now stands.
    const [, patch] = updateMagicNumber.mock.calls[0]!;
    const after = trader({ totpRecoveryCodes: patch.totpRecoveryCodes });
    await expect(consumeTotpCode(after, codes[0]!, now)).resolves.toBeNull();
  });

  it("rejects a wrong code without touching the row", async () => {
    const t = trader();
    await expect(consumeTotpCode(t, "000000", now)).resolves.toBeNull();
    await expect(consumeTotpCode(t, "not-a-code", now)).resolves.toBeNull();
    expect(updateMagicNumber).not.toHaveBeenCalled();
  });

  it("survives a corrupt recovery-code column", async () => {
    const t = trader({ totpRecoveryCodes: "{not json" });
    await expect(consumeTotpCode(t, "ABCDE-FGHJK", now)).resolves.toBeNull();
  });

  it("locks out after five wrong codes — six digits is guessable otherwise", async () => {
    const t = trader();
    for (let i = 0; i < 5; i++) {
      await expect(consumeTotpCode(t, "000000", now)).resolves.toBeNull();
    }
    await expect(consumeTotpCode(t, "000000", now)).rejects.toBeInstanceOf(TRPCError);
    // And a correct code is refused too, for as long as the lockout lasts.
    await expect(
      consumeTotpCode(t, totpCodeForStep(SECRET, STEP), now)
    ).rejects.toThrow(/Too many authenticator attempts/);
  });

  it("clears the lockout counter once a code is accepted", async () => {
    const t = trader();
    for (let i = 0; i < 4; i++) await consumeTotpCode(t, "000000", now);
    await expect(
      consumeTotpCode(t, totpCodeForStep(SECRET, STEP), now)
    ).resolves.toBe("totp");
    // Four more wrong ones would have tripped the cap had it not reset.
    for (let i = 0; i < 4; i++) {
      await expect(consumeTotpCode(t, "000000", now)).resolves.toBeNull();
    }
  });
});

describe("completeTotpEnrolment", () => {
  it("turns it on and hands back ten codes, storing only hashes", async () => {
    const t = trader({ totpEnabledAt: null });
    const codes = await completeTotpEnrolment(t, totpCodeForStep(SECRET, STEP), now);

    expect(codes).toHaveLength(10);
    const [, patch] = updateMagicNumber.mock.calls[0]!;
    expect(patch.totpEnabledAt).toEqual(now);
    expect(patch.totpLastStep).toBe(STEP);
    const stored: string[] = JSON.parse(patch.totpRecoveryCodes);
    expect(stored).toHaveLength(10);
    for (const code of codes) expect(stored).not.toContain(code);
  });

  it("refuses a wrong code and leaves it off", async () => {
    const t = trader({ totpEnabledAt: null });
    await expect(completeTotpEnrolment(t, "000000", now)).rejects.toBeInstanceOf(
      TRPCError
    );
    expect(updateMagicNumber).not.toHaveBeenCalled();
  });

  it("refuses when no enrolment was started", async () => {
    const t = trader({ totpSecret: null, totpEnabledAt: null });
    await expect(
      completeTotpEnrolment(t, totpCodeForStep(SECRET, STEP), now)
    ).rejects.toThrow(/Start the authenticator setup again/);
  });
});

describe("recoveryCodesRemaining", () => {
  it("counts what is left, and copes with nothing stored", () => {
    const { hashes } = generateRecoveryCodes();
    expect(recoveryCodesRemaining(trader({ totpRecoveryCodes: JSON.stringify(hashes) }))).toBe(10);
    expect(recoveryCodesRemaining(trader({ totpRecoveryCodes: JSON.stringify(hashes.slice(3)) }))).toBe(7);
    expect(recoveryCodesRemaining(trader())).toBe(0);
    expect(recoveryCodesRemaining(trader({ totpRecoveryCodes: "junk" }))).toBe(0);
  });
});
