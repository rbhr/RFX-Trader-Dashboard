import { describe, expect, it, beforeAll } from "vitest";
import { getAllMagicNumbers, getMagicNumberById, updateMagicNumber, createMagicNumber } from "./db";

// Test admin trader management database operations

describe("Trader Management - List Traders", () => {
  it("returns list of all traders", async () => {
    const traders = await getAllMagicNumbers();

    expect(Array.isArray(traders)).toBe(true);
    expect(traders.length).toBeGreaterThan(0);
    
    // Check structure of first trader
    const firstTrader = traders[0];
    expect(firstTrader).toHaveProperty("id");
    expect(firstTrader).toHaveProperty("magicNumber");
    expect(firstTrader).toHaveProperty("name");
    expect(firstTrader).toHaveProperty("profitShare");
    expect(firstTrader).toHaveProperty("isActive");
    expect(firstTrader).toHaveProperty("mtAccount");
  });
});

describe("Trader Management - Update Trader", () => {
  it("updates trader profit share successfully", async () => {
    // Get a non-admin trader to update
    const traders = await getAllMagicNumbers();
    const nonAdminTrader = traders.find(t => !t.isAdmin);
    
    if (!nonAdminTrader) {
      throw new Error("No non-admin trader found for testing");
    }

    const originalProfitShare = nonAdminTrader.profitShare;
    const newProfitShare = 0.40;
    
    await updateMagicNumber(nonAdminTrader.id, {
      profitShare: newProfitShare.toString(),
    });

    // Verify the update
    const updated = await getMagicNumberById(nonAdminTrader.id);
    expect(updated).toBeDefined();
    expect(parseFloat(updated!.profitShare)).toBe(newProfitShare);

    // Restore original
    await updateMagicNumber(nonAdminTrader.id, {
      profitShare: originalProfitShare,
    });
  });

  it("updates trader active status successfully", async () => {
    const traders = await getAllMagicNumbers();
    const nonAdminTrader = traders.find(t => !t.isAdmin);
    
    if (!nonAdminTrader) {
      throw new Error("No non-admin trader found for testing");
    }

    const originalStatus = nonAdminTrader.isActive;
    const newStatus = !originalStatus;
    
    await updateMagicNumber(nonAdminTrader.id, {
      isActive: newStatus,
    });

    // Verify the update
    const updated = await getMagicNumberById(nonAdminTrader.id);
    expect(updated).toBeDefined();
    expect(updated!.isActive).toBe(newStatus);

    // Restore original status
    await updateMagicNumber(nonAdminTrader.id, {
      isActive: originalStatus,
    });
  });
});

describe("Trader Management - Create Trader", () => {
  it("creates a new trader successfully", async () => {
    const testMagicNumber = `test-${Date.now()}`;
    
    await createMagicNumber({
      magicNumber: testMagicNumber,
      name: "Test Trader",
      password: "testpass123",
      profitShare: "0.30",
      mtAccount: "12345678",
      mtServer: "TestBroker-Live",
      mtPassword: "mtpass",
      mtLocation: "MT4",
    });

    // Verify the trader was created
    const traders = await getAllMagicNumbers();
    const created = traders.find(t => t.magicNumber === testMagicNumber);
    
    expect(created).toBeDefined();
    expect(created!.name).toBe("Test Trader");
    expect(parseFloat(created!.profitShare)).toBe(0.30);
    expect(created!.mtAccount).toBe("12345678");
    expect(created!.mtServer).toBe("TestBroker-Live");
    expect(created!.mtLocation).toBe("MT4");
  });
});
