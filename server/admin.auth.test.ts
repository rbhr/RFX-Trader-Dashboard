import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type CookieCall = {
  name: string;
  value: string;
  options: Record<string, unknown>;
};

function createMockContext(): { ctx: TrpcContext; cookies: CookieCall[] } {
  const cookies: CookieCall[] = [];

  const ctx: TrpcContext = {
    user: undefined,
    req: {
      protocol: "https",
      headers: {},
      ip: "127.0.0.1",
      cookies: {},
    } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        cookies.push({ name, value, options });
      },
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx, cookies };
}

describe("admin authentication", () => {
  it("should allow admin login and return isAdmin flag", async () => {
    const { ctx, cookies } = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.trading.login({
      magicNumber: "admin",
      password: "admin",
      rememberMe: false,
    });

    expect(result.success).toBe(true);
    expect(result.magicNumber).toBe("admin");
    expect(result.name).toBe("Administrator");
    expect(result.isAdmin).toBe(true);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]?.name).toBe("rfx_trading_session");
  });

  it("should reject invalid admin password", async () => {
    const { ctx } = createMockContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.trading.login({
        magicNumber: "admin",
        password: "wrongpassword",
        rememberMe: false,
      })
    ).rejects.toThrow("Invalid password");
  });

  // Note: Testing regular user login requires seeded data which may not be available in test environment
  // The admin user is guaranteed to exist from seed-admin.mjs
});
