import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { getDb } from "./db";
import { riskLimitBreaches, magicNumbers } from "../drizzle/schema";
import { eq, isNull } from "drizzle-orm";
import {
  countActiveRiskLimitBreaches,
  bulkResolveRiskLimitBreaches,
} from "./db";

// Use a unique magic number to avoid collisions with real data
const TEST_MAGIC = "BULK_TST_99";
let traderId: number;

describe("Bulk Resolve Risk Limit Breaches", () => {
  beforeAll(async () => {
    const db = await getDb();
    if (!db) return;

    // Insert a minimal test trader
    const result = await db.insert(magicNumbers).values({
      magicNumber: TEST_MAGIC,
      name: "Bulk Resolve Test Trader",
      password: "test123",
      profitShare: "0.35",
      isActive: true,
      isAdmin: false,
    });
    traderId = (result as any)[0]?.insertId ?? 0;
  });

  it("should insert two active breaches and count them", async () => {
    const db = await getDb();
    if (!db || !traderId) {
      console.warn("No DB or trader — skipping");
      return;
    }

    await db.insert(riskLimitBreaches).values([
      {
        magicNumberId: traderId,
        equityAtBreach: "250.00",
        riskLimitAtBreach: "300.00",
        traderNotified: false,
        adminNotified: false,
      },
      {
        magicNumberId: traderId,
        equityAtBreach: "200.00",
        riskLimitAtBreach: "300.00",
        traderNotified: false,
        adminNotified: false,
      },
    ]);

    const count = await countActiveRiskLimitBreaches();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("should bulk resolve all active breaches and return the resolved count", async () => {
    const db = await getDb();
    if (!db || !traderId) return;

    const countBefore = await countActiveRiskLimitBreaches();
    expect(countBefore).toBeGreaterThanOrEqual(2);

    const resolved = await bulkResolveRiskLimitBreaches();
    expect(resolved).toBeGreaterThanOrEqual(2);

    const countAfter = await countActiveRiskLimitBreaches();
    expect(countAfter).toBe(0);
  });

  it("should return 0 when there are no active breaches left", async () => {
    const db = await getDb();
    if (!db) return;

    const resolved = await bulkResolveRiskLimitBreaches();
    expect(resolved).toBe(0);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db || !traderId) return;

    // Clean up test data
    await db.delete(riskLimitBreaches).where(eq(riskLimitBreaches.magicNumberId, traderId));
    await db.delete(magicNumbers).where(eq(magicNumbers.id, traderId));
  });
});
