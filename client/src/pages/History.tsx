import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useTradingSession } from "@/hooks/useTradingSession";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  RefreshCw,
  History as HistoryIcon
} from "lucide-react";
import { toast } from "sonner";

function formatCurrency(value: number, showSign = false): string {
  const formatted = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (showSign) {
    return value >= 0 ? `+$${formatted}` : `-$${formatted}`;
  }
  return `$${formatted}`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { 
    month: "short", 
    day: "numeric",
    year: "numeric"
  });
}

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPrice(price: number | undefined | null): string {
  if (price == null) return "—";
  if (Math.abs(price) >= 100) return price.toFixed(2);
  return price.toFixed(5);
}

function wasTPHit(position: any): boolean {
  if (!position.closePrice || !position.takeProfit) return false;
  const diff = Math.abs(position.closePrice - position.takeProfit);
  const scale = Math.max(Math.abs(position.takeProfit), 1);
  return diff / scale < 0.0001;
}

function wasSLHit(position: any): boolean {
  if (!position.closePrice || !position.stopLoss) return false;
  const diff = Math.abs(position.closePrice - position.stopLoss);
  const scale = Math.max(Math.abs(position.stopLoss), 1);
  return diff / scale < 0.0001;
}

function groupPositionsByDate(positions: any[]) {
  const grouped = new Map<string, any[]>();
  
  positions.forEach(pos => {
    if (!pos.closeTime) return;
    
    const dateKey = formatDate(pos.closeTime);
    const existing = grouped.get(dateKey) ?? [];
    existing.push(pos);
    grouped.set(dateKey, existing);
  });
  
  return Array.from(grouped.entries()).map(([date, positions]) => ({
    date,
    positions,
    totalPnL: positions.reduce((sum, p) => sum + (p.profit ?? 0) + (p.swap ?? 0) + (p.commission ?? 0), 0),
    count: positions.length,
  }));
}

function DayGroup({ group }: { group: { date: string; positions: any[]; totalPnL: number; count: number } }) {
  const [isOpen, setIsOpen] = useState(false);
  const isPositive = group.totalPnL >= 0;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <button className="w-full">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isOpen ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div className="text-left">
                    <div className="font-semibold">{group.date}</div>
                    <div className="text-sm text-muted-foreground">
                      {group.count} {group.count === 1 ? "trade" : "trades"}
                    </div>
                  </div>
                </div>
                <div className={`text-xl font-bold ${isPositive ? "text-primary" : "text-destructive"}`}>
                  {formatCurrency(group.totalPnL, true)}
                </div>
              </div>
            </CardContent>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Volume</TableHead>
                  <TableHead>Open Date</TableHead>
                  <TableHead>Close Date</TableHead>
                  <TableHead className="text-right">Open Price</TableHead>
                  <TableHead className="text-right">Close Price</TableHead>
                  <TableHead className="text-right">TP</TableHead>
                  <TableHead className="text-right">SL</TableHead>
                  <TableHead className="text-right">P&L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.positions.map((position) => {
                  const totalPnL = (position.profit ?? 0) + (position.swap ?? 0) + (position.commission ?? 0);
                  const isPositive = totalPnL >= 0;
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
                      <TableCell className={`text-right font-bold ${isPositive ? "text-primary" : "text-destructive"}`}>
                        {formatCurrency(totalPnL, true)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default function History() {
  const [, setLocation] = useLocation();
  const { session, isLoading: sessionLoading } = useTradingSession();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const utils = trpc.useUtils();

  const { data: allTimePositions, isLoading: positionsLoading } = trpc.trading.getAllTimePositions.useQuery(undefined, {
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  // Redirect to login if not authenticated
  if (!sessionLoading && !session) {
    setLocation("/");
    return null;
  }

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await utils.trading.getAllTimePositions.invalidate();
      toast.success("History refreshed");
    } catch (error) {
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

  const groupedPositions = allTimePositions ? groupPositionsByDate(allTimePositions) : [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/dashboard")}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-xl font-bold">Trade History</h1>
                <p className="text-sm text-muted-foreground">
                  All-time trading performance
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="container py-8">
        {positionsLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-5 w-5" />
                      <div>
                        <Skeleton className="h-4 w-32 mb-2" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                    <Skeleton className="h-6 w-24" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : groupedPositions.length > 0 ? (
          <div className="space-y-3">
            {groupedPositions.map((group) => (
              <DayGroup key={group.date} group={group} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <HistoryIcon className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="text-lg font-semibold mb-2">No Trade History</h3>
              <p className="text-sm text-muted-foreground">
                Your closed trading positions will appear here once you complete trades.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
