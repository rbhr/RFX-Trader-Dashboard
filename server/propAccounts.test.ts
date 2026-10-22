import { describe, expect, it } from "vitest";
import {
  deriveOpeningBalance,
  derivePropAccount,
  PROP_FIRMS,
  type PropAccountInput,
} from "./propAccounts";
import type { AccountFunding } from "./metacopier";

const TCT = PROP_FIRMS.find(f => f.key === "tct")!;

const funding = (over: Partial<AccountFunding> = {}): AccountFunding => ({
  transactions: [{ date: "2026-07-30", amount: 150_000 }],
  earliestBalance: { date: "2026-07-31", balance: 150_000 },
  totalNetProfit: 2_736.3,
  broker: "theconcept-trade",
  currency: "USD",
  ...over,
});

const account = (over: Partial<PropAccountInput> = {}): PropAccountInput => ({
  id: "ba50fbd9",
  alias: "TCT 9008 USD150K",
  loginAccountNumber: "149008",
  created: "2026-07-31T10:09:35.465Z",
  labels: ["TCT"],
  accountInformation: { equity: 152_743.56, currency: "USD", connected: true },
  ...over,
});

describe("deriveOpeningBalance", () => {
  it("uses the first deposit", () => {
    expect(deriveOpeningBalance(funding())).toEqual({
      openingBalance: 150_000,
      source: "deposit",
      fundedOn: "2026-07-30",
    });
  });

  it("ignores a later withdrawal, so an invoiced payout does not shrink the opening balance", () => {
    const after = funding({
      transactions: [
        { date: "2026-07-30", amount: 150_000 },
        { date: "2026-10-25", amount: -2_469.2 },
      ],
    });
    expect(deriveOpeningBalance(after).openingBalance).toBe(150_000);
  });

  it("falls back to the earliest recorded balance when no deposit is in the window", () => {
    const old = funding({ transactions: [] });
    expect(deriveOpeningBalance(old)).toEqual({
      openingBalance: 150_000,
      source: "earliest-balance",
      fundedOn: null,
    });
  });

  it("reports unknown rather than guessing when there is no history at all", () => {
    const blank = funding({ transactions: [], earliestBalance: null });
    expect(deriveOpeningBalance(blank)).toEqual({
      openingBalance: null,
      source: "unknown",
      fundedOn: null,
    });
  });

  it("does not mistake a withdrawal for the opening deposit", () => {
    const odd = funding({
      transactions: [
        { date: "2026-07-29", amount: -500 },
        { date: "2026-07-30", amount: 150_000 },
      ],
    });
    expect(deriveOpeningBalance(odd).openingBalance).toBe(150_000);
  });
});

describe("derivePropAccount — unlocked", () => {
  const row = derivePropAccount(account(), funding(), TCT);

  it("derives the target and breach level from the opening balance", () => {
    expect(row.openingBalance).toBe(150_000);
    expect(row.target).toBe(165_000);
    expect(row.breachLevel).toBe(135_000);
  });

  it("reports available equity as equity less the breach level", () => {
    expect(row.availableEquity).toBeCloseTo(17_743.56, 2);
  });

  it("leaves the payout figures off an unlocked account", () => {
    expect(row.locked).toBe(false);
    expect(row.eligibleForPayout).toBeNull();
    expect(row.netPayout).toBeNull();
  });

  it("prefers the funding date over MetaCopier's created date", () => {
    // The account was wired the day before MetaCopier first saw it.
    expect(row.startDate).toBe("2026-07-30");
    expect(row.startDateIsFunding).toBe(true);
  });

  it("falls back to the created date when nothing was deposited in the window", () => {
    const old = derivePropAccount(account(), funding({ transactions: [] }), TCT);
    expect(old.startDate).toBe("2026-07-31T10:09:35.465Z");
    expect(old.startDateIsFunding).toBe(false);
    expect(old.warning).toMatch(/inferred from the earliest recorded balance/);
  });
});

describe("derivePropAccount — locked", () => {
  const row = derivePropAccount(
    account({ labels: ["TCT", "TCT Locked"] }),
    funding(),
    TCT
  );

  it("drops the target, because the programme is already finished", () => {
    expect(row.locked).toBe(true);
    expect(row.target).toBeNull();
  });

  it("keeps the breach level and available equity", () => {
    expect(row.breachLevel).toBe(135_000);
    expect(row.availableEquity).toBeCloseTo(17_743.56, 2);
  });

  it("makes eligible profit the gain over the opening balance, and nets RFX's share", () => {
    expect(row.eligibleForPayout).toBeCloseTo(2_743.56, 2);
    expect(row.netPayout).toBeCloseTo(2_469.204, 3);
  });

  it("reports a loss-making locked account as negative rather than clamping to zero", () => {
    const down = derivePropAccount(
      account({
        labels: ["TCT", "TCT Locked"],
        accountInformation: { equity: 148_000, currency: "USD", connected: true },
      }),
      funding(),
      TCT
    );
    expect(down.eligibleForPayout).toBe(-2_000);
    expect(down.netPayout).toBe(-1_800);
  });
});

describe("derivePropAccount — missing data", () => {
  it("returns nulls, not NaN, when the opening balance is unknown", () => {
    const row = derivePropAccount(
      account(),
      funding({ transactions: [], earliestBalance: null }),
      TCT
    );
    expect(row.target).toBeNull();
    expect(row.breachLevel).toBeNull();
    expect(row.availableEquity).toBeNull();
    expect(row.warning).toMatch(/opening balance unknown/i);
  });

  it("returns nulls, not NaN, when MetaCopier reports no equity", () => {
    const row = derivePropAccount(
      account({ accountInformation: { equity: null, currency: "USD", connected: true } }),
      funding(),
      TCT
    );
    expect(row.currentEquity).toBeNull();
    expect(row.availableEquity).toBeNull();
    // The target does not depend on equity, so it still stands.
    expect(row.target).toBe(165_000);
    expect(row.warning).toMatch(/no equity/i);
  });

  it("warns that equity is stale when the account is disconnected", () => {
    const row = derivePropAccount(
      account({ accountInformation: { equity: 152_743.56, currency: "USD", connected: false } }),
      funding(),
      TCT
    );
    expect(row.connected).toBe(false);
    expect(row.warning).toMatch(/disconnected/i);
  });

  it("does not treat another firm's locked label as a lock", () => {
    const row = derivePropAccount(account({ labels: ["TCT", "DXZ Locked"] }), funding(), TCT);
    expect(row.locked).toBe(false);
    expect(row.target).toBe(165_000);
  });
});

describe("PROP_FIRMS", () => {
  it("has the four sections the screen expects, in order", () => {
    expect(PROP_FIRMS.map(f => f.name)).toEqual([
      "The Concept Trading",
      "Darwinex Zero",
      "Uzo",
      "Other",
    ]);
  });

  it("only maps a label for the firm that is actually set up", () => {
    expect(PROP_FIRMS.filter(f => f.label != null).map(f => f.label)).toEqual(["TCT"]);
  });
});
