import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useTradingSession } from "@/hooks/useTradingSession";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  RefreshCw, 
  LogOut,
  Activity,
  Calendar,
  Percent
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

function PnLCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon,
  isLoading 
}: { 
  title: string; 
  value: number; 
  subtitle: string; 
  icon: typeof TrendingUp;
  isLoading?: boolean;
}) {
  const isPositive = value >= 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Skeleton className="h-4 w-4 rounded" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-3 w-24" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={isPositive ? "border-primary/20" : "border-destructive/20"}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${isPositive ? "text-primary" : "text-destructive"}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${isPositive ? "text-primary" : "text-destructive"}`}>
          {formatCurrency(value, true)}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

function PositionCard({ position, index }: { position: any; index: number }) {
  const isPositive = (position.profit ?? 0) >= 0;
  const isBuy = position.type === "BUY";

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              isBuy ? "bg-primary/10" : "bg-destructive/10"
            }`}>
              {isBuy ? (
                <TrendingUp className="h-5 w-5 text-primary" />
              ) : (
                <TrendingDown className="h-5 w-5 text-destructive" />
              )}
            </div>
            <div>
              <div className="font-semibold">{position.symbol}</div>
              <div className="text-xs text-muted-foreground">
                {position.type} • {position.volume} lots
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className={`font-bold ${isPositive ? "text-primary" : "text-destructive"}`}>
              {formatCurrency(position.profit ?? 0, true)}
            </div>
            <div className="text-xs text-muted-foreground">
              @ {position.openPrice?.toFixed(5) ?? "N/A"}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { session, isLoading: sessionLoading, logout } = useTradingSession();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const utils = trpc.useUtils();

  const { data: pnlSummary, isLoading: pnlLoading } = trpc.trading.getPnLSummary.useQuery(undefined, {
    refetchInterval: 60000, // Refresh every 60 seconds
  });

  const { data: openPositions, isLoading: positionsLoading } = trpc.trading.getOpenPositions.useQuery(undefined, {
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: copierInfo } = trpc.trading.getCopierInfo.useQuery(undefined, {
    refetchInterval: 60000, // Refresh every 60 seconds
  });

  // Redirect to login if not authenticated
  if (!sessionLoading && !session) {
    setLocation("/");
    return null;
  }

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        utils.trading.getPnLSummary.invalidate(),
        utils.trading.getOpenPositions.invalidate(),
      ]);
      toast.success("Data refreshed");
    } catch (error) {
      toast.error("Failed to refresh data");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  if (sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold">RFX Trader Dashboard</h1>
                <p className="text-sm text-muted-foreground">
                  {session?.name} • Magic #{session?.magicNumber}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container py-8 space-y-8">
        {/* Today's P&L Hero Card */}
        <Card className="bg-gradient-to-br from-primary/5 via-background to-background border-primary/20">
          <CardHeader>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              <span>Today's Total P&L</span>
            </div>
          </CardHeader>
          <CardContent>
            {pnlLoading ? (
              <Skeleton className="h-12 w-48" />
            ) : (
              <>
                <div className={`text-4xl font-bold mb-4 ${
                  (pnlSummary?.todayTotalPnL ?? 0) >= 0 ? "text-primary" : "text-destructive"
                }`}>
                  {formatCurrency(pnlSummary?.todayTotalPnL ?? 0, true)}
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div>
                    <span className="text-muted-foreground">Realized: </span>
                    <span className="font-semibold">
                      {formatCurrency(pnlSummary?.todayRealizedPnL ?? 0, true)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Floating: </span>
                    <span className="font-semibold">
                      {formatCurrency(pnlSummary?.floatingPnL ?? 0, true)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* P&L Summary Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <PnLCard
            title="This Week"
            value={pnlSummary?.weekPnL ?? 0}
            subtitle="Last 7 days"
            icon={Calendar}
            isLoading={pnlLoading}
          />
          <PnLCard
            title="This Month"
            value={pnlSummary?.monthPnL ?? 0}
            subtitle="Current month"
            icon={Calendar}
            isLoading={pnlLoading}
          />
          <PnLCard
            title="All Time"
            value={pnlSummary?.allTimePnL ?? 0}
            subtitle="Total performance"
            icon={TrendingUp}
            isLoading={pnlLoading}
          />
          <PnLCard
            title="Weekly Profit Share"
            value={pnlSummary?.weeklyProfitShare ?? 0}
            subtitle={`${((pnlSummary?.profitSharePercent ?? 0) * 100).toFixed(0)}% of positive weekly P&L`}
            icon={Percent}
            isLoading={pnlLoading}
          />
        </div>

        {/* Open Positions */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold">Open Positions</h2>
              <p className="text-sm text-muted-foreground">
                {positionsLoading ? "Loading..." : `${openPositions?.length ?? 0} active positions`}
              </p>
              {copierInfo && (
                <>
                  {!copierInfo.isActive ? (
                    <p className="text-sm font-semibold text-destructive mt-1">
                      Your trades are not being copied into the Live Account
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1">
                      {copierInfo.scaleType === 3 ? (
                        <>
                          Each of your trades is going into the Live Account as <span className="font-semibold">{copierInfo.fixedLotSize} lots</span>
                        </>
                      ) : copierInfo.scaleType === 1 ? (
                        <>
                          Each of your trades are being multiplied by <span className="font-semibold">{copierInfo.multiplier}x</span> into the Live Account
                        </>
                      ) : (
                        <>
                          Your trades are being copied to the Live Account
                        </>
                      )}
                    </p>
                  )}
                </>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => setLocation("/history")}>
              <Activity className="h-4 w-4 mr-2" />
              View History
            </Button>
          </div>

          {positionsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Skeleton className="w-10 h-10 rounded-full" />
                        <div>
                          <Skeleton className="h-4 w-20 mb-2" />
                          <Skeleton className="h-3 w-32" />
                        </div>
                      </div>
                      <div className="text-right">
                        <Skeleton className="h-5 w-24 mb-2" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : openPositions && openPositions.length > 0 ? (
            <div className="space-y-3">
              {openPositions.map((position, index) => (
                <PositionCard key={position.id} position={position} index={index} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <h3 className="font-semibold mb-2">No Open Positions</h3>
                <p className="text-sm text-muted-foreground">
                  You don't have any active trading positions at the moment.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
