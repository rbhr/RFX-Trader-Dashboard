import { useState, useEffect, useRef } from "react";
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
  Percent,
  Settings,
  Bell,
  Check,
  FileText,
  Copy,
  CheckCircle2,
  ExternalLink
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
            <div className={`font-bold ${isPositive ? "text-green-600" : "text-destructive"}`}>
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

export default function Dashboard(props: {
  viewAsTraderId?: number;
  embedded?: boolean;
  [key: string]: any;
}) {
  const { viewAsTraderId: externalViewAsTraderId, embedded = false } = props ?? {};
  const [, setLocation] = useLocation();
  const { session: selfSession, isLoading: sessionLoading, logout } = useTradingSession();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [usdtAddress, setUsdtAddress] = useState<string>("");
  const [usdtNetwork, setUsdtNetwork] = useState<"TRC20" | "ERC20" | "">("")
  const [usdtAddressError, setUsdtAddressError] = useState<string | null>(null);
  const [telegramHandle, setTelegramHandle] = useState<string>("");

  // View-as-trader: use external prop (from AdminDashboard) or internal state
  const [internalViewAsTraderId, setViewAsTraderId] = useState<number | undefined>(undefined);
  const viewAsTraderId = externalViewAsTraderId ?? internalViewAsTraderId;
  const isViewingAsTrader = viewAsTraderId !== undefined;
  const viewAsInput = viewAsTraderId ? { viewAsTraderId } : undefined;

  // Fetch trader list for admin dropdown (only when not embedded — AdminDashboard has its own picker)
  const { data: allTraders } = trpc.admin.getAllTraders.useQuery(undefined, {
    enabled: !!selfSession?.isAdmin && !embedded,
  });

  // When viewing as another trader, fetch their session info
  const { data: viewedSession } = trpc.trading.getSession.useQuery(viewAsInput, {
    enabled: isViewingAsTrader,
  });

  // Use viewed trader's session when in view-as mode, otherwise self
  const session = isViewingAsTrader ? viewedSession : selfSession;

  const validateUsdtAddress = (address: string, network: string): string | null => {
    if (!address) return null;
    if (network === "TRC20") {
      if (address.length !== 34 || !address.startsWith("T"))
        return "TRC20 address must be 34 characters and start with 'T'";
    } else if (network === "ERC20") {
      if (address.length !== 42 || !address.startsWith("0x"))
        return "ERC20 address must be 42 characters and start with '0x'";
    }
    return null;
  };
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [proofDialogOpen, setProofDialogOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const { data: paymentHistory, isLoading: paymentsLoading } = trpc.trading.getPayments.useQuery(viewAsInput);
  const { data: notifications, refetch: refetchNotifications } = trpc.trading.getNotifications.useQuery(viewAsInput);
  const updateUsdtMutation = trpc.trading.updateUsdtInfo.useMutation();
  const updateTelegramMutation = trpc.trading.updateTelegramHandle.useMutation();
  const testTelegramMutation = trpc.trading.testTelegramMessage.useMutation();
  const markNotificationReadMutation = trpc.trading.markNotificationRead.useMutation();
  const markAllReadMutation = trpc.trading.markAllNotificationsRead.useMutation();

  const unreadCount = notifications?.filter(n => !n.isRead).length || 0;

  const { data: pnlSummary, isLoading: pnlLoading } = trpc.trading.getPnLSummary.useQuery(viewAsInput, {
    refetchInterval: 60000,
  });

  const { data: openPositions, isLoading: positionsLoading } = trpc.trading.getOpenPositions.useQuery(viewAsInput, {
    refetchInterval: 30000,
  });

  const { data: copierInfo } = trpc.trading.getCopierInfo.useQuery(viewAsInput, {
    refetchInterval: 60000,
  });

  const { data: maxOpenTrades } = trpc.trading.getMaxOpenTrades.useQuery(viewAsInput, {
    refetchInterval: 300000,
  });

  const { data: maxLotSize } = trpc.trading.getMaxLotSize.useQuery(viewAsInput, {
    refetchInterval: 300000,
  });

  const { data: riskLimit } = trpc.trading.getRiskLimit.useQuery(viewAsInput, {
    refetchInterval: 300000,
  });

  const { data: accountEquity } = trpc.trading.getAccountEquity.useQuery(viewAsInput, {
    refetchInterval: 60000,
  });

  const { data: accountBalanceEquity } = trpc.trading.getAccountBalanceAndEquity.useQuery(viewAsInput, {
    refetchInterval: 60000,
  });

  const reportBreachMutation = trpc.trading.reportRiskLimitBreach.useMutation();

  // Breach detection: fire once when equity drops below risk limit (only for own account)
  const breachReportedRef = useRef(false);
  useEffect(() => {
    if (
      !isViewingAsTrader &&
      accountEquity != null &&
      riskLimit != null &&
      accountEquity < riskLimit &&
      !breachReportedRef.current
    ) {
      breachReportedRef.current = true;
      reportBreachMutation.mutate(
        { equity: accountEquity, riskLimit },
        {
          onSuccess: (result) => {
            if (!('alreadyReported' in result)) {
              toast.error(
                `⚠️ Risk limit breached! Equity $${accountEquity.toFixed(2)} is below your $${riskLimit.toFixed(2)} limit. All trades have been closed. Please contact an admin.`,
                { duration: 10000 }
              );
            }
          },
        }
      );
    }
    // Reset ref when equity recovers above limit
    if (accountEquity != null && riskLimit != null && accountEquity >= riskLimit) {
      breachReportedRef.current = false;
    }
  }, [accountEquity, riskLimit]);

  // Redirect to login if not authenticated (skip when embedded in admin layout)
  if (!embedded && !sessionLoading && !selfSession) {
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

  const handleSaveUsdtInfo = async () => {
    const validationError = validateUsdtAddress(usdtAddress, usdtNetwork);
    if (validationError) {
      setUsdtAddressError(validationError);
      return;
    }
    setUsdtAddressError(null);
    try {
      await updateUsdtMutation.mutateAsync({
        usdtAddress: usdtAddress || undefined,
        usdtNetwork: usdtNetwork || undefined,
      });
      toast.success("USDT information updated");
    } catch (error) {
      toast.error("Failed to update USDT information");
    }
  };

  // Initialize USDT fields when own session loads (not viewed trader)
  useEffect(() => {
    if (selfSession) {
      setUsdtAddress(selfSession.usdtAddress || "");
      setUsdtNetwork(selfSession.usdtNetwork || "");
      setTelegramHandle(selfSession.telegramHandle || "");
    }
  }, [selfSession]);

  if (!embedded && sessionLoading) {
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
    <div className={embedded ? "" : "min-h-screen bg-background"}>
      {/* Header — hidden when embedded in admin layout */}
      {!embedded && (
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
              {/* Admin trader picker */}
              {selfSession?.isAdmin && allTraders && (
                <div className="ml-4">
                  <Select
                    value={viewAsTraderId?.toString() ?? "self"}
                    onValueChange={(v) => setViewAsTraderId(v === "self" ? undefined : parseInt(v))}
                  >
                    <SelectTrigger className="w-[220px] h-8 text-sm">
                      <SelectValue placeholder="View as trader..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="self">My Dashboard</SelectItem>
                      {allTraders.map((t) => (
                        <SelectItem key={t.id} value={t.id.toString()}>
                          {t.name} - {t.magicNumber}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="relative">
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                      <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs">
                        {unreadCount}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="end">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold">Notifications</h4>
                      {unreadCount > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            await markAllReadMutation.mutateAsync();
                            refetchNotifications();
                          }}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Mark all read
                        </Button>
                      )}
                    </div>
                    <div className="max-h-96 overflow-y-auto space-y-2">
                      {notifications && notifications.length > 0 ? (
                        notifications.map((notif) => (
                          <div
                            key={notif.id}
                            className={`p-3 rounded-lg border cursor-pointer ${
                              notif.isRead ? "bg-background" : "bg-primary/5 border-primary/20"
                            }`}
                            onClick={async () => {
                              if (!notif.isRead) {
                                await markNotificationReadMutation.mutateAsync({ notificationId: notif.id });
                                refetchNotifications();
                              }
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className="font-medium text-sm">{notif.title}</div>
                                <div className="text-xs text-muted-foreground mt-1">{notif.message}</div>
                                <div className="text-xs text-muted-foreground mt-2">
                                  {new Date(notif.createdAt).toLocaleString()}
                                </div>
                              </div>
                              {!notif.isRead && (
                                <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1" />
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No notifications</p>
                        </div>
                      )}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              {!isViewingAsTrader && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSettingsOpen(true)}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </div>
      )}

      <div className={embedded ? "space-y-8" : "container py-8 space-y-8"}>
        {/* Today's P&L + Copier Configuration side-by-side */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Today's P&L Hero Card */}
          <Card className="bg-gradient-to-br from-primary/5 via-background to-background border-primary/20">
            <CardHeader>
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
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

          {/* Account & Copier Configuration Card */}
          <Card className="border-primary/20">
            <CardHeader>
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Activity className="h-4 w-4" />
                <span>Account &amp; Copier Configuration</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {copierInfo ? (
                <>
                  {!copierInfo.isActive ? (
                    <p className="text-sm font-bold text-green-600">
                      Your trades are not being copied into the Live Account
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {copierInfo.scaleType === 3 ? (
                        <>
                          Each of your trades is going into the Live Account as <span className="font-bold text-green-600">{copierInfo.fixedLotSize} lots</span>
                        </>
                      ) : (
                        <>
                          Each of your trades are being multiplied by <span className="font-bold text-green-600">{copierInfo.multiplier}x</span> into the Live Account
                        </>
                      )}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Your maximum open trades: <span className="font-bold text-green-600">{maxOpenTrades ?? 'unavailable'}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Your maximum lot size per trade: <span className="font-bold text-green-600">{maxLotSize != null ? maxLotSize : 'unavailable'}</span>
                  </p>
                  {riskLimit != null && (
                    <p className="text-sm text-muted-foreground">
                      If the equity in your incubator account drops below{' '}
                      <span className="font-bold text-green-600">${riskLimit.toLocaleString()}</span>,
                      all trades will be closed. You will need to message an admin to re-enable trading.
                    </p>
                  )}
                  <div className="border-t pt-2 mt-2 space-y-1">
                    <p className="text-sm text-muted-foreground">
                      Account Balance: <span className="font-bold text-green-600">
                        {accountBalanceEquity?.balance != null ? formatCurrency(accountBalanceEquity.balance) : 'unavailable'}
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Account Equity: <span className="font-bold text-green-600">
                        {accountBalanceEquity?.equity != null ? formatCurrency(accountBalanceEquity.equity) : 'unavailable'}
                      </span>
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No copier linked to your account.</p>
              )}
            </CardContent>
          </Card>
        </div>

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

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>
              Manage your account settings and preferences
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="account" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="account">Account</TabsTrigger>
              <TabsTrigger value="payments">Payments</TabsTrigger>
            </TabsList>

            <TabsContent value="account" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Account Information</CardTitle>
                  <CardDescription>
                    Your trading account details
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm font-medium">Name</span>
                    <span className="text-sm">{session?.name || '—'}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm font-medium">Magic Number</span>
                    <span className="text-sm font-mono">{session?.magicNumber || '—'}</span>
                  </div>
                  <div className="py-2 space-y-2">
                    <div>
                      <Label htmlFor="telegramHandle" className="text-sm font-medium">Telegram Handle</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">Used to receive payment and important notifications via Telegram</p>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        id="telegramHandle"
                        placeholder="@yourusername"
                        value={telegramHandle}
                        onChange={(e) => setTelegramHandle(e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (!telegramHandle.trim()) return;
                          updateTelegramMutation.mutate(
                            { telegramHandle: telegramHandle.trim() },
                            {
                              onSuccess: () => {
                                toast.success("Telegram handle saved");
                                utils.trading.getSession.invalidate();
                              },
                              onError: (e) => toast.error(e.message),
                            }
                          );
                        }}
                        disabled={updateTelegramMutation.isPending || !telegramHandle.trim()}
                      >
                        {updateTelegramMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                    </div>
                    {session?.telegramHandle && (
                      <div className="flex items-center gap-2">
                        {session?.telegramConnected ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
                            <span className="h-2 w-2 rounded-full bg-green-500 inline-block"></span>
                            Connected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                            <span className="h-2 w-2 rounded-full bg-amber-500 inline-block"></span>
                            Not connected — send /start to @RFXTraderBot
                          </span>
                        )}
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        testTelegramMutation.mutate(undefined, {
                          onSuccess: () => toast.success("Test message sent! Check your Telegram."),
                          onError: (e) => toast.error(e.message),
                        });
                      }}
                      disabled={testTelegramMutation.isPending || !session?.telegramHandle || !session?.telegramConnected}
                    >
                      {testTelegramMutation.isPending ? "Sending..." : "Send Test Message"}
                    </Button>
                    {!session?.telegramHandle && (
                      <p className="text-xs text-muted-foreground">Save a handle first, then send /start to @RFXTraderBot in Telegram.</p>
                    )}
                    {session?.telegramHandle && !session?.telegramConnected && (
                      <p className="text-xs text-muted-foreground">Open Telegram, search <span className="font-mono">@RFXTraderBot</span> and send <span className="font-mono">/start</span> to activate notifications.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="payments" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">USDT Payment Details</CardTitle>
                  <CardDescription>
                    Configure your USDT wallet for receiving payments
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="usdtAddress">USDT Address</Label>
                      <Input
                        id="usdtAddress"
                        placeholder="Enter your USDT wallet address"
                        value={usdtAddress}
                        onChange={(e) => {
                          setUsdtAddress(e.target.value);
                          setUsdtAddressError(validateUsdtAddress(e.target.value, usdtNetwork));
                        }}
                        className={usdtAddressError ? "border-red-500 focus-visible:ring-red-500" : ""}
                      />
                      {usdtAddressError && (
                        <p className="text-xs text-red-500">{usdtAddressError}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="usdtNetwork">Network</Label>
                      <Select value={usdtNetwork} onValueChange={(value: "TRC20" | "ERC20") => {
                          setUsdtNetwork(value);
                          setUsdtAddressError(validateUsdtAddress(usdtAddress, value));
                        }}>
                        <SelectTrigger id="usdtNetwork">
                          <SelectValue placeholder="Select network" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TRC20">TRC20</SelectItem>
                          <SelectItem value="ERC20">ERC20</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={handleSaveUsdtInfo} disabled={updateUsdtMutation.isPending || !!usdtAddressError}>
                      {updateUsdtMutation.isPending ? "Saving..." : "Save USDT Information"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Payment Summary</CardTitle>
                  <CardDescription>
                    Your profit share and lifetime earnings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm font-medium">Profit Share Rate</span>
                    <span className="text-sm">{((session?.profitShare ?? 0.35) * 100).toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm font-medium">Lifetime Profit</span>
                    <span className="text-sm font-semibold">{formatCurrency(session?.lifetimeProfit ?? 0)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm font-medium">Lifetime Profit Share</span>
                    <span className="text-sm font-semibold">{formatCurrency(session?.lifetimeProfitShare ?? 0)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm font-medium">Lifetime Income</span>
                    <span className="text-sm font-semibold text-primary">{formatCurrency(session?.lifetimeIncome ?? 0)}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Payment History</CardTitle>
                  <CardDescription>
                    All payments received from RFX
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {paymentsLoading ? (
                    <div className="text-center py-8">
                      <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Loading payments...</p>
                    </div>
                   ) : paymentHistory && paymentHistory.length > 0 ? (
                    <div className="space-y-3">
                      {paymentHistory.map((payment) => (
                        <div key={payment.id} className="border rounded-lg p-4">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <div className="font-semibold text-primary">{formatCurrency(payment.amount)}</div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(payment.paymentDate).toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedPayment(payment);
                                setProofDialogOpen(true);
                              }}
                            >
                              <FileText className="h-4 w-4 mr-2" />
                              Show Transmission Proof
                            </Button>
                          </div>
                          <div className="text-xs text-muted-foreground mt-2">
                            <div className="font-mono break-all">TX: {payment.transactionHash}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <DollarSign className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No payment history available</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Transmission Proof Dialog */}
      <Dialog open={proofDialogOpen} onOpenChange={setProofDialogOpen}>
        <DialogContent className="max-w-md">
          {selectedPayment && (
            <div className="space-y-6">
              {/* Header with Network-Specific USDT Logo */}
              <div className="flex flex-col items-center pt-4">
                <img 
                  src={session?.usdtNetwork === 'TRC20' ? '/usdt-trc20.png' : '/usdt-erc20.png'}
                  alt={`USDT ${session?.usdtNetwork || 'Logo'}`}
                  className="w-16 h-16 mb-2"
                />
                <p className="text-sm font-medium text-muted-foreground mb-4">
                  {session?.usdtNetwork || 'USDT'}
                </p>
                <h2 className="text-2xl font-bold">Withdrawn {formatCurrency(selectedPayment.amount).replace('$', '')} USDT</h2>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between py-4 border-y">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <span className="font-medium">Status</span>
                </div>
                <span className="text-muted-foreground">Completed</span>
              </div>

              {/* Details */}
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <span className="text-sm font-medium">Address name</span>
                  <span className="text-sm text-right text-muted-foreground">{session?.name}</span>
                </div>

                <div className="flex justify-between items-start gap-4">
                  <span className="text-sm font-medium">Address</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-right text-muted-foreground font-mono break-all max-w-[200px]">
                      {session?.usdtAddress || 'Not provided'}
                    </span>
                    {session?.usdtAddress && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => {
                          navigator.clipboard.writeText(session.usdtAddress!);
                          setCopiedField('address');
                          setTimeout(() => setCopiedField(null), 2000);
                        }}
                      >
                        {copiedField === 'address' ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Network</span>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                    <span className="text-sm text-muted-foreground">
                      {session?.usdtNetwork === 'TRC20' ? 'Tron (TRC20)' : 
                       session?.usdtNetwork === 'ERC20' ? 'Ethereum (ERC20)' : 
                       'Not specified'}
                    </span>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Network fee</span>
                  <span className="text-sm text-muted-foreground">
                    {selectedPayment.networkFee ? `${parseFloat(selectedPayment.networkFee).toFixed(2)} USDT` : '0.00 USDT'}
                  </span>
                </div>

                <div className="flex justify-between items-start gap-4">
                  <span className="text-sm font-medium">Transaction ID</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-right text-muted-foreground font-mono break-all max-w-[200px]">
                      {selectedPayment.transactionHash}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => {
                          navigator.clipboard.writeText(selectedPayment.transactionHash);
                          setCopiedField('tx');
                          setTimeout(() => setCopiedField(null), 2000);
                        }}
                      >
                        {copiedField === 'tx' ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => {
                          const explorerUrl = session?.usdtNetwork === 'TRC20'
                            ? `https://tronscan.org/#/transaction/${selectedPayment.transactionHash}`
                            : `https://etherscan.io/tx/${selectedPayment.transactionHash}`;
                          window.open(explorerUrl, '_blank');
                        }}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Submitted time</span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(selectedPayment.paymentDate).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZoneName: 'short'
                    })}
                  </span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Footer with version info */}
      <div className="text-center py-4 text-xs text-muted-foreground">
        App version {__APP_VERSION__} · Build {__BUILD_HASH__}
      </div>
    </div>
  );
}
