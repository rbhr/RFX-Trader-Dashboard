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
import { useLanguage, Ltr } from "@/contexts/LanguageContext";
import { LanguageSelector } from "@/components/LanguageSelector";

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
  const { t } = useLanguage();
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
      toast.success(t("history.refreshed"));
    } catch {
      toast.error(t("history.refreshFailed"));
    } finally {
      setIsRefreshing(false);
    }
  };

  if (sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">{t("history.loading")}</p>
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
                <ArrowLeft className="h-4 w-4 me-2 rtl:rotate-180" />
                {t("common.back")}
              </Button>
              <div>
                <h1 className="text-xl font-bold">{t("history.title")}</h1>
                <p className="text-sm text-muted-foreground">{t("history.subtitle")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LanguageSelector />
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
                <RefreshCw className={`h-4 w-4 me-2 ${isRefreshing ? "animate-spin" : ""}`} />
                {t("common.refresh")}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container py-8 space-y-8">
        {/* Trade History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <HistoryIcon className="h-5 w-5" />
              {t("history.title")}
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
                  {t("history.emptyTrades")}
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("table.ticket")}</TableHead>
                        <TableHead>{t("table.symbol")}</TableHead>
                        <TableHead>{t("table.type")}</TableHead>
                        <TableHead className="text-end">{t("table.volume")}</TableHead>
                        <TableHead>{t("table.open")}</TableHead>
                        <TableHead>{t("table.close")}</TableHead>
                        <TableHead className="text-end">{t("table.openPrice")}</TableHead>
                        <TableHead className="text-end">{t("table.closePrice")}</TableHead>
                        <TableHead className="text-end">{t("table.tp")}</TableHead>
                        <TableHead className="text-end">{t("table.sl")}</TableHead>
                        <TableHead className="text-end">{t("table.pnl")}</TableHead>
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
                            <TableCell className="font-mono text-xs text-muted-foreground"><Ltr>{position.id}</Ltr></TableCell>
                            <TableCell className="font-semibold"><Ltr>{position.symbol}</Ltr></TableCell>
                            <TableCell>
                              <Badge className={`text-xs border-transparent text-white ${position.type === "BUY" ? "bg-blue-600" : "bg-red-600"}`}>
                                {position.type}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-end"><Ltr>{position.volume}</Ltr></TableCell>
                            <TableCell className="text-xs"><Ltr>{formatDateTime(position.openTime)}</Ltr></TableCell>
                            <TableCell className="text-xs"><Ltr>{formatDateTime(position.closeTime)}</Ltr></TableCell>
                            <TableCell className="text-end font-mono text-xs"><Ltr>{formatPrice(position.openPrice)}</Ltr></TableCell>
                            <TableCell className="text-end font-mono text-xs"><Ltr>{formatPrice(position.closePrice)}</Ltr></TableCell>
                            <TableCell className={`text-end font-mono text-xs ${tpHit ? "text-green-600 font-bold" : ""}`}>
                              <Ltr>{position.takeProfit ? formatPrice(position.takeProfit) : "—"}</Ltr>
                              {tpHit && <span className="ms-1 text-[10px]">{t("common.hit")}</span>}
                            </TableCell>
                            <TableCell className={`text-end font-mono text-xs ${slHit ? "text-destructive font-bold" : ""}`}>
                              <Ltr>{position.stopLoss ? formatPrice(position.stopLoss) : "—"}</Ltr>
                              {slHit && <span className="ms-1 text-[10px]">{t("common.hit")}</span>}
                            </TableCell>
                            <TableCell className={`text-end font-bold ${pnl >= 0 ? "text-primary" : "text-destructive"}`}>
                              <Ltr>{formatCurrency(pnl, true)}</Ltr>
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
              {t("history.payments")}
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
                  {t("history.emptyPayments")}
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("table.date")}</TableHead>
                        <TableHead className="text-end">{t("table.amount")}</TableHead>
                        <TableHead>{t("table.network")}</TableHead>
                        <TableHead className="text-end">{t("table.fee")}</TableHead>
                        <TableHead>{t("table.note")}</TableHead>
                        <TableHead className="text-end">{t("table.transaction")}</TableHead>
                        <TableHead className="text-end">{t("table.proof")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pays.slice.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-xs"><Ltr>{formatDateTime(p.paymentDate)}</Ltr></TableCell>
                          <TableCell className="text-end font-semibold text-primary">
                            <Ltr>{formatCurrency(p.amount)}</Ltr>
                          </TableCell>
                          <TableCell>
                            {p.network ? (
                              <Badge variant="outline" className="text-xs">{p.network}</Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-end text-xs text-muted-foreground">
                            <Ltr>{p.networkFee ? formatCurrency(p.networkFee) : "—"}</Ltr>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" dir="auto">
                            {p.narration || "—"}
                          </TableCell>
                          <TableCell className="text-end">
                            {p.transactionHash ? (
                              <a
                                href={explorerUrl(p.network, p.transactionHash)}
                                target="_blank"
                                rel="noopener noreferrer"
                                dir="ltr"
                                className="inline-flex items-center gap-1 text-xs font-mono text-primary hover:underline"
                              >
                                {p.transactionHash.slice(0, 8)}…{p.transactionHash.slice(-6)}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-end">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => setProofPayment(p)}
                            >
                              {t("common.showTransmissionProof")}
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
