import { TRPCError } from "@trpc/server";

import {
  claimPendingTotpSecret,
  claimRecoveryCodes,
  claimTotpStep,
  updateMagicNumber,
} from "./db";
import { decryptToken, encryptToken } from "./emailTokenCrypto";
import { TOTP_CHANGE_COOL_OFF_HOURS } from "@shared/const";
import { checkRateLimit, resetRateLimit } from "./rateLimit";
import {
  generateRecoveryCodes,
  generateTotpSecret,
  matchRecoveryCode,
  otpauthUri,
  verifyTotpCode,
} from "./totp";

/**
 * The stored side of TOTP: enrolment, and spending a code.
 *
 * Kept apart from `server/totp.ts`, which is the arithmetic and knows nothing
 * about the database. This is the part with the rules that make a correct code
 * still fail — it has already been used, or too many wrong ones have been
 * tried — and the part that must never hand back the secret.
 */

/** How it shows up in an authenticator app. */
const ISSUER = "RFX Trader";

/** Wrong codes allowed before the account is locked out for a while. */
const ATTEMPT_LIMIT = 5;
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000;

export type TotpTrader = {
  id: number;
  magicNumber: string;
  totpSecret: string | null;
  totpPendingSecret?: string | null;
  totpEnabledAt: Date | null;
  totpLastStep: number | null;
  totpRecoveryCodes: string | null;
  totpChangedAt?: Date | null;
};

/** True once the trader has proved they can read codes off their secret. */
export function totpEnabled(trader: {
  totpSecret: string | null;
  totpEnabledAt: Date | null;
}): boolean {
  return !!trader.totpSecret && !!trader.totpEnabledAt;
}

function storedRecoveryHashes(trader: TotpTrader): string[] {
  if (!trader.totpRecoveryCodes) return [];
  try {
    const parsed = JSON.parse(trader.totpRecoveryCodes);
    return Array.isArray(parsed) ? parsed.filter(h => typeof h === "string") : [];
  } catch {
    return [];
  }
}

/** How many recovery codes are left — shown so they can be regenerated. */
export function recoveryCodesRemaining(trader: TotpTrader): number {
  return storedRecoveryHashes(trader).length;
}

/**
 * Starts enrolment: a fresh secret stored as *pending*, and the URI and secret
 * to put in front of the person.
 *
 * Touches nothing that is already in force. A working authenticator, its
 * recovery codes and its replay counter all survive until
 * `completeTotpEnrolment` proves the new secret reached a device — so an
 * enrolment that is started and abandoned, or started by somebody who should
 * not have, leaves the account exactly as it was.
 *
 * It did not always work that way: the first version wrote over `totpSecret`
 * and cleared `totpEnabledAt` and the recovery codes here, which let a stolen
 * session plus the password strip somebody's second factor before proving
 * anything. Whoever calls this must still require a current code to *replace*
 * a working factor — see `startTotpEnrolment`.
 */
export async function beginTotpEnrolment(trader: {
  id: number;
  magicNumber: string;
}): Promise<{ secret: string; uri: string }> {
  const secret = generateTotpSecret();
  await updateMagicNumber(trader.id, {
    totpPendingSecret: encryptToken(secret),
  });
  return {
    secret,
    uri: otpauthUri({ secret, account: trader.magicNumber, issuer: ISSUER }),
  };
}

/**
 * Turns on a secret the trader has just proved they hold, and issues the
 * recovery codes. The plaintext codes are returned exactly once — only their
 * hashes are stored.
 */
export async function completeTotpEnrolment(
  trader: TotpTrader,
  code: string,
  now: Date = new Date()
): Promise<string[]> {
  if (!trader.totpPendingSecret) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Start the authenticator setup again — no pending secret.",
    });
  }
  assertAttemptAllowed(trader.id);

  const step = verifyTotpCode(decryptToken(trader.totpPendingSecret), code, {
    now,
  });
  if (step === null) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "That code is not right. Check the clock on your phone and try again.",
    });
  }
  resetRateLimit(attemptKey(trader.id));

  // Only now does the factor actually change, so this is where the payout hold
  // is stamped — and only when something was displaced.
  const replacing = totpEnabled(trader);
  const { codes, hashes } = generateRecoveryCodes();
  // The database decides whether this enrolment is the one that lands. Two
  // confirmations can verify the same code against the same pending secret —
  // there is no spent-step guard on a first enrolment, deliberately — and each
  // has generated its own recovery codes by this point. Only the request whose
  // conditional UPDATE actually moved the row may return its set; the other
  // caller must be told it failed rather than shown ten dead codes.
  const claimed = await claimPendingTotpSecret(
    trader.id,
    {
      pendingSecret: trader.totpPendingSecret,
      activeSecret: trader.totpSecret ?? null,
    },
    {
      totpSecret: trader.totpPendingSecret,
      totpEnabledAt: now,
      totpLastStep: step,
      totpRecoveryCodes: JSON.stringify(hashes),
      ...(replacing ? { totpChangedAt: now } : {}),
    }
  );
  if (!claimed) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "That setup is no longer the current one. Start the authenticator " +
        "setup again and confirm it once.",
    });
  }
  return codes;
}

/**
 * Turns TOTP off and forgets the secret and the recovery codes, stamping the
 * cool-off so nothing can be paid out for a few hours afterwards.
 */
export async function clearTotp(
  traderId: number,
  now: Date = new Date()
): Promise<void> {
  await updateMagicNumber(traderId, {
    totpSecret: null,
    totpPendingSecret: null,
    totpEnabledAt: null,
    totpLastStep: null,
    totpRecoveryCodes: null,
    totpChangedAt: now,
  });
}

const CHANGE_COOL_OFF_MS = TOTP_CHANGE_COOL_OFF_HOURS * 60 * 60 * 1000;

/**
 * When the hold from removing or replacing an authenticator lifts, or null if
 * there is none — which is the case for an account that has only ever enrolled
 * once, and for every row written before this existed.
 */
export function authenticatorHoldUntil(
  trader: { totpChangedAt?: Date | null },
  now: Date = new Date()
): Date | null {
  if (!trader.totpChangedAt) return null;
  const until = new Date(trader.totpChangedAt.getTime() + CHANGE_COOL_OFF_MS);
  return until.getTime() > now.getTime() ? until : null;
}

/**
 * Refuses to move money while the authenticator is freshly changed. Paired
 * with assertPaymentElevation: on its own, a step-up proves somebody holds the
 * current second factor, which is no help if they only just installed it.
 */
export function assertAuthenticatorSettled(
  trader: { totpChangedAt?: Date | null },
  now: Date = new Date()
): void {
  const until = authenticatorHoldUntil(trader, now);
  if (!until) return;
  throw new TRPCError({
    code: "CONFLICT",
    message:
      `The authenticator on this account was changed less than ` +
      `${TOTP_CHANGE_COOL_OFF_HOURS} hours ago, so payouts are held until ` +
      `${until.toISOString().slice(0, 16).replace("T", " ")} UTC. If you did ` +
      `not change it, treat the account as compromised.`,
  });
}

const attemptKey = (traderId: number) => `totp:${traderId}`;

function assertAttemptAllowed(traderId: number): void {
  if (!checkRateLimit(attemptKey(traderId), ATTEMPT_LIMIT, ATTEMPT_WINDOW_MS)) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many authenticator attempts. Wait five minutes and try again.",
    });
  }
}

/**
 * Spends a code: a 6-digit authenticator code, or one recovery code.
 *
 * Returns which kind was accepted, or null if neither matched. Two rules make
 * a mathematically valid code fail, and both matter more than the arithmetic:
 *
 *  - A step at or below the last one accepted is refused. A code read over
 *    somebody's shoulder, or off a phishing page, is good for 30 seconds
 *    otherwise — this makes it good for nothing once used.
 *  - A recovery code is deleted as it is spent, so it works exactly once.
 *
 * Throws TOO_MANY_REQUESTS past the attempt cap: six digits is 10^6, which is
 * guessable in an afternoon if nothing is counting.
 */
export async function consumeTotpCode(
  trader: TotpTrader,
  code: string,
  now: Date = new Date()
): Promise<"totp" | "recovery" | null> {
  if (!totpEnabled(trader) || !trader.totpSecret) return null;
  assertAttemptAllowed(trader.id);

  const step = verifyTotpCode(decryptToken(trader.totpSecret), code, { now });
  if (step !== null) {
    if (trader.totpLastStep !== null && step <= trader.totpLastStep) {
      // Correct arithmetic, already spent.
      return null;
    }
    // The database decides, not the read above: `claimTotpStep` only reports
    // success for the request whose UPDATE actually advanced the step, so two
    // arriving with the same code cannot both be accepted.
    if (!(await claimTotpStep(trader.id, step))) return null;
    resetRateLimit(attemptKey(trader.id));
    return "totp";
  }

  const hashes = storedRecoveryHashes(trader);
  const index = matchRecoveryCode(code, hashes);
  if (index !== null) {
    const remaining = hashes.filter((_, i) => i !== index);
    // Compare-and-swap against the list as read, for the same reason.
    const claimed = await claimRecoveryCodes(
      trader.id,
      trader.totpRecoveryCodes ?? null,
      JSON.stringify(remaining)
    );
    if (!claimed) return null;
    resetRateLimit(attemptKey(trader.id));
    return "recovery";
  }

  return null;
}
