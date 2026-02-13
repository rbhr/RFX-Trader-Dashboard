import { describe, expect, it } from "vitest";
import { metaCopierService } from "./metacopier";

describe("MetaCopier API Integration", () => {
  it("should successfully fetch account information with provided credentials", async () => {
    const accountInfo = await metaCopierService.getAccountInfo();
    
    expect(accountInfo).toBeDefined();
    expect(accountInfo.balance).toBeTypeOf("number");
    expect(accountInfo.equity).toBeTypeOf("number");
    expect(accountInfo.currency).toBeTypeOf("string");
    // Name field may be optional in API response
    expect(accountInfo).toHaveProperty("balance");
    expect(accountInfo).toHaveProperty("equity");
  }, 10000); // 10 second timeout for API call

  it("should fetch open positions", async () => {
    const positions = await metaCopierService.getOpenPositions();
    
    expect(Array.isArray(positions)).toBe(true);
    // Positions may be empty, but should be an array
  }, 10000);
});
