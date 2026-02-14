import { describe, expect, it } from "vitest";
import { metaCopierService } from "./metacopier";

describe("Copier Management", () => {
  it("should fetch copiers for a source account", async () => {
    // Ahmed's account ID
    const sourceAccountId = "fd86668b-e0b3-432c-8291-18578648ec4e";
    
    const copiers = await metaCopierService.getCopiersBySourceAccount(sourceAccountId);
    
    expect(Array.isArray(copiers)).toBe(true);
    // Each copier should have required fields
    if (copiers.length > 0) {
      const copier = copiers[0];
      expect(copier).toHaveProperty("id");
      expect(copier).toHaveProperty("toAccountId");
      expect(copier).toHaveProperty("toAccountAlias");
      expect(copier).toHaveProperty("toAccountNumber");
      expect(copier).toHaveProperty("status");
    }
  });

  it("should return empty array for account with no copiers", async () => {
    // Use a non-existent account ID
    const nonExistentAccountId = "00000000-0000-0000-0000-000000000000";
    
    const copiers = await metaCopierService.getCopiersBySourceAccount(nonExistentAccountId);
    
    expect(Array.isArray(copiers)).toBe(true);
    expect(copiers.length).toBe(0);
  });
});
