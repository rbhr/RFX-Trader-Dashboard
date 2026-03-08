import { describe, it, expect, afterAll } from "vitest";
import { getDb } from "./db";
import { magicNumbers } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { updateMagicNumber, getMagicNumberById, createMagicNumber } from "./db";

const TEST_MAGIC = "UNASGN_TST";
let traderId: number;

describe("Unassign Trader from Master Account", () => {
  it("should create a test trader assigned to a master", async () => {
    const result = await createMagicNumber({
      magicNumber: TEST_MAGIC,
      name: "Unassign Test Trader",
      password: "pw",
      profitShare: "0.50",
    });
    traderId = (result as any)[0].insertId;
    expect(traderId).toBeGreaterThan(0);

    // Assign to a master
    await updateMagicNumber(traderId, { liveAccountNumber: "12345678" });
    const trader = await getMagicNumberById(traderId);
    expect(trader?.liveAccountNumber).toBe("12345678");
  });

  it("should clear liveAccountNumber when unassigned", async () => {
    await updateMagicNumber(traderId, { liveAccountNumber: null });
    const trader = await getMagicNumberById(traderId);
    expect(trader?.liveAccountNumber).toBeNull();
  });

  it("should allow re-assigning after unassign", async () => {
    await updateMagicNumber(traderId, { liveAccountNumber: "99999999" });
    const trader = await getMagicNumberById(traderId);
    expect(trader?.liveAccountNumber).toBe("99999999");
  });

  afterAll(async () => {
    const db = await getDb();
    if (db) {
      await db.delete(magicNumbers).where(eq(magicNumbers.magicNumber, TEST_MAGIC));
    }
  });
});
