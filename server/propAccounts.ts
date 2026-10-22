import { metaCopierService, type AccountFunding } from "./metacopier";

/**
 * RFX's prop-firm accounts, grouped by the firm that funds them.
 *
 * Every figure on the Props screen is derived from two things MetaCopier does
 * know — what the account was funded with and what it is worth now — because
 * MetaCopier has no concept of a funded programme. The firm config below is
 * where each firm's rules live; adding a firm is a config entry plus a label on
 * the accounts in MetaCopier, not new code.
 */

export type PropFirmKey = "tct" | "dxz" | "uzo" | "other";

export interface PropFirmConfig {
  key: PropFirmKey;
  name: string;
  /** MetaCopier label marking an account as this firm's. null = not set up yet. */
  label: string | null;
  /**
   * Label marking an account as locked: the programme is finished, the target no
   * longer applies and the profit is waiting to be invoiced.
   */
  lockedLabel: string | null;
  /** Profit target, as a multiple of the opening balance. */
  targetMultiple: number;
  /** Breach level, as a multiple of the opening balance. */
  breachMultiple: number;
  /** RFX's share of a locked account's profit. */
  payoutShare: number;
}

export const PROP_FIRMS: PropFirmConfig[] = [
  {
    key: "tct",
    name: "The Concept Trading",
    label: "TCT",
    lockedLabel: "TCT Locked",
    targetMultiple: 1.1,
    breachMultiple: 0.9,
    payoutShare: 0.9,
  },
  // The remaining firms have no accounts labelled in MetaCopier yet. They keep
  // TCT's multiples as a starting point; confirm each firm's real rules before
  // relying on a figure here.
  {
    key: "dxz",
    name: "Darwinex Zero",
    label: null,
    lockedLabel: null,
    targetMultiple: 1.1,
    breachMultiple: 0.9,
    payoutShare: 0.9,
  },
  {
    key: "uzo",
    name: "Uzo",
    label: null,
    lockedLabel: null,
    targetMultiple: 1.1,
    breachMultiple: 0.9,
    payoutShare: 0.9,
  },
  {
    key: "other",
    name: "Other",
    label: null,
    lockedLabel: null,
    targetMultiple: 1.1,
    breachMultiple: 0.9,
    payoutShare: 0.9,
  },
];

/**
 * Opening balances MetaCopier cannot be asked for, keyed by account id.
 *
 * An account moved into MetaCopier part-way through its programme arrives as a
 * single deposit of whatever it was worth on the day, not of what the programme
 * was sold as. MetaCopier holds no record of the original figure, so for those
 * accounts the nominal size has to be stated here or every figure derived from
 * it — target, breach level, available equity, payout — is wrong.
 *
 * Keyed by account id rather than alias because an alias is editable in
 * MetaCopier and a rename would silently drop the override.
 */
export const OPENING_BALANCE_OVERRIDES: Record<string, number> = {
  // TCT 7533 L0 USD100K RR (login 147533). A $100K programme that was wired
  // into MetaCopier on 2026-06-17 already down to $94,160.80, which is the only
  // deposit on record.
  "7130985f-64df-4ff7-9635-15eb88b57d12": 100_000,
};

/** How an opening balance was arrived at, so the screen can qualify it. */
export type OpeningBalanceSource = "deposit" | "override" | "earliest-balance" | "unknown";

export interface PropAccountRow {
  accountId: string;
  alias: string;
  loginAccountNumber: string | null;
  broker: string | null;
  currency: string;
  connected: boolean;
  locked: boolean;

  openingBalance: number | null;
  openingBalanceSource: OpeningBalanceSource;
  /** When the account was funded, falling back to when MetaCopier first saw it. */
  startDate: string | null;
  startDateIsFunding: boolean;
  currentEquity: number | null;

  /** Opening x targetMultiple. null on a locked account — the target is spent. */
  target: number | null;
  /** Opening x breachMultiple. */
  breachLevel: number | null;
  /** Equity less the breach level: what is left to lose. */
  availableEquity: number | null;

  /** Locked accounts only: profit above the opening balance. */
  eligibleForPayout: number | null;
  /** Locked accounts only: eligible x payoutShare. */
  netPayout: number | null;

  /** Set when a figure could not be derived, for display next to the row. */
  warning: string | null;
}

/**
 * The opening balance of a funded account.
 *
 * The first deposit is used rather than the net of all transactions, because a
 * locked account gets its profit withdrawn once invoiced — netting would then
 * quietly walk the opening balance (and with it the target and breach level)
 * down by the amount already paid out.
 */
export function deriveOpeningBalance(
  funding: AccountFunding,
  override?: number
): {
  openingBalance: number | null;
  source: OpeningBalanceSource;
  fundedOn: string | null;
} {
  const firstDeposit = funding.transactions.find(t => t.amount > 0);
  // An override replaces only the amount. The funding date is still the real
  // one, and is what the account actually started trading from.
  if (override != null) {
    return {
      openingBalance: override,
      source: "override",
      fundedOn: firstDeposit?.date ?? null,
    };
  }
  if (firstDeposit) {
    return {
      openingBalance: firstDeposit.amount,
      source: "deposit",
      fundedOn: firstDeposit.date,
    };
  }
  // No deposit in the window — the account was funded before MetaCopier started
  // taking snapshots. Its first recorded end-of-day balance is the closest
  // thing to an opening balance, and is right unless it traded that same day.
  if (funding.earliestBalance && funding.earliestBalance.balance > 0) {
    return {
      openingBalance: funding.earliestBalance.balance,
      source: "earliest-balance",
      fundedOn: null,
    };
  }
  return { openingBalance: null, source: "unknown", fundedOn: null };
}

/**
 * Money, to the cent. Without this, opening x 1.1 on a $100,000 account is
 * 110000.00000000001, and every derived figure carries that noise into the
 * payload and into any invoice built from it.
 */
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** The account shape this module needs out of MetaCopier's /accounts response. */
export interface PropAccountInput {
  id: string;
  alias?: string | null;
  loginAccountNumber?: string | null;
  created?: string | null;
  labels?: string[] | null;
  accountInformation?: {
    equity?: number | null;
    currency?: string | null;
    connected?: boolean | null;
  } | null;
}

/**
 * All the derived figures for one prop account. Pure: everything it needs is in
 * its arguments, so the arithmetic is pinned by tests rather than by the API.
 */
export function derivePropAccount(
  account: PropAccountInput,
  funding: AccountFunding,
  firm: PropFirmConfig
): PropAccountRow {
  const info = account.accountInformation ?? {};
  const labels = account.labels ?? [];
  const locked = firm.lockedLabel != null && labels.includes(firm.lockedLabel);

  const { openingBalance, source, fundedOn } = deriveOpeningBalance(
    funding,
    OPENING_BALANCE_OVERRIDES[account.id]
  );
  const currentEquity = typeof info.equity === "number" ? info.equity : null;

  const breachLevel =
    openingBalance == null ? null : round2(openingBalance * firm.breachMultiple);
  // A locked account's target has already been met, so showing one invites the
  // reader to measure against a number that no longer governs anything.
  const target =
    locked || openingBalance == null ? null : round2(openingBalance * firm.targetMultiple);
  const availableEquity =
    currentEquity == null || breachLevel == null ? null : round2(currentEquity - breachLevel);

  const eligibleForPayout =
    locked && currentEquity != null && openingBalance != null
      ? round2(currentEquity - openingBalance)
      : null;
  const netPayout =
    eligibleForPayout == null ? null : round2(eligibleForPayout * firm.payoutShare);

  const warnings: string[] = [];
  if (openingBalance == null) {
    warnings.push("No deposit or balance history — opening balance unknown");
  } else if (source === "earliest-balance") {
    warnings.push("Opening balance inferred from the earliest recorded balance, not a deposit");
  }
  if (currentEquity == null) warnings.push("MetaCopier reported no equity");
  else if (info.connected === false) warnings.push("Account is disconnected — equity may be stale");

  return {
    accountId: account.id,
    alias: account.alias ?? account.loginAccountNumber ?? account.id,
    loginAccountNumber: account.loginAccountNumber ?? null,
    broker: funding.broker,
    currency: funding.currency ?? info.currency ?? "USD",
    connected: info.connected !== false,
    locked,
    openingBalance,
    openingBalanceSource: source,
    startDate: fundedOn ?? account.created ?? null,
    startDateIsFunding: fundedOn != null,
    currentEquity,
    target,
    breachLevel,
    availableEquity,
    eligibleForPayout,
    netPayout,
    warning: warnings.length ? warnings.join("; ") : null,
  };
}

export interface PropFirmSection {
  key: PropFirmKey;
  name: string;
  label: string | null;
  targetMultiple: number;
  breachMultiple: number;
  payoutShare: number;
  accounts: PropAccountRow[];
  /** Why a section is empty, when it is empty for a reason worth stating. */
  note: string | null;
}

/**
 * Every prop firm with its accounts. One /accounts call (30s cached) plus one
 * performanceMetrics call per labelled account (10min cached) — so an idle
 * screen costs nothing and a cold load costs one call per account.
 */
export async function getPropFirmSections(): Promise<PropFirmSection[]> {
  const configured = PROP_FIRMS.filter(f => f.label != null);
  const accounts = configured.length ? await metaCopierService.getAllAccounts() : [];

  const sections: PropFirmSection[] = [];
  for (const firm of PROP_FIRMS) {
    if (firm.label == null) {
      sections.push({
        ...firmSummary(firm),
        accounts: [],
        note: `No MetaCopier label is mapped to ${firm.name} yet.`,
      });
      continue;
    }

    const matching = (accounts as PropAccountInput[]).filter(a =>
      (a.labels ?? []).includes(firm.label as string)
    );

    const rows = await Promise.all(
      matching.map(async account => {
        try {
          const funding = await metaCopierService.getAccountFunding(
            account.id,
            account.created ?? undefined
          );
          return derivePropAccount(account, funding, firm);
        } catch (error: any) {
          // One unreadable account must not blank the whole firm — show the row
          // with what /accounts already gave us and say what is missing.
          console.error(
            `[Props] Could not read funding for ${account.alias ?? account.id}:`,
            error?.message ?? error
          );
          const row = derivePropAccount(
            account,
            { transactions: [], earliestBalance: null, totalNetProfit: null, broker: null, currency: null },
            firm
          );
          return {
            ...row,
            warning: `Could not read funding history from MetaCopier: ${
              error?.message ?? "unknown error"
            }`,
          };
        }
      })
    );

    rows.sort((a, b) => a.alias.localeCompare(b.alias));
    sections.push({
      ...firmSummary(firm),
      accounts: rows,
      note: rows.length
        ? null
        : `No MetaCopier accounts carry the "${firm.label}" label.`,
    });
  }

  return sections;
}

function firmSummary(firm: PropFirmConfig) {
  return {
    key: firm.key,
    name: firm.name,
    label: firm.label,
    targetMultiple: firm.targetMultiple,
    breachMultiple: firm.breachMultiple,
    payoutShare: firm.payoutShare,
  };
}
