import { describe, expect, it } from "vitest";
import {
  deriveOpeningBalance,
  derivePropAccount,
  OPENING_BALANCE_OVERRIDES,
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
    expect(row.availableEquity).toBe(17_743.56);
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
    expect(row.availableEquity).toBe(17_743.56);
  });

  it("makes eligible profit the gain over the opening balance, and nets RFX's share", () => {
    expect(row.eligibleForPayout).toBe(2_743.56);
    expect(row.netPayout).toBe(2_469.2);
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

describe("opening balance overrides", () => {
  // TCT 7533 L0 USD100K RR: a $100K programme wired into MetaCopier already
  // down to $94,160.80, which is the only deposit MetaCopier has.
  const ID_7533 = "7130985f-64df-4ff7-9635-15eb88b57d12";
  const transferredIn: AccountFunding = {
    transactions: [{ date: "2026-06-17", amount: 94_160.8 }],
    earliestBalance: { date: "2026-06-18", balance: 94_160.8 },
    totalNetProfit: 64.34,
    broker: "theconcept-trade",
    currency: "USD",
  };

  it("maps 7533 to its nominal $100K", () => {
    expect(OPENING_BALANCE_OVERRIDES[ID_7533]).toBe(100_000);
  });

  it("replaces the deposit amount and says the figure was set by hand", () => {
    const result = deriveOpeningBalance(transferredIn, 100_000);
    expect(result.openingBalance).toBe(100_000);
    expect(result.source).toBe("override");
  });

  it("keeps the real funding date, which is still when the account started", () => {
    expect(deriveOpeningBalance(transferredIn, 100_000).fundedOn).toBe("2026-06-17");
  });

  it("drives the target, breach level and available equity off the override", () => {
    const row = derivePropAccount(
      account({
        id: ID_7533,
        alias: "TCT 7533 L0 USD100K RR",
        loginAccountNumber: "147533",
        created: "2026-06-18T14:56:42.316Z",
        accountInformation: { equity: 94_225.14, currency: "USD", connected: true },
      }),
      transferredIn,
      TCT
    );
    expect(row.openingBalance).toBe(100_000);
    expect(row.openingBalanceSource).toBe("override");
    expect(row.target).toBe(110_000);
    expect(row.breachLevel).toBe(90_000);
    // Against the real deposit this read $9,480.42 — nearly $5.7k too generous.
    expect(row.availableEquity).toBe(4_225.14);
    expect(row.startDate).toBe("2026-06-17");
    // A deliberate override is not a data problem, so it raises no warning.
    expect(row.warning).toBeNull();
  });

  // TCT 2138 L0 AUD100K: reissued the same way as 7533, but with no
  // transactions on record at all, so it was falling through to the
  // earliest-balance fallback rather than to a wrong deposit.
  const ID_2138 = "6a9940fd-bb23-4d60-8133-0c771dd92b47";
  const noTransactions: AccountFunding = {
    transactions: [],
    earliestBalance: { date: "2025-11-08", balance: 90_138.24 },
    totalNetProfit: -8.09,
    broker: "theconcept-trade",
    currency: "AUD",
  };

  it("maps 2138 to its nominal AUD 100K", () => {
    expect(OPENING_BALANCE_OVERRIDES[ID_2138]).toBe(100_000);
  });

  it("overrides an account that has no transactions at all, not just a wrong deposit", () => {
    const row = derivePropAccount(
      account({
        id: ID_2138,
        alias: "TCT 2138 L0 AUD100K",
        loginAccountNumber: "2138",
        created: "2025-11-08T09:51:47.208Z",
        accountInformation: { equity: 90_128.73, currency: "AUD", connected: true },
      }),
      noTransactions,
      TCT
    );
    expect(row.openingBalance).toBe(100_000);
    expect(row.openingBalanceSource).toBe("override");
    expect(row.currency).toBe("AUD");
    expect(row.breachLevel).toBe(90_000);
    // Against the inferred AUD 90,138.24 this read 9,004.31 — AUD 8,875 of
    // room that was never there.
    expect(row.availableEquity).toBe(128.73);
    // The override also settles what the fallback could only guess at, so the
    // "inferred from the earliest recorded balance" warning is gone.
    expect(row.warning).toBeNull();
  });

  it("falls back to the created date when an override has no deposit to date from", () => {
    const row = derivePropAccount(
      account({ id: ID_2138, created: "2025-11-08T09:51:47.208Z" }),
      noTransactions,
      TCT
    );
    expect(row.startDate).toBe("2025-11-08T09:51:47.208Z");
    expect(row.startDateIsFunding).toBe(false);
  });

  it("leaves accounts without an override on their recorded deposit", () => {
    const row = derivePropAccount(account(), funding(), TCT);
    expect(row.openingBalanceSource).toBe("deposit");
    expect(row.openingBalance).toBe(150_000);
  });

  it("every override is a positive amount keyed by a uuid", () => {
    for (const [id, amount] of Object.entries(OPENING_BALANCE_OVERRIDES)) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(amount).toBeGreaterThan(0);
    }
  });
});

describe("non-USD accounts", () => {
  it("carries the account's own currency through, so AUD is not shown as USD", () => {
    // TCT 7584 L2 AUD150K HC is funded in Australian dollars.
    const row = derivePropAccount(
      account({
        id: "1d08b338-9bf5-4484-b50c-7cb38d8aa5b1",
        alias: "TCT 7584 L2 AUD150K HC",
        accountInformation: { equity: 151_461.34, currency: "AUD", connected: true },
      }),
      funding({ currency: "AUD" }),
      TCT
    );
    expect(row.currency).toBe("AUD");
    // The multiples are currency-agnostic — one account is in one currency.
    expect(row.target).toBe(165_000);
    expect(row.breachLevel).toBe(135_000);
  });
});
