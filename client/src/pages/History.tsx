import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useTradingSession } from "@/hooks/useTradingSession";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  RefreshCw,
  History as HistoryIcon,
  CreditCard,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { PaginationBar, paginate, type PageSize } from "@/components/Pagination";
import { TransmissionProofDialog, type ProofPayment } from "@/components/TransmissionProofDialog";

function formatCurrency(value: number, showSign = false): string {
  const formatted = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (showSign) return value >= 0 ? `+$${formatted}` : `-$${formatted}`;
  return `$${formatted}`;
}

function formatDateTime(dateString: string | Date): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPrice(price: number | undefined | null): string {
  if (price == null) return "—";
  if (Math.abs(price) >= 100) return price.toFixed(2);
  return price.toFixed(5);
}

function wasTPHit(p: any): boolean {
  if (!p.closePrice || !p.takeProfit) return false;
  return Math.abs(p.closePrice - p.takeProfit) / Math.max(Math.abs(p.takeProfit), 1) < 0.0001;
}
function wasSLHit(p: any): boolean {
  if (!p.closePrice || !p.stopLoss) return false;
  return Math.abs(p.closePrice - p.stopLoss) / Math.max(Math.abs(p.stopLoss), 1) < 0.0001;
}

function explorerUrl(network: string | null, hash: string): string {
  return network === "ERC20"
    ? `https://etherscan.io/tx/${hash}`
    : `https://tronscan.org/#/transaction/${hash}`;
}

export default function History() {
  const [, setLocation] = useLocation();
  const { session, isLoading: sessionLoading } = useTradingSession();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const utils = trpc.useUtils();

  const [tradePageSize, setTradePageSize] = useState<PageSize>(10);
  const [tradePage, setTradePage] = useState(0);
  const [payPageSize, setPayPageSize] = useState<PageSize>(10);
  const [payPage, setPayPage] = useState(0);
  const [proofPayment, setProofPayment] = useState<ProofPayment | null>(null);

  const { data: allTimePositions, isLoading: positionsLoading } =
    trpc.trading.getAllTimePositions.useQuery(undefined, {
      refetchInterval: 300000,
    });
  const { data: payments, isLoading: paymentsLoading } =
    trpc.trading.getPayments.useQuery(undefined);

  // Newest first.
  const sortedTrades = useMemo(
    () =>
      [...(allTimePositions ?? [])]
        .filter((p: any) => p.closeTime)
        .sort(
          (a: any, b: any) =>
            new Date(b.closeTime).getTime() - new Date(a.closeTime).getTime()
        ),
    [allTimePositions]
  );
  const sortedPayments = useMemo(
    () =>
      [...(payments ?? [])].sort(
        (a, b) =>
          new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()
      ),
    [payments]
  );

  if (!sessionLoading && !session) {
    setLocation("/");
    return null;
  }

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        utils.trading.getAllTimePositions.invalidate(),
        utils.trading.getPayments.invalidate(),
      ]);
      toast.success("History refreshed");
    } catch {
      toast.error("Failed to refresh history");
    } finally {
      setIsRefreshing(false);
    }
  };

  if (sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading history...</p>
        </div>
      </div>
    );
  }

  const trades = paginate(sortedTrades, tradePageSize, tradePage);
  const pays = paginate(sortedPayments, payPageSize, payPage);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setLocation("/dashboard")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-xl font-bold">Trade History</h1>
                <p className="text-sm text-muted-foreground">All-time trading performance</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="container py-8 space-y-8">
        {/* Trade History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <HistoryIcon className="h-5 w-5" />
              Trade History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {positionsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : trades.total === 0 ? (
              <div className="py-10 text-center">
                <HistoryIcon className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Your closed trading positions will appear here once you complete trades.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ticket</TableHead>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Volume</TableHead>
                        <TableHead>Open</TableHead>
                        <TableHead>Close</TableHead>
                        <TableHead className="text-right">Open Price</TableHead>
                        <TableHead className="text-right">Close Price</TableHead>
                        <TableHead className="text-right">TP</TableHead>
                        <TableHead className="text-right">SL</TableHead>
                        <TableHead className="text-right">P&L</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trades.slice.map((position: any) => {
                        const pnl =
                          (position.profit ?? 0) + (position.swap ?? 0) + (position.commission ?? 0);
                        const tpHit = wasTPHit(position);
                        const slHit = wasSLHit(position);
                        return (
                          <TableRow key={position.id}>
                            <TableCell className="font-mono text-xs text-muted-foreground">{position.id}</TableCell>
                            <TableCell className="font-semibold">{position.symbol}</TableCell>
                            <TableCell>
                              <Badge variant={position.type === "BUY" ? "default" : "destructive"} className="text-xs">
                                {position.type}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">{position.volume}</TableCell>
                            <TableCell className="text-xs">{formatDateTime(position.openTime)}</TableCell>
                            <TableCell className="text-xs">{formatDateTime(position.closeTime)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{formatPrice(position.openPrice)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{formatPrice(position.closePrice)}</TableCell>
                            <TableCell className={`text-right font-mono text-xs ${tpHit ? "text-green-600 font-bold" : ""}`}>
                              {position.takeProfit ? formatPrice(position.takeProfit) : "—"}
                              {tpHit && <span className="ml-1 text-[10px]">HIT</span>}
                            </TableCell>
                            <TableCell className={`text-right font-mono text-xs ${slHit ? "text-destructive font-bold" : ""}`}>
                              {position.stopLoss ? formatPrice(position.stopLoss) : "—"}
                              {slHit && <span className="ml-1 text-[10px]">HIT</span>}
                            </TableCell>
                            <TableCell className={`text-right font-bold ${pnl >= 0 ? "text-primary" : "text-destructive"}`}>
                              {formatCurrency(pnl, true)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <PaginationBar
                  total={trades.total}
                  pageSize={tradePageSize}
                  setPageSize={setTradePageSize}
                  page={tradePage}
                  setPage={setTradePage}
                />
              </>
            )}
          </CardContent>
        </Card>

        {/* Payments */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="h-5 w-5" />
              Payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {paymentsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : pays.total === 0 ? (
              <div className="py-10 text-center">
                <CreditCard className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Payments made to you will appear here.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Network</TableHead>
                        <TableHead className="text-right">Fee</TableHead>
                        <TableHead>Note</TableHead>
                        <TableHead className="text-right">Transaction</TableHead>
                        <TableHead className="text-right">Proof</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pays.slice.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-xs">{formatDateTime(p.paymentDate)}</TableCell>
                          <TableCell className="text-right font-semibold text-primary">
                            {formatCurrency(p.amount)}
                          </TableCell>
                          <TableCell>
                            {p.network ? (
                              <Badge variant="outline" className="text-xs">{p.network}</Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {p.networkFee ? formatCurrency(p.networkFee) : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                            {p.narration || "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {p.transactionHash ? (
                              <a
                                href={explorerUrl(p.network, p.transactionHash)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-mono text-primary hover:underline"
                              >
                                {p.transactionHash.slice(0, 8)}…{p.transactionHash.slice(-6)}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => setProofPayment(p)}
                            >
                              Show Transmission Proof
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <PaginationBar
                  total={pays.total}
                  pageSize={payPageSize}
                  setPageSize={setPayPageSize}
                  page={payPage}
                  setPage={setPayPage}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <TransmissionProofDialog
        payment={proofPayment}
        open={!!proofPayment}
        onOpenChange={(o) => !o && setProofPayment(null)}
      />
    </div>
  );
}
