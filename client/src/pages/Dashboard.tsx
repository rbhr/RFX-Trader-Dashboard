import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useTradingSession } from "@/hooks/useTradingSession";
import { useLivePositions } from "@/hooks/useLivePositions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PaginationBar, paginate, type PageSize } from "@/components/Pagination";
import { TransmissionProofDialog, type ProofPayment } from "@/components/TransmissionProofDialog";
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
  ExternalLink,
  CreditCard
} from "lucide-react";
import { toast } from "sonner";
import { useLanguage, Trans, Ltr } from "@/contexts/LanguageContext";
import { LanguageSelector } from "@/components/LanguageSelector";
import { isTranslationKey, localizeMissingParts } from "@shared/i18n";
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
          <Ltr>{formatCurrency(value, true)}</Ltr>
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
  const { t, tError, lang } = useLanguage();

  // System notifications carry their translation key and params, so they read
  // in the current language; admin-typed ones (no key) show as written.
  const notificationText = (
    n: { title: string; message: string; i18nKey: string | null; i18nParams: string | null },
    field: "title" | "message"
  ): string => {
    const key = n.i18nKey ? `notifications.${n.i18nKey}.${field}` : "";
    if (!isTranslationKey(key)) return n[field];
    let params: Record<string, string | number> = {};
    try {
      params = JSON.parse(n.i18nParams ?? "{}");
    } catch {
      return n[field];
    }
    if (typeof params.missing === "string") {
      params.missing = localizeMissingParts(lang, params.missing);
    }
    return t(key, params);
  };
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
        return t("settings.trc20Invalid");
    } else if (network === "ERC20") {
      if (address.length !== 42 || !address.startsWith("0x"))
        return t("settings.erc20Invalid");
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
        toast.info(t("common.codeSentToTelegram"));
        return;
      }
      toast.success(t("settings.passwordChanged"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordChangeCode("");
      setPasswordChangeStep("form");
    },
    onError: (error) => {
      toast.error(tError(error.message));
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

  // Phase 2: overlay live positions via SSE — own dashboard, admin overview,
  // admin view-as, and admin master-account selection all stream. Additive —
  // the 30s poll above remains the fallback.
  useLivePositions(positionInput, viewAsInput, !!selfSession);

  // Realtime floating P&L derived from the (now live) open positions, so the
  // Floating and Today's-Total figures move with the market instead of waiting
  // for the 60s pnlSummary poll. Realized comes from pnlSummary (changes only
  // when a position closes). Skipped when a specific master is selected, since
  // pnlSummary then covers a different view than the positions list.
  const liveFloating = useMemo(() => {
    if (selectedMasterAccountId || !openPositions) return null;
    return openPositions.reduce(
      (sum, p) => sum + (p.profit ?? 0) + (p.swap ?? 0) + (p.commission ?? 0),
      0
    );
  }, [openPositions, selectedMasterAccountId]);

  const displayFloating = liveFloating ?? pnlSummary?.floatingPnL ?? 0;
  const displayTodayTotal = (pnlSummary?.todayRealizedPnL ?? 0) + displayFloating;

  // Week/Month/All-time = their realized component + live floating (same idea
  // as Today). When live floating isn't available (positions not loaded, or a
  // master is selected), fall back to the server's pre-combined values.
  const displayWeek =
    liveFloating != null
      ? (pnlSummary?.weekRealizedPnL ?? 0) + liveFloating
      : pnlSummary?.weekPnL ?? 0;
  const displayMonth =
    liveFloating != null
      ? (pnlSummary?.monthRealizedPnL ?? 0) + liveFloating
      : pnlSummary?.monthPnL ?? 0;
  const displayAllTime =
    liveFloating != null
      ? (pnlSummary?.allTimeRealizedPnL ?? 0) + liveFloating
      : pnlSummary?.allTimePnL ?? 0;
  // Profit share accrues only above the high-water mark (profit already paid
  // on), the same way the payout run works it out — so a winning week that has
  // not yet recovered earlier losses shows $0. Tracks live floating P&L.
  const displayProfitShare =
    liveFloating != null && pnlSummary?.profitShareBaseline != null
      ? Math.max(0, displayAllTime - pnlSummary.profitShareBaseline) *
        (pnlSummary.profitSharePercent ?? 0)
      : pnlSummary?.weeklyProfitShare ?? 0;
  // The cycle comes from the session, not the P&L summary: the summary is slow
  // and absent while loading or after a failed fetch, which left the title on
  // its "Profit Share" fallback.
  const payoutCycle = session?.payoutCycle ?? pnlSummary?.payoutCycle;
  const profitShareTitle =
    payoutCycle === "Weekly"
      ? t("dashboard.weeklyProfitShare")
      : payoutCycle === "Fortnightly"
        ? t("dashboard.fortnightlyProfitShare")
        : t("dashboard.profitShare");

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

  const { data: dailyLossLimit } = trpc.trading.getDailyLossLimit.useQuery(viewAsInput, {
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

  // Pagination for the embedded trade-history + payments tables.
  const [histPageSize, setHistPageSize] = useState<PageSize>(10);
  const [histPage, setHistPage] = useState(0);
  const [payPageSize, setPayPageSize] = useState<PageSize>(10);
  const [payPage, setPayPage] = useState(0);
  const [proofPayment, setProofPayment] = useState<ProofPayment | null>(null);

  const sortedHistory = useMemo(
    () =>
      [...((allTimePositions as any[]) ?? [])]
        .filter((p) => p.closeTime)
        .sort(
          (a, b) =>
            new Date(b.closeTime).getTime() - new Date(a.closeTime).getTime()
        ),
    [allTimePositions]
  );
  const sortedPayments = useMemo(
    () =>
      [...(paymentHistory ?? [])].sort(
        (a, b) =>
          new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()
      ),
    [paymentHistory]
  );
  const histPaged = paginate(sortedHistory, histPageSize, histPage);
  const paysPaged = paginate(sortedPayments, payPageSize, payPage);

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
                t("dashboard.breachToast", {
                  equity: `$${accountEquity.toFixed(2)}`,
                  riskLimit: `$${riskLimit.toFixed(2)}`,
                }),
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
      toast.success(t("dashboard.dataRefreshed"));
    } catch (error) {
      toast.error(t("dashboard.refreshFailed"));
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
      toast.success(t("settings.usdtUpdated"));
    } catch (error) {
      toast.error(t("settings.usdtUpdateFailed"));
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
          <p className="text-muted-foreground">{t("dashboard.loading")}</p>
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
                <h1 className="text-xl font-bold">{t("common.appName")}</h1>
                <p className="text-sm text-muted-foreground">
                  {session?.name} • <Ltr>Magic #{session?.magicNumber}</Ltr>
                </p>
              </div>
              {/* Admin trader picker */}
              {selfSession?.isAdmin && allTraders && (
                <div className="ms-4">
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
              <LanguageSelector />
              {session?.showMyTradesUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    window.open(session.showMyTradesUrl!, "_blank", "noopener")
                  }
                >
                  <ExternalLink className="h-4 w-4 me-1" />
                  ShowMyTrades
                </Button>
              )}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="relative">
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                      <Badge className="absolute -top-1 -end-1 h-5 w-5 flex items-center justify-center p-0 text-xs">
                        {unreadCount}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="end">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold">{t("dashboard.notifications")}</h4>
                      {unreadCount > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            await markAllReadMutation.mutateAsync();
                            refetchNotifications();
                          }}
                        >
                          <Check className="h-4 w-4 me-1" />
                          {t("dashboard.markAllRead")}
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
                                <div className="font-medium text-sm" dir="auto">{notificationText(notif, "title")}</div>
                                <div className="text-xs text-muted-foreground mt-1" dir="auto">{notificationText(notif, "message")}</div>
                                <div className="text-xs text-muted-foreground mt-2">
                                  <Ltr>{new Date(notif.createdAt).toLocaleString("en-US")}</Ltr>
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
                          <p className="text-sm">{t("dashboard.noNotifications")}</p>
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
                <RefreshCw className={`h-4 w-4 me-2 ${isRefreshing ? "animate-spin" : ""}`} />
                {t("common.refresh")}
              </Button>
              {!isViewingAsTrader && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSettingsOpen(true)}
                >
                  <Settings className="h-4 w-4 me-2" />
                  {t("dashboard.settings")}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 me-2 rtl:rotate-180" />
                {t("dashboard.logout")}
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
                <span>{t("dashboard.todayTotalPnl")}</span>
              </div>
            </CardHeader>
            <CardContent>
              {pnlLoading ? (
                <Skeleton className="h-12 w-48" />
              ) : (
                <>
                  <div className={`text-4xl font-bold mb-4 ${
                    displayTodayTotal >= 0 ? "text-primary" : "text-destructive"
                  }`}>
                    <Ltr>{formatCurrency(displayTodayTotal, true)}</Ltr>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div>
                      <span className="text-muted-foreground">{t("dashboard.realized")} </span>
                      <span className="font-semibold">
                        <Ltr>{formatCurrency(pnlSummary?.todayRealizedPnL ?? 0, true)}</Ltr>
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("dashboard.floating")} </span>
                      <span className="font-semibold">
                        <Ltr>{formatCurrency(displayFloating, true)}</Ltr>
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
                  <span>{t("dashboard.configTitle")}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {copierInfo ? (
                  <>
                    {copierInfo.notCopiedReason ? (
                      <div className="space-y-1">
                        <p className="text-base font-bold text-red-600">
                          {copierInfo.notCopiedReason === "news"
                            ? t("dashboard.notCopiedNews")
                            : t("dashboard.notCopiedAdmin")}
                        </p>
                        <p className="text-sm text-red-600">
                          {t("dashboard.notCountedWarning")}
                        </p>
                        {copierInfo.newsBlock && (
                          <p className="text-sm text-muted-foreground">
                            <Trans
                              k="dashboard.newsDetail"
                              values={{
                                symbols: <Ltr>{copierInfo.newsBlock.symbols.join(", ")}</Ltr>,
                                // Event titles come from the calendar in English.
                                title: <Ltr>{copierInfo.newsBlock.title}</Ltr>,
                                time: (
                                  <Ltr>
                                    {new Date(copierInfo.newsBlock.untilUtc).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                                  </Ltr>
                                ),
                              }}
                            />
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {copierInfo.scaleType === 3 ? (
                          <Trans
                            k="dashboard.copiedFixedLots"
                            values={{
                              lots: <Ltr className="font-bold text-green-600">{copierInfo.fixedLotSize} lots</Ltr>,
                            }}
                          />
                        ) : (
                          <Trans
                            k="dashboard.copiedMultiplied"
                            values={{
                              multiplier: <Ltr className="font-bold text-green-600">{copierInfo.multiplier}x</Ltr>,
                            }}
                          />
                        )}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      <Trans
                        k="dashboard.maxTrades"
                        values={{
                          value: <Ltr className="font-bold text-green-600">{maxOpenTrades == null ? t("common.unavailable") : maxOpenTrades === 0 ? t("common.noLimit") : maxOpenTrades}</Ltr>,
                        }}
                      />
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <Trans
                        k="dashboard.maxLots"
                        values={{
                          value: <Ltr className="font-bold text-green-600">{maxLotSize == null ? t("common.unavailable") : maxLotSize === 0 ? t("common.noLimit") : maxLotSize}</Ltr>,
                        }}
                      />
                    </p>
                    {dailyLossLimit && (
                      <p className="text-sm text-muted-foreground">
                        <Trans
                          k="dashboard.dailyLoss"
                          values={{
                            amount: <Ltr className="font-bold text-red-600">{formatCurrency(dailyLossLimit.maxLossAmount)}</Ltr>,
                            equity: <Ltr className="font-bold text-red-600">{formatCurrency(dailyLossLimit.breachEquity)}</Ltr>,
                          }}
                        />
                      </p>
                    )}
                    {riskLimit != null && (
                      <p className="text-sm text-muted-foreground">
                        <Trans
                          k="dashboard.riskLimit"
                          values={{
                            amount: <Ltr className="font-bold text-green-600">${riskLimit.toLocaleString("en-US")}</Ltr>,
                          }}
                        />
                      </p>
                    )}
                    <div className="border-t pt-2 mt-2 space-y-1">
                      <p className="text-sm text-muted-foreground">
                        <Trans
                          k="dashboard.accountBalance"
                          values={{
                            value: (
                              <Ltr className="font-bold text-green-600">
                                {accountBalanceEquity?.balance != null ? formatCurrency(accountBalanceEquity.balance) : t("common.unavailable")}
                              </Ltr>
                            ),
                          }}
                        />
                      </p>
                      <p className="text-sm text-muted-foreground">
                        <Trans
                          k="dashboard.accountEquity"
                          values={{
                            value: (
                              <Ltr className="font-bold text-green-600">
                                {accountBalanceEquity?.equity != null ? formatCurrency(accountBalanceEquity.equity) : t("common.unavailable")}
                              </Ltr>
                            ),
                          }}
                        />
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("dashboard.noCopier")}</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* P&L Summary Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <PnLCard
            title={t("dashboard.thisWeek")}
            value={displayWeek}
            subtitle={t("dashboard.thisWeekSub")}
            icon={Calendar}
            isLoading={pnlLoading}
          />
          <PnLCard
            title={t("dashboard.thisMonth")}
            value={displayMonth}
            subtitle={t("dashboard.thisMonthSub")}
            icon={Calendar}
            isLoading={pnlLoading}
          />
          <PnLCard
            title={t("dashboard.allTime")}
            value={displayAllTime}
            subtitle={t("dashboard.allTimeSub")}
            icon={TrendingUp}
            isLoading={pnlLoading}
          />
          <PnLCard
            title={profitShareTitle}
            value={displayProfitShare}
            subtitle={t("dashboard.profitShareSub", {
              percent: ((pnlSummary?.profitSharePercent ?? 0) * 100).toFixed(0),
            })}
            icon={Percent}
            isLoading={pnlLoading}
          />
        </div>

        {/* Open Positions */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold">{t("dashboard.openPositions")}</h2>
              <p className="text-sm text-muted-foreground">
                {positionsLoading
                  ? t("common.loading")
                  : t("dashboard.activePositions", { count: openPositions?.length ?? 0 })}
              </p>

            </div>
            {!embedded && (
              <Button variant="outline" size="sm" onClick={() => setLocation("/history")}>
                <Activity className="h-4 w-4 me-2" />
                {t("dashboard.viewHistory")}
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
                    <TableHead>{t("table.ticket")}</TableHead>
                    <TableHead>{t("table.symbol")}</TableHead>
                    <TableHead>{t("table.type")}</TableHead>
                    <TableHead className="text-end">{t("table.volume")}</TableHead>
                    <TableHead>{t("table.openDate")}</TableHead>
                    <TableHead className="text-end">{t("table.openPrice")}</TableHead>
                    <TableHead className="text-end">{t("table.tp")}</TableHead>
                    <TableHead className="text-end">{t("table.sl")}</TableHead>
                    <TableHead className="text-end">{t("table.pnl")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openPositions.map((position) => {
                    const totalPnL = (position.profit ?? 0) + (position.swap ?? 0) + (position.commission ?? 0);
                    const isPositive = totalPnL >= 0;
                    return (
                      <TableRow key={position.id}>
                        {isViewedTraderAdmin && (
                          <TableCell className="font-mono text-xs"><Ltr>{position.magicNumber}</Ltr></TableCell>
                        )}
                        {isViewedTraderAdmin && (
                          <TableCell className="text-xs">{magicToTrader.get(position.magicNumber) ?? "—"}</TableCell>
                        )}
                        <TableCell className="font-mono text-xs text-muted-foreground"><Ltr>{position.id}</Ltr></TableCell>
                        <TableCell className="font-semibold"><Ltr>{position.symbol}</Ltr></TableCell>
                        <TableCell>
                          <Badge className={`text-xs border-transparent text-white ${position.type === "BUY" ? "bg-blue-600" : "bg-red-600"}`}>
                            {position.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-end"><Ltr>{position.volume}</Ltr></TableCell>
                        <TableCell className="text-xs"><Ltr>{formatDateTime(position.openTime)}</Ltr></TableCell>
                        <TableCell className="text-end font-mono text-xs"><Ltr>{formatPrice(position.openPrice)}</Ltr></TableCell>
                        <TableCell className="text-end font-mono text-xs">
                          <Ltr>{position.takeProfit ? formatPrice(position.takeProfit) : "—"}</Ltr>
                        </TableCell>
                        <TableCell className="text-end font-mono text-xs">
                          <Ltr>{position.stopLoss ? formatPrice(position.stopLoss) : "—"}</Ltr>
                        </TableCell>
                        <TableCell className={`text-end font-bold ${isPositive ? "text-green-600" : "text-destructive"}`}>
                          <Ltr>{formatCurrency(totalPnL, true)}</Ltr>
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
                <h3 className="font-semibold mb-2">{t("dashboard.noOpenPositions")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("dashboard.noOpenPositionsBody")}
                </p>
              </CardContent>
            </Card>
          )}
        {/* Trade History — shown when embedded or viewing admin dashboard */}
        {showTradeHistory && (
          <div>
            <h2 className="text-2xl font-bold mb-4">{t("dashboard.tradeHistory")}</h2>
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
            ) : sortedHistory.length > 0 ? (
              <>
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      {isViewedTraderAdmin && <TableHead>Magic</TableHead>}
                      {isViewedTraderAdmin && <TableHead>Trader</TableHead>}
                      <TableHead>{t("table.ticket")}</TableHead>
                      <TableHead>{t("table.symbol")}</TableHead>
                      <TableHead>{t("table.type")}</TableHead>
                      <TableHead className="text-end">{t("table.volume")}</TableHead>
                      <TableHead>{t("table.openDate")}</TableHead>
                      <TableHead>{t("table.closeDate")}</TableHead>
                      <TableHead className="text-end">{t("table.openPrice")}</TableHead>
                      <TableHead className="text-end">{t("table.closePrice")}</TableHead>
                      <TableHead className="text-end">{t("table.tp")}</TableHead>
                      <TableHead className="text-end">{t("table.sl")}</TableHead>
                      <TableHead className="text-end">{t("table.pnl")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {histPaged.slice.map((position: any, index: number) => {
                      const totalPnL = (position.profit ?? 0) + (position.swap ?? 0) + (position.commission ?? 0);
                      const isPositive = totalPnL >= 0;
                      const tpHit = wasTPHit(position);
                      const slHit = wasSLHit(position);
                      return (
                        <TableRow key={position.id ?? index}>
                          {isViewedTraderAdmin && (
                            <TableCell className="font-mono text-xs"><Ltr>{position.magicNumber}</Ltr></TableCell>
                          )}
                          {isViewedTraderAdmin && (
                            <TableCell className="text-xs">{magicToTrader.get(position.magicNumber) ?? "—"}</TableCell>
                          )}
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
                          <TableCell className={`text-end font-bold ${isPositive ? "text-green-600" : "text-destructive"}`}>
                            <Ltr>{formatCurrency(totalPnL, true)}</Ltr>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
              <PaginationBar
                total={histPaged.total}
                pageSize={histPageSize}
                setPageSize={setHistPageSize}
                page={histPage}
                setPage={setHistPage}
              />
              </>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                  <h3 className="font-semibold mb-2">{t("dashboard.noTradeHistory")}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t("dashboard.noTradeHistoryBody")}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Payments — shown alongside trade history (embedded / admin view) */}
        {showTradeHistory && (
          <div>
            <h2 className="text-2xl font-bold mb-4">{t("dashboard.payments")}</h2>
            {paymentsLoading ? (
              <Card>
                <CardContent className="p-4">
                  <Skeleton className="h-6 w-full" />
                </CardContent>
              </Card>
            ) : paysPaged.total > 0 ? (
              <>
                <Card>
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
                      {paysPaged.slice.map((p: any) => (
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
                            {p.transactionHash && !String(p.transactionHash).startsWith("PENDING-") ? (
                              <a
                                href={p.network === "ERC20"
                                  ? `https://etherscan.io/tx/${p.transactionHash}`
                                  : `https://tronscan.org/#/transaction/${p.transactionHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                dir="ltr"
                                className="inline-flex items-center gap-1 text-xs font-mono text-primary hover:underline"
                              >
                                {String(p.transactionHash).slice(0, 8)}…{String(p.transactionHash).slice(-6)}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className="text-muted-foreground text-xs">{t("common.pending")}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-end">
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setProofPayment(p)}>
                              {t("common.showTransmissionProof")}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
                <PaginationBar
                  total={paysPaged.total}
                  pageSize={payPageSize}
                  setPageSize={setPayPageSize}
                  page={payPage}
                  setPage={setPayPage}
                />
              </>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <CreditCard className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                  <h3 className="font-semibold mb-2">{t("dashboard.noPayments")}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t("dashboard.noPaymentsBody")}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        </div>
      </div>

      {/* Transmission Proof Dialog */}
      <TransmissionProofDialog
        payment={proofPayment}
        open={!!proofPayment}
        onOpenChange={(o) => !o && setProofPayment(null)}
      />

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("settings.title")}</DialogTitle>
            <DialogDescription>
              {t("settings.description")}
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="account" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="account">{t("settings.tabAccount")}</TabsTrigger>
              <TabsTrigger value="payments">{t("settings.tabPayments")}</TabsTrigger>
              <TabsTrigger value="security">{t("settings.tabSecurity")}</TabsTrigger>
            </TabsList>

            <TabsContent value="account" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t("settings.accountInfo")}</CardTitle>
                  <CardDescription>
                    {t("settings.accountInfoDesc")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm font-medium">{t("settings.name")}</span>
                    <span className="text-sm">{session?.name || '—'}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm font-medium">{t("common.magicNumber")}</span>
                    <span className="text-sm font-mono"><Ltr>{session?.magicNumber || '—'}</Ltr></span>
                  </div>
                  <div className="py-2 space-y-2">
                    <div>
                      <Label htmlFor="telegramHandle" className="text-sm font-medium">{t("settings.telegramHandle")}</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">{t("settings.telegramHandleHelp")}</p>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        id="telegramHandle"
                        dir="ltr"
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
                                toast.success(t("settings.telegramSaved"));
                                utils.trading.getSession.invalidate();
                              },
                              onError: (e) => toast.error(tError(e.message)),
                            }
                          );
                        }}
                        disabled={updateTelegramMutation.isPending || !telegramHandle.trim()}
                      >
                        {updateTelegramMutation.isPending ? t("common.saving") : t("common.save")}
                      </Button>
                    </div>
                    {session?.telegramHandle && (
                      <div className="flex items-center gap-2">
                        {session?.telegramConnected ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
                            <span className="h-2 w-2 rounded-full bg-green-500 inline-block"></span>
                            {t("settings.connected")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                            <span className="h-2 w-2 rounded-full bg-amber-500 inline-block"></span>
                            {t("settings.notConnected")}
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
                          onSuccess: () => toast.success(t("settings.testSent")),
                          onError: (e) => toast.error(tError(e.message)),
                        });
                      }}
                      disabled={testTelegramMutation.isPending || !session?.telegramHandle || !session?.telegramConnected}
                    >
                      {testTelegramMutation.isPending ? t("common.sending") : t("settings.sendTestMessage")}
                    </Button>
                    {!session?.telegramHandle && (
                      <p className="text-xs text-muted-foreground">{t("settings.saveHandleFirst")}</p>
                    )}
                    {session?.telegramHandle && !session?.telegramConnected && (
                      <p className="text-xs text-muted-foreground">
                        <Trans
                          k="settings.openTelegramHint"
                          values={{
                            bot: <Ltr className="font-mono">@RFXTraderBot</Ltr>,
                            command: <Ltr className="font-mono">/start</Ltr>,
                          }}
                        />
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="payments" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t("settings.usdtTitle")}</CardTitle>
                  <CardDescription>
                    {t("settings.usdtDesc")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="usdtAddress">{t("settings.usdtAddress")}</Label>
                      <Input
                        id="usdtAddress"
                        dir="ltr"
                        placeholder={t("settings.usdtAddressPlaceholder")}
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
                      <Label htmlFor="usdtNetwork">{t("settings.network")}</Label>
                      <Select value={usdtNetwork} onValueChange={(value: "TRC20" | "ERC20") => {
                          setUsdtNetwork(value);
                          setUsdtAddressError(validateUsdtAddress(usdtAddress, value));
                        }}>
                        <SelectTrigger id="usdtNetwork">
                          <SelectValue placeholder={t("settings.selectNetwork")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TRC20">TRC20</SelectItem>
                          <SelectItem value="ERC20">ERC20</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={handleSaveUsdtInfo} disabled={updateUsdtMutation.isPending || !!usdtAddressError}>
                      {updateUsdtMutation.isPending ? t("common.saving") : t("settings.saveUsdt")}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t("settings.summaryTitle")}</CardTitle>
                  <CardDescription>
                    {t("settings.summaryDesc")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm font-medium">{t("settings.profitShareRate")}</span>
                    <span className="text-sm"><Ltr>{((session?.profitShare ?? 0.35) * 100).toFixed(2)}%</Ltr></span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm font-medium">{t("settings.lifetimeProfit")}</span>
                    <span className="text-sm font-semibold"><Ltr>{formatCurrency(session?.lifetimeProfit ?? 0)}</Ltr></span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm font-medium">{t("settings.lifetimeProfitShare")}</span>
                    <span className="text-sm font-semibold"><Ltr>{formatCurrency(session?.lifetimeProfitShare ?? 0)}</Ltr></span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm font-medium">{t("settings.lifetimeIncome")}</span>
                    <span className="text-sm font-semibold text-primary"><Ltr>{formatCurrency(session?.lifetimeIncome ?? 0)}</Ltr></span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t("settings.paymentHistory")}</CardTitle>
                  <CardDescription>
                    {t("settings.paymentHistoryDesc")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {paymentsLoading ? (
                    <div className="text-center py-8">
                      <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">{t("settings.loadingPayments")}</p>
                    </div>
                   ) : paymentHistory && paymentHistory.length > 0 ? (
                    <div className="space-y-3">
                      {paymentHistory.map((payment) => (
                        <div key={payment.id} className="border rounded-lg p-4">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <div className="font-semibold text-primary"><Ltr>{formatCurrency(payment.amount)}</Ltr></div>
                              <div className="text-xs text-muted-foreground" dir="ltr">
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
                              <FileText className="h-4 w-4 me-2" />
                              {t("common.showTransmissionProof")}
                            </Button>
                          </div>
                          <div className="text-xs text-muted-foreground mt-2">
                            <div className="font-mono break-all" dir="ltr">TX: {payment.transactionHash}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <DollarSign className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">{t("settings.noPaymentHistory")}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="security" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t("settings.changePassword")}</CardTitle>
                  <CardDescription>
                    {t("settings.changePasswordDesc")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {passwordChangeStep === "form" ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="currentPassword">{t("settings.currentPassword")}</Label>
                        <Input
                          id="currentPassword"
                          type="password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder={t("settings.currentPasswordPlaceholder")}
                          disabled={changePasswordMutation.isPending}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="newPassword">{t("settings.newPassword")}</Label>
                        <Input
                          id="newPassword"
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder={t("common.atLeastSixCharacters")}
                          disabled={changePasswordMutation.isPending}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirmNewPassword">{t("settings.confirmNewPassword")}</Label>
                        <Input
                          id="confirmNewPassword"
                          type="password"
                          value={confirmNewPassword}
                          onChange={(e) => setConfirmNewPassword(e.target.value)}
                          placeholder={t("settings.confirmNewPasswordPlaceholder")}
                          disabled={changePasswordMutation.isPending}
                        />
                      </div>
                      {newPassword && confirmNewPassword && newPassword !== confirmNewPassword && (
                        <p className="text-xs text-red-500">{t("common.passwordsDoNotMatch")}</p>
                      )}
                      <Button
                        className="w-full"
                        onClick={() => {
                          if (newPassword !== confirmNewPassword) {
                            toast.error(t("common.passwordsDoNotMatch"));
                            return;
                          }
                          if (newPassword.length < 6) {
                            toast.error(t("common.passwordTooShort"));
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
                        {changePasswordMutation.isPending ? t("settings.changing") : t("settings.changePassword")}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        {t("settings.codeSentEnterBelow")}
                      </p>
                      <div className="space-y-2">
                        <Label htmlFor="passwordChangeCode">{t("common.verificationCode")}</Label>
                        <Input
                          id="passwordChangeCode"
                          type="text"
                          inputMode="numeric"
                          dir="ltr"
                          maxLength={6}
                          value={passwordChangeCode}
                          onChange={(e) => setPasswordChangeCode(e.target.value.replace(/\D/g, ""))}
                          placeholder={t("common.enterSixDigitCode")}
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
                        {changePasswordMutation.isPending ? t("common.verifying") : t("settings.verifyAndChange")}
                      </Button>
                      <button
                        type="button"
                        className="w-full text-sm text-muted-foreground hover:text-primary"
                        onClick={() => {
                          setPasswordChangeStep("form");
                          setPasswordChangeCode("");
                        }}
                      >
                        {t("common.cancel")}
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
      {/* Payment proofs are English-only by decision, so pin this one left-to-right. */}
      <Dialog open={proofDialogOpen} onOpenChange={setProofDialogOpen}>
        <DialogContent dir="ltr" lang="en" className="max-w-md">
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
                  <span className="text-sm text-end text-muted-foreground">{session?.name}</span>
                </div>

                <div className="flex justify-between items-start gap-4">
                  <span className="text-sm font-medium">Address</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-end text-muted-foreground font-mono break-all max-w-[200px]">
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
                    <span className="text-sm text-end text-muted-foreground font-mono break-all max-w-[200px]">
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
        <Trans
          k="dashboard.footer"
          values={{
            version: <Ltr>{__APP_VERSION__}</Ltr>,
            build: <Ltr>{__BUILD_HASH__}</Ltr>,
          }}
        />
      </div>
    </div>
  );
}
