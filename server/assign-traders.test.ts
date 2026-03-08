import { describe, it, expect, afterAll } from "vitest";
import { getDb } from "./db";
import { magicNumbers } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { updateMagicNumber, getMagicNumberById, createMagicNumber } from "./db";

const TEST_MAGIC_A = "ASGN_TST_A";
const TEST_MAGIC_B = "ASGN_TST_B";
let traderAId: number;
let traderBId: number;

describe("Assign Traders to Master Accounts", () => {
  it("should create test traders", async () => {
    const a = await createMagicNumber({
      magicNumber: TEST_MAGIC_A,
      name: "Assign Test Trader A",
      password: "pw",
      profitShare: "0.50",
    });
    const b = await createMagicNumber({
      magicNumber: TEST_MAGIC_B,
      name: "Assign Test Trader B",
      password: "pw",
      profitShare: "0.50",
    });
    traderAId = (a as any)[0].insertId;
    traderBId = (b as any)[0].insertId;
    expect(traderAId).toBeGreaterThan(0);
    expect(traderBId).toBeGreaterThan(0);
  });

  it("should assign liveAccountNumber to a trader", async () => {
    await updateMagicNumber(traderAId, { liveAccountNumber: "12345678" });
    const trader = await getMagicNumberById(traderAId);
    expect(trader?.liveAccountNumber).toBe("12345678");
  });

  it("should assign a different master to another trader without affecting the first", async () => {
    await updateMagicNumber(traderBId, { liveAccountNumber: "87654321" });
    const traderA = await getMagicNumberById(traderAId);
    const traderB = await getMagicNumberById(traderBId);
    expect(traderA?.liveAccountNumber).toBe("12345678");
    expect(traderB?.liveAccountNumber).toBe("87654321");
  });

  it("should allow reassigning a trader to a new master", async () => {
    await updateMagicNumber(traderAId, { liveAccountNumber: "99999999" });
    const trader = await getMagicNumberById(traderAId);
    expect(trader?.liveAccountNumber).toBe("99999999");
  });

  afterAll(async () => {
    // Clean up test traders
    const db = await getDb();
    if (db) {
      await db.delete(magicNumbers).where(eq(magicNumbers.magicNumber, TEST_MAGIC_A));
      await db.delete(magicNumbers).where(eq(magicNumbers.magicNumber, TEST_MAGIC_B));
    }
  });
});
