import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("Trading Authentication", () => {
  let testMagicNumber: string;

  beforeAll(async () => {
    // Get a valid magic number from the database
    const caller = appRouter.createCaller({
      req: { protocol: "https", headers: {}, cookies: {} } as any,
      res: { cookie: () => {}, clearCookie: () => {} } as any,
      user: null,
    });
    
    const magicNumbers = await caller.trading.getMagicNumbers();
    expect(magicNumbers.length).toBeGreaterThan(0);
    testMagicNumber = magicNumbers[0]!.magicNumber;
  });

  it("should fetch list of available magic numbers", async () => {
    const caller = appRouter.createCaller({
      req: { protocol: "https", headers: {}, cookies: {} } as any,
      res: { cookie: () => {}, clearCookie: () => {} } as any,
      user: null,
    });

    const magicNumbers = await caller.trading.getMagicNumbers();
    
    expect(Array.isArray(magicNumbers)).toBe(true);
    expect(magicNumbers.length).toBeGreaterThan(0);
    expect(magicNumbers[0]).toHaveProperty("magicNumber");
    expect(magicNumbers[0]).toHaveProperty("name");
  });

  it("should reject login with invalid magic number", async () => {
    const caller = appRouter.createCaller({
      req: { protocol: "https", headers: {}, cookies: {} } as any,
      res: { cookie: () => {}, clearCookie: () => {} } as any,
      user: null,
    });

    await expect(
      caller.trading.login({
        magicNumber: "99999",
        password: "test",
        rememberMe: false,
      })
    ).rejects.toThrow("Invalid magic number");
  });

  it("should reject login with invalid password", async () => {
    const caller = appRouter.createCaller({
      req: { protocol: "https", headers: {}, cookies: {} } as any,
      res: { cookie: () => {}, clearCookie: () => {} } as any,
      user: null,
    });

    await expect(
      caller.trading.login({
        magicNumber: testMagicNumber,
        password: "wrongpassword",
        rememberMe: false,
      })
    ).rejects.toThrow("Invalid password");
  });

  it("should successfully login with valid credentials", async () => {
    let cookieSet = false;
    
    const caller = appRouter.createCaller({
      req: { protocol: "https", headers: {}, cookies: {} } as any,
      res: { 
        cookie: () => { cookieSet = true; }, 
        clearCookie: () => {} 
      } as any,
      user: null,
    });

    const result = await caller.trading.login({
      magicNumber: testMagicNumber,
      password: "VV8UUFa3p_B-ZcY", // Default password from seed
      rememberMe: false,
    });

    expect(result.success).toBe(true);
    expect(result.magicNumber).toBe(testMagicNumber);
    expect(result.name).toBeTruthy();
    expect(cookieSet).toBe(true);
  });
});
