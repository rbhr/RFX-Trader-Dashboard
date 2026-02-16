import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, magicNumbers, tradingSessions, InsertMagicNumber, InsertTradingSession, copierTemplates, InsertCopierTemplate } from "../drizzle/schema";
import { ENV } from './_core/env';

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
      values.role = 'admin';
      updateSet.role = 'admin';
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

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

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

  await db.delete(tradingSessions).where(eq(tradingSessions.sessionToken, sessionToken));
}

export async function cleanupExpiredSessions() {
  const db = await getDb();
  if (!db) return;

  const now = new Date();
  await db.delete(tradingSessions).where(eq(tradingSessions.expiresAt, now));
}

// Trader management functions
export async function getAllMagicNumbers() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(magicNumbers)
    .orderBy(magicNumbers.name);
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

export async function updateMagicNumber(id: number, data: Partial<InsertMagicNumber>) {
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

  return db
    .select()
    .from(copierTemplates)
    .orderBy(copierTemplates.name);
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

export async function updateCopierTemplate(id: number, data: Partial<InsertCopierTemplate>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(copierTemplates).set(data).where(eq(copierTemplates.id, id));
}

export async function deleteCopierTemplate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(copierTemplates).where(eq(copierTemplates.id, id));
}
