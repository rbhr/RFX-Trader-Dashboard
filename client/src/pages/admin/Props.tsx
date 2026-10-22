import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Briefcase, FileText, Lock, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "@/lib/toast";
import AdminLayout from "@/components/AdminLayout";
import InvoiceSenders from "@/components/InvoiceSenders";

type PropAccount = {
  accountId: string;
  alias: string;
  loginAccountNumber: string | null;
  broker: string | null;
  currency: string;
  connected: boolean;
  locked: boolean;
  openingBalance: number | null;
  openingBalanceSource: "deposit" | "override" | "earliest-balance" | "unknown";
  startDate: string | null;
  startDateIsFunding: boolean;
  currentEquity: number | null;
  target: number | null;
  breachLevel: number | null;
  availableEquity: number | null;
  eligibleForPayout: number | null;
  netPayout: number | null;
  warning: string | null;
};

type PropFirm = {
  key: string;
  name: string;
  label: string | null;
  targetMultiple: number;
  breachMultiple: number;
  payoutShare: number;
  accounts: PropAccount[];
  note: string | null;
};

// Not every prop account is in dollars — TCT funds some in AUD — so the row's
// own currency decides the symbol. Labelling an AUD balance as USD on a screen
// used to decide invoice amounts is the kind of error nobody catches by eye.
const fmtMoney = (v: number | null, currency = "USD") =>
  v == null
    ? "—"
    : v.toLocaleString("en-US", {
        style: "currency",
        currency,
        currencyDisplay: currency === "USD" ? "symbol" : "code",
        minimumFractionDigits: 2,
      });

const fmtDate = (d: string | null) =>
  d
    ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";

const pct = (multiple: number) => `${Math.round(multiple * 100)}%`;

export default function Props() {
  const { data, isLoading, isFetching, error, refetch } = trpc.admin.getPropAccounts.useQuery(
    undefined,
    { refetchInterval: 60000 }
  );

  const firms = (data?.firms ?? []) as PropFirm[];

  return (
    <AdminLayout>
      <TooltipProvider>
        <div className="p-8 space-y-6">
          <div className="flex items-center gap-3">
            <Briefcase className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Props</h1>
              <p className="text-muted-foreground text-sm">
                RFX's funded prop accounts, grouped by funder. Every figure is derived live from
                MetaCopier.
              </p>
            </div>
            <div className="ml-auto">
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>

          {error && (
            <Card className="border-destructive">
              <CardContent className="pt-6 text-sm text-destructive">
                Could not load prop accounts: {error.message}
              </CardContent>
            </Card>
          )}

          {isLoading && !data ? (
            <p className="text-muted-foreground text-sm">Loading prop accounts…</p>
          ) : (
            firms.map(firm => <FirmSection key={firm.key} firm={firm} />)
          )}

          <InvoiceSenders />
        </div>
      </TooltipProvider>
    </AdminLayout>
  );
}

function FirmSection({ firm }: { firm: PropFirm }) {
  const anyLocked = firm.accounts.some(a => a.locked);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {firm.name}
          {firm.label && (
            <Badge variant="outline" className="font-mono text-xs">
              {firm.label}
            </Badge>
          )}
          {firm.accounts.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              {firm.accounts.length} account{firm.accounts.length === 1 ? "" : "s"}
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Target {pct(firm.targetMultiple)} of opening balance · breach level{" "}
          {pct(firm.breachMultiple)} · payout share {pct(firm.payoutShare)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {firm.accounts.length === 0 ? (
          <p className="text-muted-foreground text-sm py-2">{firm.note ?? "No accounts."}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead className="text-right">Opening Balance</TableHead>
                <TableHead className="text-right">Current Equity</TableHead>
                <TableHead className="text-right">Target</TableHead>
                <TableHead className="text-right">Breach Level</TableHead>
                <TableHead className="text-right">Available Equity</TableHead>
                {anyLocked && (
                  <>
                    <TableHead className="text-right">Eligible For Payout</TableHead>
                    <TableHead className="text-right">Net Payout</TableHead>
                    <TableHead />
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {firm.accounts.map(a => (
                <AccountRow
                  key={a.accountId}
                  account={a}
                  anyLocked={anyLocked}
                  payee={firm.label ?? firm.name}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function AccountRow({
  account: a,
  anyLocked,
  payee,
}: {
  account: PropAccount;
  anyLocked: boolean;
  /** Who the invoice would be addressed to — the firm's label, e.g. TCT. */
  payee: string;
}) {
  const createInvoice = () =>
    toast.info(
      `Invoicing isn't wired up yet — ${a.alias} is ready to invoice ${payee} for ${fmtMoney(
        a.netPayout,
        a.currency
      )}.`
    );

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="font-medium">{a.alias}</span>
          {a.locked && (
            <Badge variant="secondary" className="gap-1">
              <Lock className="h-3 w-3" />
              Locked
            </Badge>
          )}
          {a.warning && (
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{a.warning}</TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {a.loginAccountNumber ?? "—"}
          {a.broker ? ` · ${a.broker}` : ""}
        </div>
      </TableCell>

      <TableCell>
        {a.startDateIsFunding ? (
          fmtDate(a.startDate)
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="underline decoration-dotted">{fmtDate(a.startDate)}</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              No funding deposit on record — this is when MetaCopier first saw the account.
            </TooltipContent>
          </Tooltip>
        )}
      </TableCell>

      <TableCell className="text-right tabular-nums">
        {a.openingBalanceSource === "override" ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="underline decoration-dotted">
                {fmtMoney(a.openingBalance, a.currency)}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              The programme's nominal size, set by hand. This account was moved into MetaCopier
              part-way through, so its only recorded deposit is what it was worth on the day — not
              what it started with.
            </TooltipContent>
          </Tooltip>
        ) : (
          fmtMoney(a.openingBalance, a.currency)
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums font-medium">
        {fmtMoney(a.currentEquity, a.currency)}
      </TableCell>

      <TableCell className="text-right tabular-nums">
        {a.locked ? (
          <Badge variant="secondary" className="font-mono">
            $0 Locked
          </Badge>
        ) : (
          fmtMoney(a.target, a.currency)
        )}
      </TableCell>

      <TableCell className="text-right tabular-nums">{fmtMoney(a.breachLevel, a.currency)}</TableCell>
      <TableCell
        className={`text-right tabular-nums font-medium ${
          a.availableEquity != null && a.availableEquity < 0 ? "text-destructive" : ""
        }`}
      >
        {fmtMoney(a.availableEquity, a.currency)}
      </TableCell>

      {anyLocked && (
        <>
          <TableCell className="text-right tabular-nums">
            {a.locked ? fmtMoney(a.eligibleForPayout, a.currency) : "—"}
          </TableCell>
          <TableCell className="text-right tabular-nums font-medium">
            {a.locked ? fmtMoney(a.netPayout, a.currency) : "—"}
          </TableCell>
          <TableCell className="text-right">
            {a.locked && (
              <Button variant="outline" size="sm" onClick={createInvoice}>
                <FileText className="h-4 w-4 mr-2" />
                Create Invoice to {payee}
              </Button>
            )}
          </TableCell>
        </>
      )}
    </TableRow>
  );
}
