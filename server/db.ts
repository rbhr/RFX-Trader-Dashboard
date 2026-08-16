import { eq, desc, isNull, isNotNull, sql, or, and, gt, lt } from "drizzle-orm";
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
} from "../drizzle/schema";
import { ENV } from "./_core/env";

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

  const result = await db
    .select()
    .from(riskLimitBreaches)
    .where(eq(riskLimitBreaches.magicNumberId, magicNumberId))
    .orderBy(desc(riskLimitBreaches.createdAt))
    .limit(1);

  // Return only if unresolved (no resolvedAt)
  const breach = result[0];
  if (breach && !breach.resolvedAt) return breach;
  return undefined;
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

  const resolved = await db
    .select({ id: riskLimitBreaches.id })
    .from(riskLimitBreaches)
    .where(isNotNull(riskLimitBreaches.resolvedAt));

  if (resolved.length === 0) return 0;

  await db
    .delete(riskLimitBreaches)
    .where(isNotNull(riskLimitBreaches.resolvedAt));

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
  purpose: "login_2fa" | "password_reset" | "password_change"
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
  purpose: "login_2fa" | "password_reset" | "password_change"
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
  purpose: "login_2fa" | "password_reset" | "password_change"
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

  await db
    .update(twoFactorCodes)
    .set({ used: true })
    .where(eq(twoFactorCodes.id, result[0].id));

  return true;
}

export async function cleanupExpiredTwoFactorCodes() {
  const db = await getDb();
  if (!db) return;

  await db
    .delete(twoFactorCodes)
    .where(lt(twoFactorCodes.expiresAt, new Date()));
}

export async function hasSeenDevice(
  magicNumberId: number,
  ipAddress: string | null
): Promise<boolean> {
  if (!ipAddress) return false;
  const db = await getDb();
  if (!db) return false;

  const result = await db
    .select({ id: tradingSessions.id })
    .from(tradingSessions)
    .where(
      and(
        eq(tradingSessions.magicNumberId, magicNumberId),
        eq(tradingSessions.ipAddress, ipAddress),
        gt(tradingSessions.expiresAt, new Date())
      )
    )
    .limit(1);

  return result.length > 0;
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
