import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useTradingSession } from "@/hooks/useTradingSession";
import { useLivePositions } from "@/hooks/useLivePositions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  TrendingUp, 
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

function formatPrice(price: number | undefined | null): string {
  if (price == null) return "—";
  if (Math.abs(price) >= 100) return price.toFixed(2);
  return price.toFixed(5);
}

function formatDateTime(dateString: string | undefined | null): string {
  if (!dateString) return "—";
  const d = new Date(dateString);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordChangeStep, setPasswordChangeStep] = useState<"form" | "2fa">("form");
  const [passwordChangeCode, setPasswordChangeCode] = useState("");

  // View-as-trader: use external prop (from AdminDashboard) or internal state
  const [internalViewAsTraderId, setViewAsTraderId] = useState<number | undefined>(undefined);
  const viewAsTraderId = externalViewAsTraderId ?? internalViewAsTraderId;
  const isViewingAsTrader = viewAsTraderId !== undefined;
  const viewAsInput = viewAsTraderId ? { viewAsTraderId } : undefined;

  // Master account filter for admin dashboard
  const [selectedMasterAccountId, setSelectedMasterAccountId] = useState<string | undefined>(undefined);

  // Fetch trader list for the admin dropdown and the magic→trader-name lookup
  // in aggregated position tables (needed in embedded mode too)
  const { data: allTraders } = trpc.admin.getAllTraders.useQuery(undefined, {
    enabled: !!selfSession?.isAdmin,
  });

  // Default admin to their own entry once allTraders loads
  useEffect(() => {
    if (selfSession?.isAdmin && allTraders && !externalViewAsTraderId && internalViewAsTraderId === undefined) {
      const adminEntry = allTraders.find((t) => t.id === selfSession.id);
      if (adminEntry) {
        setViewAsTraderId(adminEntry.id);
      }
    }
  }, [selfSession, allTraders, externalViewAsTraderId, internalViewAsTraderId]);

  // When viewing as another trader, fetch their session info
  const { data: viewedSession } = trpc.trading.getSession.useQuery(viewAsInput, {
    enabled: isViewingAsTrader,
  });

  // Use viewed trader's session when in view-as mode, otherwise self
  const session = isViewingAsTrader ? viewedSession : selfSession;
  const isViewedTraderAdmin = session?.isViewedTraderAdmin ?? false;

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
  const changePasswordMutation = trpc.trading.changePassword.useMutation({
    onSuccess: (data) => {
      if (data.requires2FA) {
        setPasswordChangeStep("2fa");
        toast.info("A verification code has been sent to your Telegram.");
        return;
      }
      toast.success("Password changed successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordChangeCode("");
      setPasswordChangeStep("form");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  const markNotificationReadMutation = trpc.trading.markNotificationRead.useMutation();
  const markAllReadMutation = trpc.trading.markAllNotificationsRead.useMutation();

  const unreadCount = notifications?.filter(n => !n.isRead).length || 0;

  const { data: pnlSummary, isLoading: pnlLoading } = trpc.trading.getPnLSummary.useQuery(viewAsInput, {
    refetchInterval: 60000,
  });

  // Build position query input — includes masterAccountId when admin selects a master
  const positionInput = viewAsTraderId || selectedMasterAccountId
    ? { viewAsTraderId, masterAccountId: selectedMasterAccountId }
    : undefined;

  const { data: openPositions, isLoading: positionsLoading } = trpc.trading.getOpenPositions.useQuery(positionInput, {
    refetchInterval: 30000,
  });

  // Phase 2: overlay live positions via SSE when enabled (own view only).
  // Additive — the 30s poll above remains the fallback.
  useLivePositions(positionInput, !isViewingAsTrader);

  const { data: copierInfo } = trpc.trading.getCopierInfo.useQuery(viewAsInput, {
    refetchInterval: 60000,
  });

  // Fetch master accounts when viewing an admin user
  const { data: masterAccounts } = trpc.admin.getRfxMasterAccounts.useQuery(undefined, {
    enabled: !!selfSession?.isAdmin,
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

  // Trade history — fetched when embedded OR when viewing an admin user
  const showTradeHistory = embedded || isViewedTraderAdmin;
  const { data: allTimePositions, isLoading: historyLoading } = trpc.trading.getAllTimePositions.useQuery(positionInput, {
    enabled: showTradeHistory,
    refetchInterval: 300000,
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

  const magicToTrader = useMemo(() => {
    const map = new Map<string, string>();
    if (allTraders) {
      for (const t of allTraders) {
        map.set(t.magicNumber, t.name);
      }
    }
    return map;
  }, [allTraders]);

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
                    onValueChange={(v) => {
                      setViewAsTraderId(v === "self" ? undefined : parseInt(v));
                      setSelectedMasterAccountId(undefined);
                    }}
                  >
                    <SelectTrigger className="w-[220px] h-8 text-sm">
                      <SelectValue placeholder="View as trader..." />
                    </SelectTrigger>
                    <SelectContent>
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
              {session?.showMyTradesUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    window.open(session.showMyTradesUrl!, "_blank", "noopener")
                  }
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  ShowMyTrades
                </Button>
              )}
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

          {isViewedTraderAdmin ? (
            <Card className="border-primary/20">
              <CardHeader>
                <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Activity className="h-4 w-4" />
                  <span>Master Account</span>
                </div>
              </CardHeader>
              <CardContent>
                <Select
                  value={selectedMasterAccountId ?? "all"}
                  onValueChange={(v) => setSelectedMasterAccountId(v === "all" ? undefined : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All accounts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All accounts</SelectItem>
                    {masterAccounts?.map((ma: any) => (
                      <SelectItem key={ma.id} value={ma.id}>
                        {ma.alias} ({ma.loginAccountNumber})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          ) : (
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
          )}
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
            {!embedded && (
              <Button variant="outline" size="sm" onClick={() => setLocation("/history")}>
                <Activity className="h-4 w-4 mr-2" />
                View History
              </Button>
            )}
          </div>

          {positionsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-6 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : openPositions && openPositions.length > 0 ? (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    {isViewedTraderAdmin && <TableHead>Magic</TableHead>}
                    {isViewedTraderAdmin && <TableHead>Trader</TableHead>}
                    <TableHead>Ticket</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                    <TableHead>Open Date</TableHead>
                    <TableHead className="text-right">Open Price</TableHead>
                    <TableHead className="text-right">TP</TableHead>
                    <TableHead className="text-right">SL</TableHead>
                    <TableHead className="text-right">P&L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openPositions.map((position) => {
                    const totalPnL = (position.profit ?? 0) + (position.swap ?? 0) + (position.commission ?? 0);
                    const isPositive = totalPnL >= 0;
                    return (
                      <TableRow key={position.id}>
                        {isViewedTraderAdmin && (
                          <TableCell className="font-mono text-xs">{position.magicNumber}</TableCell>
                        )}
                        {isViewedTraderAdmin && (
                          <TableCell className="text-xs">{magicToTrader.get(position.magicNumber) ?? "—"}</TableCell>
                        )}
                        <TableCell className="font-mono text-xs text-muted-foreground">{position.id}</TableCell>
                        <TableCell className="font-semibold">{position.symbol}</TableCell>
                        <TableCell>
                          <Badge variant={position.type === "BUY" ? "default" : "destructive"} className="text-xs">
                            {position.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{position.volume}</TableCell>
                        <TableCell className="text-xs">{formatDateTime(position.openTime)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatPrice(position.openPrice)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {position.takeProfit ? formatPrice(position.takeProfit) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {position.stopLoss ? formatPrice(position.stopLoss) : "—"}
                        </TableCell>
                        <TableCell className={`text-right font-bold ${isPositive ? "text-green-600" : "text-destructive"}`}>
                          {formatCurrency(totalPnL, true)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
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
        {/* Trade History — shown when embedded or viewing admin dashboard */}
        {showTradeHistory && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Trade History</h2>
            {historyLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <Skeleton className="h-6 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : allTimePositions && allTimePositions.length > 0 ? (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      {isViewedTraderAdmin && <TableHead>Magic</TableHead>}
                      {isViewedTraderAdmin && <TableHead>Trader</TableHead>}
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
                    {allTimePositions.map((position: any, index: number) => {
                      const totalPnL = (position.profit ?? 0) + (position.swap ?? 0) + (position.commission ?? 0);
                      const isPositive = totalPnL >= 0;
                      const tpHit = wasTPHit(position);
                      const slHit = wasSLHit(position);
                      return (
                        <TableRow key={position.id ?? index}>
                          {isViewedTraderAdmin && (
                            <TableCell className="font-mono text-xs">{position.magicNumber}</TableCell>
                          )}
                          {isViewedTraderAdmin && (
                            <TableCell className="text-xs">{magicToTrader.get(position.magicNumber) ?? "—"}</TableCell>
                          )}
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
                          <TableCell className={`text-right font-bold ${isPositive ? "text-green-600" : "text-destructive"}`}>
                            {formatCurrency(totalPnL, true)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                  <h3 className="font-semibold mb-2">No Trade History</h3>
                  <p className="text-sm text-muted-foreground">
                    No closed positions found for this trader.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
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
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="account">Account</TabsTrigger>
              <TabsTrigger value="payments">Payments</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
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

            <TabsContent value="security" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Change Password</CardTitle>
                  <CardDescription>
                    Update your account password
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {passwordChangeStep === "form" ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="currentPassword">Current Password</Label>
                        <Input
                          id="currentPassword"
                          type="password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="Enter current password"
                          disabled={changePasswordMutation.isPending}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="newPassword">New Password</Label>
                        <Input
                          id="newPassword"
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="At least 6 characters"
                          disabled={changePasswordMutation.isPending}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirmNewPassword">Confirm New Password</Label>
                        <Input
                          id="confirmNewPassword"
                          type="password"
                          value={confirmNewPassword}
                          onChange={(e) => setConfirmNewPassword(e.target.value)}
                          placeholder="Confirm new password"
                          disabled={changePasswordMutation.isPending}
                        />
                      </div>
                      {newPassword && confirmNewPassword && newPassword !== confirmNewPassword && (
                        <p className="text-xs text-red-500">Passwords do not match</p>
                      )}
                      <Button
                        className="w-full"
                        onClick={() => {
                          if (newPassword !== confirmNewPassword) {
                            toast.error("Passwords do not match");
                            return;
                          }
                          if (newPassword.length < 6) {
                            toast.error("Password must be at least 6 characters");
                            return;
                          }
                          changePasswordMutation.mutate({
                            currentPassword,
                            newPassword,
                          });
                        }}
                        disabled={
                          changePasswordMutation.isPending ||
                          !currentPassword ||
                          !newPassword ||
                          !confirmNewPassword ||
                          newPassword !== confirmNewPassword
                        }
                      >
                        {changePasswordMutation.isPending ? "Changing..." : "Change Password"}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        A verification code has been sent to your Telegram. Enter it below to confirm the password change.
                      </p>
                      <div className="space-y-2">
                        <Label htmlFor="passwordChangeCode">Verification Code</Label>
                        <Input
                          id="passwordChangeCode"
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={passwordChangeCode}
                          onChange={(e) => setPasswordChangeCode(e.target.value.replace(/\D/g, ""))}
                          placeholder="Enter 6-digit code"
                          disabled={changePasswordMutation.isPending}
                          autoFocus
                          className="text-center text-2xl tracking-widest font-mono"
                        />
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => {
                          changePasswordMutation.mutate({
                            currentPassword,
                            newPassword,
                            twoFactorCode: passwordChangeCode,
                          });
                        }}
                        disabled={changePasswordMutation.isPending || passwordChangeCode.length !== 6}
                      >
                        {changePasswordMutation.isPending ? "Verifying..." : "Verify & Change Password"}
                      </Button>
                      <button
                        type="button"
                        className="w-full text-sm text-muted-foreground hover:text-primary"
                        onClick={() => {
                          setPasswordChangeStep("form");
                          setPasswordChangeCode("");
                        }}
                      >
                        Cancel
                      </button>
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
