import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRiskLimitBreach, getActiveBreachByMagicNumberId, resolveRiskLimitBreach, getAllRiskLimitBreaches } from "./db";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { magicNumbers, riskLimitBreaches } from "../drizzle/schema";
import { eq } from "drizzle-orm";

let db: ReturnType<typeof drizzle>;
let conn: mysql.Connection;
let testMagicNumberId: number;

beforeAll(async () => {
  conn = await mysql.createConnection(process.env.DATABASE_URL!);
  db = drizzle(conn);

  // Insert a test magic number
  const ts = Date.now();
  const result = await db.insert(magicNumbers).values({
    magicNumber: `BRE${ts}`.slice(0, 20),
    name: "Breach Test Trader",
    password: "testpass",
    profitShare: "0.5",
    isActive: true,
    isAdmin: false,
  });
  testMagicNumberId = (result as any)[0].insertId;
});

afterAll(async () => {
  // Clean up test data
  if (testMagicNumberId) {
    await db.delete(riskLimitBreaches).where(eq(riskLimitBreaches.magicNumberId, testMagicNumberId));
    await db.delete(magicNumbers).where(eq(magicNumbers.id, testMagicNumberId));
  }
  await conn.end();
});

describe("Risk Limit Breach DB helpers", () => {
  let breachId: number;

  it("should create a risk limit breach record", async () => {
    const result = await createRiskLimitBreach({
      magicNumberId: testMagicNumberId,
      equityAtBreach: "285.50",
      riskLimitAtBreach: "300.00",
      traderNotified: false,
      adminNotified: false,
    });
    expect(result).toBeDefined();
    breachId = (result as any)[0].insertId;
    expect(breachId).toBeGreaterThan(0);
  });

  it("should retrieve an active breach by magicNumberId", async () => {
    const breach = await getActiveBreachByMagicNumberId(testMagicNumberId);
    expect(breach).toBeDefined();
    expect(breach!.magicNumberId).toBe(testMagicNumberId);
    expect(parseFloat(breach!.equityAtBreach)).toBeCloseTo(285.5, 1);
    expect(breach!.resolvedAt).toBeNull();
  });

  it("should appear in getAllRiskLimitBreaches", async () => {
    const all = await getAllRiskLimitBreaches();
    const found = all.find(b => b.id === breachId);
    expect(found).toBeDefined();
    expect(found!.resolvedAt).toBeNull();
  });

  it("should resolve a breach and no longer return it as active", async () => {
    await resolveRiskLimitBreach(breachId);
    const active = await getActiveBreachByMagicNumberId(testMagicNumberId);
    expect(active).toBeUndefined();

    // Verify resolvedAt is now set
    const all = await getAllRiskLimitBreaches();
    const resolved = all.find(b => b.id === breachId);
    expect(resolved).toBeDefined();
    expect(resolved!.resolvedAt).not.toBeNull();
  });
});
