import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import AdminLayout from "@/components/AdminLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Banknote,
  ArrowLeft,
  AlertCircle,
  Loader2,
  Calculator,
  FlaskConical,
} from "lucide-react";
import {
  defaultPayoutWindow,
  toDatetimeLocal,
  type PayoutCycle,
} from "@/lib/payoutPeriods";

const TEST_ADDRESS = "TMECgXuUt9ZAuduNCGCfVeRxTFeHjVQLW9";

type PayoutRow = {
  id: number;
  name: string;
  magicNumber: string;
  profitShare: number;
  cumulativeProfit: number;
  baseline: number;
  shareableProfit: number;
  payoutAmount: number;
  usdtAddress: string | null;
  usdtNetwork: string | null;
  payoutCycle: string | null;
  lastPayoutAt: string | Date | null;
  payable: boolean;
  reason: string | null;
};

const fmtUsd = (v: number) =>
  v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });

const fmtDate = (d: string | Date | null) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

export default function ProcessPayouts() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const initial = defaultPayoutWindow("Fortnightly");
  const [cycle, setCycle] = useState<PayoutCycle>("Fortnightly");
  const [from, setFrom] = useState<string>(toDatetimeLocal(initial.from));
  const [to, setTo] = useState<string>(toDatetimeLocal(initial.to));
  const [testingMode, setTestingMode] = useState(false);

  const [calcParams, setCalcParams] = useState<{
    cycle: PayoutCycle;
    from: Date;
    to: Date;
  } | null>(null);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [settleTarget, setSettleTarget] = useState<PayoutRow | null>(null);

  const { data: walletInfo } = trpc.admin.getWalletInfo.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const previewQuery = trpc.admin.previewPayouts.useQuery(
    calcParams
      ? { cycle: calcParams.cycle, from: calcParams.from, to: calcParams.to }
      : { cycle: "Fortnightly", from: initial.from, to: initial.to },
    { enabled: !!calcParams }
  );

  const rows = (previewQuery.data ?? []) as PayoutRow[];

  // When fresh preview data arrives, default-select all payable rows.
  useEffect(() => {
    if (previewQuery.data) {
      setSelected(
        new Set(
          (previewQuery.data as PayoutRow[])
            .filter(r => r.payable)
            .map(r => r.id)
        )
      );
    }
  }, [previewQuery.data]);

  const processMutation = trpc.admin.processProfitSharePayout.useMutation();
  const setBaselineMutation = trpc.admin.setPayoutBaseline.useMutation();

  // While a payout run is in progress, warn before closing/refreshing the tab —
  // that would interrupt traders still queued (in-app navigation is safe; the
  // loop keeps running).
  useEffect(() => {
    if (!processing) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [processing]);

  const onCycleChange = (c: PayoutCycle) => {
    setCycle(c);
    const w = defaultPayoutWindow(c);
    setFrom(toDatetimeLocal(w.from));
    setTo(toDatetimeLocal(w.to));
  };

  const calculate = () => {
    const fromD = new Date(from);
    const toD = new Date(to);
    if (isNaN(fromD.getTime()) || isNaN(toD.getTime())) {
      toast.error("Enter valid From and To dates");
      return;
    }
    if (fromD >= toD) {
      toast.error("From must be before To");
      return;
    }
    setCalcParams({ cycle, from: fromD, to: toD });
  };

  const payableRows = rows.filter(r => r.payable);
  const notPayableRows = rows.filter(r => !r.payable);

  // Per-network selected totals (Testing Mode routes everything to TRC20).
  const { trc20Total, erc20Total, selectedCount, selectedTotal } = useMemo(() => {
    let trc = 0,
      erc = 0,
      count = 0,
      total = 0;
    for (const r of payableRows) {
      if (!selected.has(r.id)) continue;
      count++;
      total += r.payoutAmount;
      const net = testingMode ? "TRC20" : r.usdtNetwork;
      if (net === "ERC20") erc += r.payoutAmount;
      else trc += r.payoutAmount;
    }
    return { trc20Total: trc, erc20Total: erc, selectedCount: count, selectedTotal: total };
  }, [payableRows, selected, testingMode]);

  const trc20Avail = walletInfo?.trc20
    ? walletInfo.trc20.gasFreeEnabled && walletInfo.trc20.gasFreeBalance
      ? parseFloat(walletInfo.trc20.gasFreeBalance)
      : parseFloat(walletInfo.trc20.usdtBalance)
    : 0;
  const erc20Avail = walletInfo?.erc20 ? parseFloat(walletInfo.erc20.usdtBalance) : 0;

  const trc20Ok = trc20Total <= trc20Avail + 1e-6;
  const erc20Ok = erc20Total <= erc20Avail + 1e-6;
  const balanceOk = trc20Ok && erc20Ok;
  const canPay = selectedCount > 0 && balanceOk && !processing;

  const allPayableSelected =
    payableRows.length > 0 && payableRows.every(r => selected.has(r.id));
  const toggleSelectAll = () => {
    if (allPayableSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(payableRows.map(r => r.id)));
    }
  };
  const toggleOne = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runPayouts = async () => {
    setConfirmOpen(false);
    setProcessing(true);
    const targets = payableRows.filter(r => selected.has(r.id));
    let ok = 0;
    const fails: string[] = [];
    for (const r of targets) {
      try {
        await processMutation.mutateAsync({
          magicNumberId: r.id,
          from: new Date(from),
          to: new Date(to),
          expectedPayoutAmount: r.payoutAmount,
          cycle,
          testingMode,
        });
        ok++;
      } catch (e: any) {
        fails.push(`${r.name}: ${e?.message || "failed"}`);
      }
    }
    setProcessing(false);
    if (fails.length === 0) {
      toast.success(`Processed ${ok} payout${ok !== 1 ? "s" : ""}`);
    } else {
      toast.error(`Paid ${ok}/${targets.length}. Failed — ${fails.join("; ")}`);
    }
    previewQuery.refetch();
    utils.admin.getWalletInfo.invalidate();
  };

  const confirmSettle = async () => {
    if (!settleTarget) return;
    const target = settleTarget;
    setSettleTarget(null);
    try {
      await setBaselineMutation.mutateAsync({
        magicNumberId: target.id,
        to: new Date(to),
      });
      toast.success(`${target.name} marked settled (baseline updated)`);
      previewQuery.refetch();
    } catch (e: any) {
      toast.error(e?.message || "Failed to set baseline");
    }
  };

  const networkLabel = (r: PayoutRow) =>
    testingMode ? "TRC20 (test)" : r.usdtNetwork || "—";

  return (
    <AdminLayout>
      <div className="p-8 space-y-6">
        <div className="flex items-center gap-3">
          <Banknote className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Process Payouts</h1>
            <p className="text-muted-foreground text-sm">
              High-water-mark profit-share. Each trader is paid their share of
              new cumulative profit above their baseline.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => setLocation("/admin/payments")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Payments
          </Button>
        </div>

        {/* Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payout run</CardTitle>
            <CardDescription>
              Period runs Saturday 11:00 Adelaide; dates are editable for
              anomalies and testing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Cycle</Label>
                <Select value={cycle} onValueChange={v => onCycleChange(v as PayoutCycle)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Weekly">Weekly</SelectItem>
                    <SelectItem value="Fortnightly">Fortnightly</SelectItem>
                    <SelectItem value="Ad-hoc">Ad-hoc</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="from">Period From</Label>
                <Input
                  id="from"
                  type="datetime-local"
                  value={from}
                  onChange={e => setFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="to">Period To</Label>
                <Input
                  id="to"
                  type="datetime-local"
                  value={to}
                  onChange={e => setTo(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>&nbsp;</Label>
                <Button className="w-full" onClick={calculate} disabled={previewQuery.isFetching}>
                  {previewQuery.isFetching ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Calculator className="h-4 w-4 mr-2" />
                  )}
                  Calculate
                </Button>
              </div>
            </div>

            <div
              className={`flex items-center gap-3 rounded-lg border p-3 ${
                testingMode ? "border-amber-500/50 bg-amber-500/10" : ""
              }`}
            >
              <FlaskConical
                className={`h-5 w-5 ${testingMode ? "text-amber-500" : "text-muted-foreground"}`}
              />
              <div className="flex-1">
                <div className="font-medium text-sm">Testing Mode</div>
                <div className="text-xs text-muted-foreground">
                  {testingMode ? (
                    <>
                      Sends go to the test wallet{" "}
                      <span className="font-mono">{TEST_ADDRESS}</span> (TRC20).
                      Traders are not paid or notified; baselines unchanged.
                    </>
                  ) : (
                    "Off — payouts go to traders' real addresses."
                  )}
                </div>
              </div>
              <Switch checked={testingMode} onCheckedChange={setTestingMode} />
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {calcParams && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                Payable traders
                {payableRows.length > 0 && (
                  <Badge variant="secondary">{payableRows.length}</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Cumulative profit to {fmtDate(calcParams.to)} minus baseline,
                times profit-share %.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {previewQuery.isFetching ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
                  Calculating payouts…
                </div>
              ) : payableRows.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  No traders owed a payout for this run.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allPayableSelected}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all"
                        />
                      </TableHead>
                      <TableHead>Trader</TableHead>
                      <TableHead className="text-right">Cumulative</TableHead>
                      <TableHead className="text-right">Baseline</TableHead>
                      <TableHead className="text-right">Shareable</TableHead>
                      <TableHead className="text-right">Share %</TableHead>
                      <TableHead className="text-right">Payout</TableHead>
                      <TableHead>Network</TableHead>
                      <TableHead>Last paid</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payableRows.map(r => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(r.id)}
                            onCheckedChange={() => toggleOne(r.id)}
                            aria-label={`Select ${r.name}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{r.name}</div>
                          <div className="text-xs text-muted-foreground">{r.magicNumber}</div>
                        </TableCell>
                        <TableCell className="text-right">{fmtUsd(r.cumulativeProfit)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{fmtUsd(r.baseline)}</TableCell>
                        <TableCell className="text-right">{fmtUsd(r.shareableProfit)}</TableCell>
                        <TableCell className="text-right">{(r.profitShare * 100).toFixed(1)}%</TableCell>
                        <TableCell className="text-right font-semibold text-primary">{fmtUsd(r.payoutAmount)}</TableCell>
                        <TableCell>{networkLabel(r)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(r.lastPayoutAt)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setSettleTarget(r)}
                            title="Set baseline to current cumulative profit without paying"
                          >
                            Settle
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {/* Wallet balances + totals + pay button */}
              {payableRows.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
                  <div className="text-sm space-y-0.5">
                    <div>
                      Selected: <span className="font-semibold">{selectedCount}</span> ·{" "}
                      <span className="font-semibold">{fmtUsd(selectedTotal)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      TRC20 need {fmtUsd(trc20Total)} / have {fmtUsd(trc20Avail)}
                      {erc20Total > 0 || erc20Avail > 0
                        ? ` · ERC20 need ${fmtUsd(erc20Total)} / have ${fmtUsd(erc20Avail)}`
                        : ""}
                    </div>
                    {!balanceOk && (
                      <div className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Insufficient {!trc20Ok ? "TRC20" : ""}
                        {!trc20Ok && !erc20Ok ? " and " : ""}
                        {!erc20Ok ? "ERC20" : ""} balance for the selection
                      </div>
                    )}
                    {processing && (
                      <div className="text-xs text-amber-600 flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Processing — keep this tab open until it finishes.
                      </div>
                    )}
                  </div>
                  <Button
                    onClick={() => setConfirmOpen(true)}
                    disabled={!canPay}
                    className={testingMode ? "bg-amber-600 hover:bg-amber-700" : ""}
                  >
                    {processing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Banknote className="h-4 w-4 mr-2" />
                    )}
                    {testingMode ? "Pay Selected (TEST)" : "Pay Selected Traders"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Not payable */}
        {calcParams && notPayableRows.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Not payable ({notPayableRows.length})</CardTitle>
              <CardDescription>
                Excluded this run. Use “Settle” to set a trader's baseline to
                their current profit (e.g. already paid manually) without sending
                funds.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trader</TableHead>
                    <TableHead className="text-right">Cumulative</TableHead>
                    <TableHead className="text-right">Baseline</TableHead>
                    <TableHead className="text-right">Shareable</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notPayableRows.map(r => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-muted-foreground">{r.magicNumber}</div>
                      </TableCell>
                      <TableCell className="text-right">{fmtUsd(r.cumulativeProfit)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{fmtUsd(r.baseline)}</TableCell>
                      <TableCell className="text-right">{fmtUsd(r.shareableProfit)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.reason}</TableCell>
                      <TableCell>
                        {r.shareableProfit > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setSettleTarget(r)}
                            title="Set baseline to current cumulative profit without paying"
                          >
                            Settle
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Confirm pay */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className={`w-5 h-5 ${testingMode ? "text-amber-500" : "text-amber-500"}`} />
              {testingMode ? "Confirm TEST payout run" : "Confirm payout run"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Pay <span className="font-semibold text-foreground">{selectedCount}</span> trader
                  {selectedCount !== 1 ? "s" : ""} a total of{" "}
                  <span className="font-semibold text-foreground">{fmtUsd(selectedTotal)}</span> for the
                  period {fmtDate(new Date(from))} – {fmtDate(new Date(to))}.
                </p>
                {testingMode ? (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-700 text-xs">
                    Testing Mode: funds go to the TEST wallet ({TEST_ADDRESS}). Trader balances,
                    notifications and baselines are unaffected.
                  </div>
                ) : (
                  <p className="text-amber-600 text-xs">
                    This sends real on-chain transactions and notifies each trader. It cannot be
                    reversed.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runPayouts}>
              {testingMode ? "Send TEST payouts" : "Send payouts"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm settle */}
      <AlertDialog open={!!settleTarget} onOpenChange={o => !o && setSettleTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Set baseline to current?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  This marks <span className="font-semibold text-foreground">{settleTarget?.name}</span>{" "}
                  as settled up to {fmtDate(new Date(to))} by raising their baseline to{" "}
                  <span className="font-semibold text-foreground">
                    {settleTarget ? fmtUsd(settleTarget.cumulativeProfit) : ""}
                  </span>
                  . No funds are sent. Future payouts only cover profit above this level.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSettle}>Set baseline</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
