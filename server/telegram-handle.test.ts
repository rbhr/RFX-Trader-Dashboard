import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createMagicNumber, getMagicNumberById, updateMagicNumber, deleteMagicNumber } from "./db";

describe("Telegram Handle Field", () => {
  let testTraderId: number;
  const uniqueMagicNumber = `tg${Date.now().toString().slice(-8)}`;

  beforeAll(async () => {
    // Create a test trader with telegram handle
    const result = await createMagicNumber({
      magicNumber: uniqueMagicNumber,
      name: "Telegram Test Trader",
      password: "test123",
      profitShare: "0.35",
      telegramHandle: "@testtrader",
    });
    // createMagicNumber returns the insert result, need to get the insertId
    testTraderId = Number(result[0]?.insertId);
  });

  afterAll(async () => {
    // Clean up test trader
    if (testTraderId) {
      await deleteMagicNumber(testTraderId);
    }
  });

  it("should create trader with telegram handle", async () => {
    const trader = await getMagicNumberById(testTraderId);
    expect(trader).toBeDefined();
    expect(trader?.telegramHandle).toBe("@testtrader");
  });

  it("should update telegram handle", async () => {
    await updateMagicNumber(testTraderId, {
      telegramHandle: "@updatedhandle",
    });

    const trader = await getMagicNumberById(testTraderId);
    expect(trader?.telegramHandle).toBe("@updatedhandle");
  });

  it("should allow null telegram handle", async () => {
    await updateMagicNumber(testTraderId, {
      telegramHandle: null,
    });

    const trader = await getMagicNumberById(testTraderId);
    expect(trader?.telegramHandle).toBeNull();
  });

  it("should create trader without telegram handle", async () => {
    const trader = await createMagicNumber({
      magicNumber: `tg${Date.now().toString().slice(-7)}`,
      name: "No Telegram Trader",
      password: "test456",
      profitShare: "0.35",
    });

    expect(trader.telegramHandle).toBeUndefined();

    // Clean up
    await deleteMagicNumber(trader.id);
  });
});
