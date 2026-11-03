import { eq, ne, desc, isNull, isNotNull, sql, or, and, gt, gte, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  magicNumbers,
  tradingSessions,
  InsertMagicNumber,
  InsertTradingSession,
  copierTemplates,
  InsertCopierTemplate,
  payments,
  InsertPayment,
  notifications,
  InsertNotification,
  riskLimitBreaches,
  InsertRiskLimitBreach,
  traderPreviousMagicNumbers,
  traderPreviousMasterAccounts,
  twoFactorCodes,
  adminSettings,
  logs,
  InsertLog,
  emailSenders,
  trustedDevices,
  type EmailSender,
  type TwoFactorPurpose,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { deviceExpiry, hashDeviceToken } from "./trustedDevice";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Magic Number queries
export async function getMagicNumberByNumber(magicNumber: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(magicNumbers)
    .where(eq(magicNumbers.magicNumber, magicNumber))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getMagicNumbersByTelegramHandle(handle: string) {
  const db = await getDb();
  if (!db) return [];

  const normalised = handle.startsWith("@") ? handle.slice(1) : handle;
  const withAt = `@${normalised}`;

  return db
    .select()
    .from(magicNumbers)
    .where(
      or(
        eq(magicNumbers.telegramHandle, normalised),
        eq(magicNumbers.telegramHandle, withAt)
      )
    );
}

export async function getAllActiveMagicNumbers() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(magicNumbers)
    .where(eq(magicNumbers.isActive, true))
    .orderBy(magicNumbers.name);
}

export async function createMagicNumber(data: InsertMagicNumber) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(magicNumbers).values(data);
  return result;
}

// Trading Session queries
export async function createTradingSession(data: InsertTradingSession) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(tradingSessions).values(data);
  return result;
}

export async function getTradingSessionByToken(sessionToken: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select({
      session: tradingSessions,
      magicNumber: magicNumbers,
    })
    .from(tradingSessions)
    .innerJoin(magicNumbers, eq(tradingSessions.magicNumberId, magicNumbers.id))
    .where(eq(tradingSessions.sessionToken, sessionToken))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Records a payment step-up on one session. Scoped to the session rather than
 * the account on purpose: clearing a payment to move money is something a
 * particular browser did, and a second stolen session must not inherit it.
 */
/**
 * Issues a single-use Telegram link token for one trader, replacing any
 * outstanding one.
 */
export async function setTelegramLinkToken(
  magicNumberId: number,
  token: string,
  expiresAt: Date
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(magicNumbers)
    .set({ telegramLinkToken: token, telegramLinkTokenExpiresAt: expiresAt })
    .where(eq(magicNumbers.id, magicNumberId));
}

/**
 * Spends a Telegram link token and returns the trader it belonged to, or
 * undefined. The token is cleared in the same conditional update that claims
 * it, so two `/start`s carrying one token cannot both bind.
 */
export async function consumeTelegramLinkToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;

  const rows = await db
    .select()
    .from(magicNumbers)
    .where(
      and(
        eq(magicNumbers.telegramLinkToken, token),
        gt(magicNumbers.telegramLinkTokenExpiresAt, new Date())
      )
    )
    .limit(1);
  if (rows.length === 0) return undefined;

  const [claim] = await db
    .update(magicNumbers)
    .set({ telegramLinkToken: null, telegramLinkTokenExpiresAt: null })
    .where(
      and(
        eq(magicNumbers.id, rows[0]!.id),
        eq(magicNumbers.telegramLinkToken, token)
      )
    );
  if (((claim as { affectedRows?: number }).affectedRows ?? 0) !== 1) {
    return undefined;
  }
  return rows[0];
}

export async function markSessionTotpVerified(
  sessionToken: string,
  at: Date = new Date()
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(tradingSessions)
    .set({ totpVerifiedAt: at })
    .where(eq(tradingSessions.sessionToken, sessionToken));
}

/**
 * Ends a trader's sessions, optionally sparing the one making the request.
 *
 * A password change has to do this. On 2026-11-02 the attacker's three
 * sessions stayed valid until 9 November, and rotating the password would not
 * have touched them — the only thing that evicted them was deleting the table
 * by hand. A stolen session is exactly what someone changes their password
 * because of.
 */
export async function deleteTradingSessionsForTrader(
  magicNumberId: number,
  exceptToken?: string
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const where = exceptToken
    ? and(
        eq(tradingSessions.magicNumberId, magicNumberId),
        ne(tradingSessions.sessionToken, exceptToken)
      )
    : eq(tradingSessions.magicNumberId, magicNumberId);

  const [result] = await db.delete(tradingSessions).where(where);
  return (result as { affectedRows?: number }).affectedRows ?? 0;
}

export async function deleteTradingSession(sessionToken: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(tradingSessions)
    .where(eq(tradingSessions.sessionToken, sessionToken));
}

export async function cleanupExpiredSessions() {
  const db = await getDb();
  if (!db) return;

  await db
    .delete(tradingSessions)
    .where(lt(tradingSessions.expiresAt, new Date()));
}

// Trader management functions
export async function getAllMagicNumbers() {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(magicNumbers).orderBy(magicNumbers.name);
}

export async function getMagicNumberById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(magicNumbers)
    .where(eq(magicNumbers.id, id))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function updateMagicNumber(
  id: number,
  data: Partial<InsertMagicNumber>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(magicNumbers).set(data).where(eq(magicNumbers.id, id));
}

export async function deleteMagicNumber(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Delete associated sessions first
  await db.delete(tradingSessions).where(eq(tradingSessions.magicNumberId, id));
  // Then delete the magic number
  await db.delete(magicNumbers).where(eq(magicNumbers.id, id));
}

// Copier template management functions
export async function getAllCopierTemplates() {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(copierTemplates).orderBy(copierTemplates.name);
}

export async function getCopierTemplateById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(copierTemplates)
    .where(eq(copierTemplates.id, id))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function createCopierTemplate(data: InsertCopierTemplate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(copierTemplates).values(data);
  return result;
}

export async function updateCopierTemplate(
  id: number,
  data: Partial<InsertCopierTemplate>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(copierTemplates).set(data).where(eq(copierTemplates.id, id));
}

export async function deleteCopierTemplate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(copierTemplates).where(eq(copierTemplates.id, id));
}

// Payment management functions
export async function createPayment(data: InsertPayment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(payments).values(data);
  return result;
}

/**
 * Inserts a payment and returns its id, so a broadcast-but-unconfirmed payout
 * can be found again by `paymentConfirmer`.
 */
export async function createPaymentReturningId(
  data: InsertPayment
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result: any = await db.insert(payments).values(data);
  // mysql2 returns the ResultSetHeader first; drizzle surfaces it as [header].
  const insertId = Array.isArray(result)
    ? result[0]?.insertId
    : result?.insertId;
  if (!insertId) {
    throw new Error("Payment insert returned no id");
  }
  return Number(insertId);
}

/** Payouts that were broadcast but not yet settled, oldest first. */
export async function getPendingPayments() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(payments)
    .where(eq(payments.status, "Pending"))
    .orderBy(payments.id);
}

/**
 * Marks a pending payout settled. `transactionHash` is passed when the real
 * hash only became known after the row was written.
 */
export async function markPaymentConfirmed(
  id: number,
  transactionHash?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(payments)
    .set({
      status: "Confirmed",
      confirmedAt: new Date(),
      // Confirmation is immediately followed by announcing the payment, which
      // is what recordConfirmedPayment flags at insert for a settled payment.
      notificationSent: true,
      ...(transactionHash ? { transactionHash } : {}),
    })
    .where(eq(payments.id, id));
}

/**
 * Marks a pending payout failed. Only for transfers the network definitively
 * rejected — never for one we merely could not confirm, because that would
 * invite a re-send of money that already moved.
 */
export async function markPaymentFailed(id: number, reason: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(payments)
    .set({ status: "Failed", failureReason: reason.slice(0, 500) })
    .where(eq(payments.id, id));
}

export async function getPaymentsByMagicNumberId(magicNumberId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(payments)
    .where(eq(payments.magicNumberId, magicNumberId))
    .orderBy(desc(payments.paymentDate));
}

export async function getAllPayments() {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(payments).orderBy(desc(payments.paymentDate));
}

export async function updatePaymentNotificationStatus(
  id: number,
  sent: boolean
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(payments)
    .set({ notificationSent: sent })
    .where(eq(payments.id, id));
}

export async function updatePaymentTransactionHash(
  id: number,
  transactionHash: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(payments).set({ transactionHash }).where(eq(payments.id, id));
}

// Notification management functions
export async function createNotification(data: InsertNotification) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(notifications).values(data);
  return result;
}

export async function getNotificationsByMagicNumberId(magicNumberId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(notifications)
    .where(eq(notifications.magicNumberId, magicNumberId))
    .orderBy(desc(notifications.createdAt));
}

/** Atomically add an amount to a trader's lifetimeIncome (avoids read-modify-write races). */
export async function incrementLifetimeIncome(
  magicNumberId: number,
  amount: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(magicNumbers)
    .set({
      lifetimeIncome: sql`COALESCE(${magicNumbers.lifetimeIncome}, 0) + ${amount.toFixed(2)}`,
    })
    .where(eq(magicNumbers.id, magicNumberId));
}

/** Set a trader's profit-share high-water-mark baseline (cumulative profit already paid share on). */
export async function setProfitShareBaseline(
  magicNumberId: number,
  amount: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(magicNumbers)
    .set({ profitShareBaseline: amount.toFixed(2) })
    .where(eq(magicNumbers.id, magicNumberId));
}

/** Set a trader's manual profit adjustment (running ± total added to cumulative realized profit). */
export async function setProfitAdjustment(
  magicNumberId: number,
  amount: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(magicNumbers)
    .set({ profitAdjustment: amount.toFixed(2) })
    .where(eq(magicNumbers.id, magicNumberId));
}

/**
 * Latest covered-through date for a trader's profit-share payouts (used for the
 * cycle waiting period). Uses payoutPeriodTo only — undated legacy/manual
 * payments don't gate payouts — and ignores [TEST] testing-mode payouts.
 */
export async function getLastProfitSharePaymentDate(
  magicNumberId: number
): Promise<Date | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.magicNumberId, magicNumberId),
        eq(payments.paymentType, "Profit Share"),
        isNotNull(payments.payoutPeriodTo),
        // Testing-mode payouts are recorded as Profit Share with a [TEST]
        // narration — they must not gate real payouts' waiting period.
        sql`(${payments.narration} IS NULL OR ${payments.narration} NOT LIKE '[TEST]%')`
      )
    )
    .orderBy(desc(payments.payoutPeriodTo))
    .limit(1);

  return rows[0]?.payoutPeriodTo ?? null;
}

export async function markNotificationAsRead(id: number, magicNumberId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.magicNumberId, magicNumberId)
      )
    );
}

export async function markAllNotificationsAsRead(magicNumberId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.magicNumberId, magicNumberId));
}

// Risk Limit Breach management functions
export async function createRiskLimitBreach(data: InsertRiskLimitBreach) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(riskLimitBreaches).values(data);
  return result;
}

export async function getActiveBreachByMagicNumberId(magicNumberId: number) {
  const db = await getDb();
  if (!db) return undefined;

  // Equity breaches only. Looking at "the latest row" let a later daily-loss
  // row hide an unresolved equity breach, and the monitor then re-recorded it.
  const result = await db
    .select()
    .from(riskLimitBreaches)
    .where(
      and(
        eq(riskLimitBreaches.magicNumberId, magicNumberId),
        eq(riskLimitBreaches.breachType, "equity"),
        isNull(riskLimitBreaches.resolvedAt)
      )
    )
    .orderBy(desc(riskLimitBreaches.createdAt))
    .limit(1);

  return result[0];
}

/** True if this trader's daily loss limit was already recorded since `since`. */
export async function hasDailyBreachSince(
  magicNumberId: number,
  since: Date
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db
    .select({ id: riskLimitBreaches.id })
    .from(riskLimitBreaches)
    .where(
      and(
        eq(riskLimitBreaches.magicNumberId, magicNumberId),
        eq(riskLimitBreaches.breachType, "daily"),
        gte(riskLimitBreaches.createdAt, since)
      )
    )
    .limit(1);
  return result.length > 0;
}

export async function getAllRiskLimitBreaches() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(riskLimitBreaches)
    .orderBy(desc(riskLimitBreaches.createdAt));
}

export async function resolveRiskLimitBreach(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(riskLimitBreaches)
    .set({ resolvedAt: new Date() })
    .where(eq(riskLimitBreaches.id, id));
}

export async function countActiveRiskLimitBreaches(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(riskLimitBreaches)
    .where(isNull(riskLimitBreaches.resolvedAt));

  return Number(result[0]?.count ?? 0);
}

export async function bulkResolveRiskLimitBreaches(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get all active breach IDs first so we can re-enable trading for each trader
  const active = await db
    .select()
    .from(riskLimitBreaches)
    .where(isNull(riskLimitBreaches.resolvedAt));

  if (active.length === 0) return 0;

  // Mark all active breaches as resolved in one update
  await db
    .update(riskLimitBreaches)
    .set({ resolvedAt: new Date() })
    .where(isNull(riskLimitBreaches.resolvedAt));

  return active.length;
}

// Hard-delete a single breach record by id (data cleanup; does not re-enable
// trading — that's resolveRiskLimitBreach).
export async function deleteRiskLimitBreach(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(riskLimitBreaches).where(eq(riskLimitBreaches.id, id));
}

// ---- System event log (persistent) --------------------------------------

export async function createLog(data: InsertLog): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // text column is generous, but guard against pathologically long messages
  const message =
    data.message.length > 2000 ? data.message.slice(0, 2000) + "…" : data.message;
  await db.insert(logs).values({ ...data, message });
}

export async function getLogsPaged(opts: {
  category?: string;
  limit: number;
  offset: number;
}): Promise<{ entries: (typeof logs.$inferSelect)[]; total: number }> {
  const db = await getDb();
  if (!db) return { entries: [], total: 0 };

  const where = opts.category ? eq(logs.category, opts.category) : undefined;
  const entries = await db
    .select()
    .from(logs)
    .where(where)
    .orderBy(desc(logs.id)) // latest first
    .limit(opts.limit)
    .offset(opts.offset);

  const countRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(logs)
    .where(where);
  const total = Number(countRows[0]?.count ?? 0);

  return { entries, total };
}

// Hard-delete all resolved (historical) breach records. Active breaches are
// left untouched. Returns the number deleted.
export async function clearResolvedRiskLimitBreaches(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Resolved EQUITY breaches only — daily loss hits are stored resolved, and
  // the button lives on the Resolved Breaches card, not theirs.
  const resolvedEquity = and(
    isNotNull(riskLimitBreaches.resolvedAt),
    eq(riskLimitBreaches.breachType, "equity")
  );
  const resolved = await db
    .select({ id: riskLimitBreaches.id })
    .from(riskLimitBreaches)
    .where(resolvedEquity);

  if (resolved.length === 0) return 0;

  await db.delete(riskLimitBreaches).where(resolvedEquity);

  return resolved.length;
}

// Previous Magic Numbers CRUD
export async function getPreviousMagicNumbers(magicNumberId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(traderPreviousMagicNumbers)
    .where(eq(traderPreviousMagicNumbers.magicNumberId, magicNumberId))
    .orderBy(desc(traderPreviousMagicNumbers.createdAt));
}

export async function addPreviousMagicNumber(
  magicNumberId: number,
  previousMagicNumber: string,
  note?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(traderPreviousMagicNumbers).values({
    magicNumberId,
    previousMagicNumber,
    note: note ?? null,
  });
  return result;
}

export async function removePreviousMagicNumber(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(traderPreviousMagicNumbers)
    .where(eq(traderPreviousMagicNumbers.id, id));
}

// Previous Master Accounts CRUD
export async function getPreviousMasterAccounts(magicNumberId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(traderPreviousMasterAccounts)
    .where(eq(traderPreviousMasterAccounts.magicNumberId, magicNumberId))
    .orderBy(desc(traderPreviousMasterAccounts.createdAt));
}

export async function addPreviousMasterAccount(
  magicNumberId: number,
  liveAccountNumber: string,
  note?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(traderPreviousMasterAccounts).values({
    magicNumberId,
    liveAccountNumber,
    note: note ?? null,
  });
  return result;
}

export async function removePreviousMasterAccount(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(traderPreviousMasterAccounts)
    .where(eq(traderPreviousMasterAccounts.id, id));
}

// Two-Factor Authentication functions
export async function createTwoFactorCode(
  magicNumberId: number,
  code: string,
  purpose: TwoFactorPurpose
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Only one live code per trader+purpose: stacking multiple un-expired
  // codes multiplies an attacker's brute-force odds.
  await db
    .update(twoFactorCodes)
    .set({ used: true })
    .where(
      and(
        eq(twoFactorCodes.magicNumberId, magicNumberId),
        eq(twoFactorCodes.purpose, purpose),
        eq(twoFactorCodes.used, false)
      )
    );

  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 5);

  await db.insert(twoFactorCodes).values({
    magicNumberId,
    code,
    purpose,
    expiresAt,
  });
}

/** Burns all outstanding codes for a trader+purpose (used when the attempt cap is hit). */
export async function invalidateTwoFactorCodes(
  magicNumberId: number,
  purpose: TwoFactorPurpose
) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(twoFactorCodes)
    .set({ used: true })
    .where(
      and(
        eq(twoFactorCodes.magicNumberId, magicNumberId),
        eq(twoFactorCodes.purpose, purpose),
        eq(twoFactorCodes.used, false)
      )
    );
}

export async function verifyTwoFactorCode(
  magicNumberId: number,
  code: string,
  purpose: TwoFactorPurpose
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db
    .select()
    .from(twoFactorCodes)
    .where(
      and(
        eq(twoFactorCodes.magicNumberId, magicNumberId),
        eq(twoFactorCodes.code, code),
        eq(twoFactorCodes.purpose, purpose),
        eq(twoFactorCodes.used, false),
        gt(twoFactorCodes.expiresAt, new Date())
      )
    )
    .limit(1);

  if (result.length === 0) return false;

  // Claim it, rather than trusting the read above. `used: false` in the WHERE
  // is what makes a code single-use under concurrency: two requests carrying
  // the same code both pass the select, and only the one whose UPDATE actually
  // changed a row is accepted.
  const [claim] = await db
    .update(twoFactorCodes)
    .set({ used: true })
    .where(and(eq(twoFactorCodes.id, result[0].id), eq(twoFactorCodes.used, false)));

  return ((claim as { affectedRows?: number }).affectedRows ?? 0) === 1;
}

/**
 * Records a TOTP step as spent, and says whether this caller was the one to
 * spend it.
 *
 * The step must advance, checked in the UPDATE itself: a read-then-write let
 * two concurrent requests carrying the same 6-digit code both see the old step
 * and both be accepted, which is the replay the step number exists to stop.
 */
export async function claimTotpStep(
  magicNumberId: number,
  step: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const [result] = await db
    .update(magicNumbers)
    .set({ totpLastStep: step })
    .where(
      and(
        eq(magicNumbers.id, magicNumberId),
        or(isNull(magicNumbers.totpLastStep), lt(magicNumbers.totpLastStep, step))
      )
    );
  return ((result as { affectedRows?: number }).affectedRows ?? 0) === 1;
}

/**
 * Swaps the stored recovery-code list for one with a code removed, only if the
 * list is still exactly as the caller read it. Compare-and-swap, so two
 * requests spending the same code cannot both succeed.
 */
export async function claimRecoveryCodes(
  magicNumberId: number,
  previous: string | null,
  next: string
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const [result] = await db
    .update(magicNumbers)
    .set({ totpRecoveryCodes: next })
    .where(
      and(
        eq(magicNumbers.id, magicNumberId),
        previous === null
          ? isNull(magicNumbers.totpRecoveryCodes)
          : eq(magicNumbers.totpRecoveryCodes, previous)
      )
    );
  return ((result as { affectedRows?: number }).affectedRows ?? 0) === 1;
}

/**
 * Promotes a pending TOTP secret to the active one, but only if the row still
 * holds exactly the pending and active secrets the caller verified against.
 *
 * Compare-and-swap, for the same reason as `claimTotpStep` above: two
 * confirmations of one enrolment each generate their own recovery codes, and
 * an unconditional write would let both report success while only the last
 * set stayed valid — leaving the first caller holding ten dead codes. It also
 * stops a stale confirmation from overwriting a newer enrolment.
 */
export async function claimPendingTotpSecret(
  magicNumberId: number,
  expected: { pendingSecret: string; activeSecret: string | null },
  next: {
    totpSecret: string;
    totpEnabledAt: Date;
    totpLastStep: number;
    totpRecoveryCodes: string;
    totpChangedAt?: Date;
  }
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const [result] = await db
    .update(magicNumbers)
    .set({ ...next, totpPendingSecret: null })
    .where(
      and(
        eq(magicNumbers.id, magicNumberId),
        eq(magicNumbers.totpPendingSecret, expected.pendingSecret),
        expected.activeSecret === null
          ? isNull(magicNumbers.totpSecret)
          : eq(magicNumbers.totpSecret, expected.activeSecret)
      )
    );
  return ((result as { affectedRows?: number }).affectedRows ?? 0) === 1;
}

export async function cleanupExpiredTwoFactorCodes() {
  const db = await getDb();
  if (!db) return;

  await db
    .delete(twoFactorCodes)
    .where(lt(twoFactorCodes.expiresAt, new Date()));
}

/**
 * True when this device has completed a full login for this trader before.
 *
 * Replaces `hasSeenDevice`, which asked whether an unexpired session existed
 * from the same IP — see server/trustedDevice.ts. Nothing should go back to
 * trusting an address: household and carrier NAT put strangers behind one.
 *
 * Touches `lastSeenAt` so a device in regular use never expires out from under
 * somebody, and records the address for recognition only.
 */
export async function isTrustedDevice(
  magicNumberId: number,
  token: string | undefined,
  ipAddress: string | null
): Promise<boolean> {
  if (!token) return false;
  const db = await getDb();
  if (!db) return false;

  const hash = hashDeviceToken(token);
  const rows = await db
    .select({ id: trustedDevices.id })
    .from(trustedDevices)
    .where(
      and(
        eq(trustedDevices.magicNumberId, magicNumberId),
        eq(trustedDevices.tokenHash, hash),
        gt(trustedDevices.expiresAt, new Date())
      )
    )
    .limit(1);
  if (rows.length === 0) return false;

  await db
    .update(trustedDevices)
    .set({
      lastSeenAt: new Date(),
      lastIpAddress: ipAddress,
      expiresAt: deviceExpiry(),
    })
    .where(eq(trustedDevices.id, rows[0]!.id));
  return true;
}

/**
 * Remembers a device for this trader, or refreshes the row it already has.
 * Called only after a login that satisfied whatever challenge applied.
 */
export async function trustDevice(opts: {
  magicNumberId: number;
  token: string;
  userAgent: string | null;
  ipAddress: string | null;
}) {
  const db = await getDb();
  if (!db) return;

  const hash = hashDeviceToken(opts.token);
  const existing = await db
    .select({ id: trustedDevices.id })
    .from(trustedDevices)
    .where(
      and(
        eq(trustedDevices.magicNumberId, opts.magicNumberId),
        eq(trustedDevices.tokenHash, hash)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(trustedDevices)
      .set({
        lastSeenAt: new Date(),
        lastIpAddress: opts.ipAddress,
        userAgent: opts.userAgent,
        expiresAt: deviceExpiry(),
      })
      .where(eq(trustedDevices.id, existing[0]!.id));
    return;
  }

  await db.insert(trustedDevices).values({
    magicNumberId: opts.magicNumberId,
    tokenHash: hash,
    userAgent: opts.userAgent,
    lastIpAddress: opts.ipAddress,
    expiresAt: deviceExpiry(),
  });
}

/**
 * Forgets every device trusted for a trader, so the next login from each is
 * challenged again. A password change does this for the same reason it ends
 * sessions: whatever was trusted may be in somebody else's hands.
 */
export async function revokeTrustedDevices(
  magicNumberId: number
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db
    .delete(trustedDevices)
    .where(eq(trustedDevices.magicNumberId, magicNumberId));
  return (result as { affectedRows?: number }).affectedRows ?? 0;
}

/** Drops rows whose trust has lapsed. */
export async function cleanupExpiredTrustedDevices() {
  const db = await getDb();
  if (!db) return;

  await db.delete(trustedDevices).where(lt(trustedDevices.expiresAt, new Date()));
}

// Admin settings helpers

export async function getAdminSetting(
  key: string
): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const result = await db
      .select()
      .from(adminSettings)
      .where(eq(adminSettings.key, key))
      .limit(1);
    return result.length > 0 ? result[0].value : null;
  } catch {
    return null;
  }
}

export async function setAdminSetting(
  key: string,
  value: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db
    .select()
    .from(adminSettings)
    .where(eq(adminSettings.key, key))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(adminSettings)
      .set({ value })
      .where(eq(adminSettings.key, key));
  } else {
    await db.insert(adminSettings).values({ key, value });
  }
}

export async function getTrailingRiskLimitTraders() {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db
      .select()
      .from(magicNumbers)
      .where(
        and(
          eq(magicNumbers.isActive, true),
          eq(magicNumbers.trailingRiskLimitEnabled, true),
          sql`${magicNumbers.mcAccountId} IS NOT NULL`,
          sql`${magicNumbers.trailingRiskLimit} IS NOT NULL`
        )
      );
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Mail senders — the mailboxes the app may send invoices as.
// ---------------------------------------------------------------------------

export async function listEmailSenders(): Promise<EmailSender[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(emailSenders).orderBy(emailSenders.emailAddress);
}

export async function getEmailSenderByAddress(
  emailAddress: string
): Promise<EmailSender | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select()
    .from(emailSenders)
    .where(eq(emailSenders.emailAddress, emailAddress.toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

export async function getEmailSenderByNonce(
  nonce: string
): Promise<EmailSender | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select()
    .from(emailSenders)
    .where(eq(emailSenders.inviteNonce, nonce))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Creates or re-invites a sender. Re-inviting clears any existing grant: the
 * old refresh token is about to be replaced, and leaving it in place would mean
 * a half-finished re-invite still sends under the previous authorisation.
 */
export async function upsertEmailSenderInvite(params: {
  emailAddress: string;
  provider: "google" | "microsoft";
  displayName: string | null;
  inviteNonce: string;
  inviteExpiresAt: Date;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const emailAddress = params.emailAddress.toLowerCase();
  const existing = await getEmailSenderByAddress(emailAddress);

  if (existing) {
    await db
      .update(emailSenders)
      .set({
        provider: params.provider,
        displayName: params.displayName,
        status: "Invited",
        refreshTokenEnc: null,
        accessTokenEnc: null,
        accessTokenExpiresAt: null,
        scope: null,
        lastError: null,
        inviteNonce: params.inviteNonce,
        inviteExpiresAt: params.inviteExpiresAt,
        authorizedAt: null,
      })
      .where(eq(emailSenders.id, existing.id));
    return;
  }

  await db.insert(emailSenders).values({
    emailAddress,
    provider: params.provider,
    displayName: params.displayName,
    status: "Invited",
    inviteNonce: params.inviteNonce,
    inviteExpiresAt: params.inviteExpiresAt,
  });
}

/**
 * Stores a completed grant and spends the invite nonce, so an authorise link
 * cannot be replayed.
 */
export async function activateEmailSender(params: {
  id: number;
  refreshTokenEnc: string;
  accessTokenEnc: string;
  accessTokenExpiresAt: Date;
  scope: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(emailSenders)
    .set({
      status: "Active",
      refreshTokenEnc: params.refreshTokenEnc,
      accessTokenEnc: params.accessTokenEnc,
      accessTokenExpiresAt: params.accessTokenExpiresAt,
      scope: params.scope,
      lastError: null,
      inviteNonce: null,
      inviteExpiresAt: null,
      authorizedAt: new Date(),
    })
    .where(eq(emailSenders.id, params.id));
}

/**
 * Stores refreshed tokens. Takes the refresh token optionally because
 * Microsoft rotates it on every use while Google keeps the original — passing
 * `undefined` must leave the stored one alone rather than clearing it.
 */
export async function updateEmailSenderTokens(
  id: number,
  params: {
    accessTokenEnc: string;
    accessTokenExpiresAt: Date;
    refreshTokenEnc?: string;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(emailSenders)
    .set({
      accessTokenEnc: params.accessTokenEnc,
      accessTokenExpiresAt: params.accessTokenExpiresAt,
      ...(params.refreshTokenEnc ? { refreshTokenEnc: params.refreshTokenEnc } : {}),
    })
    .where(eq(emailSenders.id, id));
}

export async function updateEmailSenderAccessToken(
  id: number,
  accessTokenEnc: string,
  accessTokenExpiresAt: Date
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(emailSenders)
    .set({ accessTokenEnc, accessTokenExpiresAt })
    .where(eq(emailSenders.id, id));
}

/**
 * Marks a grant unusable. The refresh token is dropped rather than kept: it no
 * longer works, and holding a dead credential only invites a future reader to
 * think the sender is one retry away from working.
 */
export async function markEmailSenderRevoked(
  id: number,
  reason: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(emailSenders)
    .set({
      status: "Revoked",
      lastError: reason,
      refreshTokenEnc: null,
      accessTokenEnc: null,
      accessTokenExpiresAt: null,
    })
    .where(eq(emailSenders.id, id));
}

export async function recordEmailSenderError(
  id: number,
  reason: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(emailSenders)
    .set({ status: "Error", lastError: reason })
    .where(eq(emailSenders.id, id));
}

/**
 * Records why an authorisation attempt was refused while leaving the invite
 * intact, so the same link can be opened again. Used when a grant comes back
 * without the send scope: the person only has to tick the box they missed, and
 * issuing a fresh link for that would be busywork.
 */
export async function noteEmailSenderInviteProblem(
  id: number,
  reason: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(emailSenders)
    .set({ status: "Invited", lastError: reason })
    .where(eq(emailSenders.id, id));
}

export async function touchEmailSenderUsed(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(emailSenders)
    .set({ lastUsedAt: new Date() })
    .where(eq(emailSenders.id, id));
}

export async function deleteEmailSender(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(emailSenders).where(eq(emailSenders.id, id));
}
