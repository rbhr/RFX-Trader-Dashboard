import { describe, expect, it } from "vitest";
import { metaCopierService } from "./metacopier";

// Live-API smoke tests: they need network and a real METACOPIER_API_KEY, and
// fail by design in the offline runner.
//
// They used to read a project-wide "default account" (METACOPIER_ACCOUNT_ID).
// That account had been deleted, so every call returned
// 400 [ACCOUNT_WAS_DELETED] and these tests could only ever fail. The concept
// is gone — every read names its account — so they now resolve a real account
// from the API first.
describe("MetaCopier API Integration", () => {
  it("lists accounts and reads one account's information by id", async () => {
    const accounts = await metaCopierService.getAllAccounts();
    expect(Array.isArray(accounts)).toBe(true);
    expect(accounts.length).toBeGreaterThan(0);

    // A deleted account still answers GET /accounts/{id} but 400s on every
    // sub-resource, and is absent from this list — so anything listed here is
    // safe to query.
    const account = accounts[0];
    expect(account.id).toBeTypeOf("string");

    const info = await metaCopierService.getAccountInfoById(account.id);
    expect(info).toBeDefined();
    expect(info.balance).toBeTypeOf("number");
    expect(info.equity).toBeTypeOf("number");
    expect(info.currency).toBeTypeOf("string");
  }, 20000);

  it("fetches open positions for a named account", async () => {
    const accounts = await metaCopierService.getAllAccounts();
    const positions = await metaCopierService.getOpenPositionsFromAccount(
      accounts[0].id
    );
    expect(Array.isArray(positions)).toBe(true);
  }, 20000);

  it("exposes no project-wide account to fall back to", () => {
    // Guards the removal: a single shared account attributed its trades to
    // whichever trader had none of their own, which is why these are gone.
    const service = metaCopierService as unknown as Record<string, unknown>;
    expect(service.getOpenPositions).toBeUndefined();
    expect(service.getHistoricalPositions).toBeUndefined();
    expect(service.getAccountInfo).toBeUndefined();
    expect(service.defaultAccountId).toBeUndefined();
  });
});
