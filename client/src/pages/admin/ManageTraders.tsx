import { useState, useEffect, useMemo } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Pencil,
  Trash2,
  Plus,
  CheckCircle2,
  XCircle,
  Loader2,
  Users,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Columns3,
  Megaphone,
  Send,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface Trader {
  id: number;
  magicNumber: string;
  name: string;
  profitShare: number;
  isActive: boolean;
  isAdmin: boolean;
  mtAccount: string | null;
  mtServer: string | null;
  mtPassword: string | null;
  mtVersion: string | null;
  mcLocation: string | null;
  mcAccountId: string | null;
  liveAccountNumber: string | null;
  manager: string | null;
  telegramHandle: string | null;
  telegramConnected: boolean;
  showMyTradesUrl: string | null;
  copierInfo: {
    scaleType: number;
    multiplier: number;
    fixedLotSize: number;
    isActive: boolean;
  } | null;
  weekPnL: number;
  monthPnL: number;
  lifetimeProfit: number;
  lifetimeProfitShare: number;
  lifetimeIncome: number;
  createdAt: Date;
  updatedAt: Date;
}

// Small component to display risk limit in table cell (lazy fetch)
function TraderRiskLimitCell({ mcAccountId }: { mcAccountId: string | null }) {
  const { data, isLoading } = trpc.admin.getTraderRiskLimit.useQuery(
    { mcAccountId: mcAccountId! },
    { enabled: !!mcAccountId, staleTime: 5 * 60 * 1000 }
  );
  if (!mcAccountId)
    return <span className="italic opacity-50 text-sm">No MC</span>;
  if (isLoading)
    return <span className="text-sm text-muted-foreground">...</span>;
  if (!data) return <span className="italic opacity-50 text-sm">Not set</span>;
  return (
    <span className="text-sm font-medium text-destructive">
      ${data.absoluteRiskLimit.toFixed(2)}
    </span>
  );
}

// Risk limit input field that pre-fills with current value from API
function RiskLimitField({
  mcAccountId,
  value,
  onChange,
  loading,
  setLoading,
}: {
  mcAccountId: string;
  value: number | "";
  onChange: (v: number | "") => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
}) {
  const { data, isLoading } = trpc.admin.getTraderRiskLimit.useQuery(
    { mcAccountId },
    { staleTime: 5 * 60 * 1000 }
  );

  useEffect(() => {
    if (data?.absoluteRiskLimit !== undefined && value === "") {
      onChange(data.absoluteRiskLimit);
    }
  }, [data]);

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
        $
      </span>
      <Input
        id="edit-riskLimit"
        type="number"
        min="0"
        step="1"
        className="pl-7"
        value={isLoading ? "" : value}
        placeholder={isLoading ? "Loading..." : "e.g. 300"}
        disabled={isLoading}
        onChange={e =>
          onChange(e.target.value === "" ? "" : parseFloat(e.target.value))
        }
      />
    </div>
  );
}

export default function ManageTraders() {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mcStatusDialogOpen, setMcStatusDialogOpen] = useState(false);
  const [copiersDialogOpen, setCopiersDialogOpen] = useState(false);
  const [selectedTrader, setSelectedTrader] = useState<Trader | null>(null);
  const [mcStatus, setMcStatus] = useState<{
    exists: boolean;
    accountId?: string;
    mtAccount?: string;
  } | null>(null);
  const [managerFilter, setManagerFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<keyof Trader | "copyRate" | null>(
    null
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const [riskLimitValue, setRiskLimitValue] = useState<number | "">("");
  const [riskLimitLoading, setRiskLimitLoading] = useState(false);

  // Broadcast dialog state
  const [broadcastDialogOpen, setBroadcastDialogOpen] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastSendTelegram, setBroadcastSendTelegram] = useState(true);
  const [broadcastSendInApp, setBroadcastSendInApp] = useState(true);

  // Previous magic numbers / master accounts input state
  const [newPrevMagic, setNewPrevMagic] = useState("");
  const [newPrevMagicNote, setNewPrevMagicNote] = useState("");
  const [newPrevAccount, setNewPrevAccount] = useState("");
  const [newPrevAccountNote, setNewPrevAccountNote] = useState("");

  // Direct message dialog state
  const [dmDialogOpen, setDmDialogOpen] = useState(false);
  const [dmTrader, setDmTrader] = useState<Trader | null>(null);
  const [dmTitle, setDmTitle] = useState("");
  const [dmMessage, setDmMessage] = useState("");
  const [dmSendTelegram, setDmSendTelegram] = useState(true);
  const [dmSendInApp, setDmSendInApp] = useState(true);

  // Column visibility state — persisted in localStorage
  const COLUMN_STORAGE_KEY = "rfx-manage-traders-columns";
  const defaultColumns: Record<string, boolean> = {
    manager: true,
    profitShare: true,
    copyRate: true,
    mtAccount: true,
    mtServer: true,
    mtVersion: true,
    mcLocation: true,
    weekPnL: true,
    monthPnL: true,
    lifetimeProfit: true,
    lifetimeShare: true,
    lifetimeIncome: true,
    riskLimit: true,
    telegram: true,
    status: true,
  };

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    () => {
      try {
        const stored = localStorage.getItem(COLUMN_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Record<string, boolean>;
          // Merge with defaults so any new columns added later are visible by default
          return { ...defaultColumns, ...parsed };
        }
      } catch {
        // ignore parse errors
      }
      return defaultColumns;
    }
  );

  const toggleColumn = (col: string) => {
    setVisibleColumns(prev => {
      const next = { ...prev, [col]: !prev[col] };
      try {
        localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const [formData, setFormData] = useState({
    magicNumber: "99999",
    name: "",
    password: "",
    profitShare: 0.35,
    mtAccount: "",
    mtServer: "",
    mtPassword: "",
    mtVersion: "MT5",
    mcLocation: "London",
    liveAccountNumber: "",
    telegramHandle: "",
    showMyTradesUrl: "",
    lifetimeProfit: 0,
    lifetimeProfitShare: 0,
    lifetimeIncome: 0,
  });

  const utils = trpc.useUtils();
  const { data: traders, isLoading } = trpc.admin.listTraders.useQuery();

  const broadcastMutation = trpc.admin.broadcastMessage.useMutation({
    onSuccess: data => {
      toast.success(
        `Broadcast sent: ${data.telegramSent} Telegram, ${data.inAppSent} in-app`
      );
      setBroadcastDialogOpen(false);
      setBroadcastTitle("");
      setBroadcastMessage("");
    },
    onError: e => toast.error(e.message),
  });

  const sendDirectMutation = trpc.admin.sendDirectMessage.useMutation({
    onSuccess: data => {
      const channels = [
        data.telegramSent && "Telegram",
        data.inAppSent && "in-app",
      ]
        .filter(Boolean)
        .join(" & ");
      toast.success(
        `Message sent to ${data.traderName} via ${channels || "no channels"}`
      );
      setDmDialogOpen(false);
      setDmTitle("");
      setDmMessage("");
    },
    onError: e => toast.error(e.message),
  });
  const { data: copiers, refetch: refetchCopiers } =
    trpc.admin.getCopiers.useQuery(
      { traderId: selectedTrader?.id || 0 },
      { enabled: copiersDialogOpen && !!selectedTrader }
    );
  const { data: rfxMasterAccounts } = trpc.admin.getRfxMasterAccounts.useQuery(
    undefined,
    { enabled: editDialogOpen }
  );

  // Previous magic numbers & master accounts queries
  const { data: prevMagicNumbers, refetch: refetchPrevMagics } =
    trpc.admin.getPreviousMagicNumbers.useQuery(
      { traderId: selectedTrader?.id || 0 },
      { enabled: editDialogOpen && !!selectedTrader }
    );
  const { data: prevMasterAccounts, refetch: refetchPrevAccounts } =
    trpc.admin.getPreviousMasterAccounts.useQuery(
      { traderId: selectedTrader?.id || 0 },
      { enabled: editDialogOpen && !!selectedTrader }
    );

  const addPrevMagic = trpc.admin.addPreviousMagicNumber.useMutation({
    onSuccess: () => {
      refetchPrevMagics();
      setNewPrevMagic("");
      setNewPrevMagicNote("");
      toast.success("Previous magic number added");
    },
    onError: error => toast.error(error.message),
  });
  const removePrevMagic = trpc.admin.removePreviousMagicNumber.useMutation({
    onSuccess: () => {
      refetchPrevMagics();
      toast.success("Previous magic number removed");
    },
    onError: error => toast.error(error.message),
  });
  const addPrevAccount = trpc.admin.addPreviousMasterAccount.useMutation({
    onSuccess: () => {
      refetchPrevAccounts();
      setNewPrevAccount("");
      setNewPrevAccountNote("");
      toast.success("Previous master account added");
    },
    onError: error => toast.error(error.message),
  });
  const removePrevAccount = trpc.admin.removePreviousMasterAccount.useMutation({
    onSuccess: () => {
      refetchPrevAccounts();
      toast.success("Previous master account removed");
    },
    onError: error => toast.error(error.message),
  });

  const updateRiskLimit = trpc.admin.updateTraderRiskLimit.useMutation({
    onSuccess: () => {
      toast.success("Risk limit updated successfully");
    },
    onError: error => {
      toast.error(`Risk limit update failed: ${error.message}`);
    },
  });

  const updateTrader = trpc.admin.updateTrader.useMutation({
    onSuccess: () => {
      utils.admin.listTraders.invalidate();
      toast.success("Trader updated successfully");
      setEditDialogOpen(false);
    },
    onError: error => {
      toast.error(error.message);
    },
  });

  const createTrader = trpc.admin.createTrader.useMutation({
    onSuccess: () => {
      utils.admin.listTraders.invalidate();
      toast.success("Trader created successfully");
      setAddDialogOpen(false);
      resetForm();
    },
    onError: error => {
      toast.error(error.message);
    },
  });

  const deleteTrader = trpc.admin.deleteTrader.useMutation({
    onSuccess: () => {
      utils.admin.listTraders.invalidate();
      toast.success("Trader deleted successfully");
      setDeleteDialogOpen(false);
    },
    onError: error => {
      toast.error(error.message);
    },
  });

  const checkMcStatus = trpc.admin.checkMetaCopierStatus.useMutation({
    onSuccess: data => {
      setMcStatus(data);
      setMcStatusDialogOpen(true);
    },
    onError: error => {
      toast.error(error.message);
    },
  });

  const createMcAccount = trpc.admin.createMetaCopierAccount.useMutation({
    onSuccess: data => {
      toast.dismiss("mc-account-creation");
      if (data.success) {
        toast.success(
          data.message || "MetaCopier account created successfully"
        );
        setMcStatusDialogOpen(false);
        // Refresh trader list to show updated magic number
        utils.admin.listTraders.invalidate();
      } else {
        toast.error(data.message || "Failed to create MetaCopier account");
      }
    },
    onError: error => {
      toast.dismiss("mc-account-creation");
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      magicNumber: "99999",
      name: "",
      password: "",
      profitShare: 0.35,
      mtAccount: "",
      mtServer: "",
      mtPassword: "",
      mtVersion: "MT5",
      mcLocation: "London",
      liveAccountNumber: "",
      telegramHandle: "",
      lifetimeProfit: 0,
      lifetimeProfitShare: 0,
      lifetimeIncome: 0,
    });
  };

  const handleEdit = (trader: Trader) => {
    setSelectedTrader(trader);
    setRiskLimitValue("");
    setRiskLimitLoading(false);
    setFormData({
      magicNumber: trader.magicNumber,
      name: trader.name,
      password: "",
      profitShare: trader.profitShare,
      mtAccount: trader.mtAccount || "",
      mtServer: trader.mtServer || "",
      mtPassword: trader.mtPassword || "",
      mtVersion: trader.mtVersion || "MT5",
      mcLocation: trader.mcLocation || "London",
      liveAccountNumber: trader.liveAccountNumber || "",
      telegramHandle: trader.telegramHandle || "",
      showMyTradesUrl: trader.showMyTradesUrl || "",
      lifetimeProfit: trader.lifetimeProfit,
      lifetimeProfitShare: trader.lifetimeProfitShare,
      lifetimeIncome: trader.lifetimeIncome,
    });
    setEditDialogOpen(true);
  };

  const handleDelete = (trader: Trader) => {
    setSelectedTrader(trader);
    setDeleteDialogOpen(true);
  };

  const handleToggleActive = (trader: Trader) => {
    updateTrader.mutate({
      id: trader.id,
      isActive: !trader.isActive,
    });
  };

  const handleUpdateProfitShare = (trader: Trader, newValue: number) => {
    updateTrader.mutate({
      id: trader.id,
      profitShare: newValue,
    });
  };

  const handleCheckMcStatus = (trader: Trader) => {
    if (!trader.mtAccount) {
      toast.error("MT Account not configured for this trader");
      return;
    }
    setSelectedTrader(trader);
    checkMcStatus.mutate({ traderId: trader.id });
  };

  const handleCreateMcAccount = () => {
    if (!selectedTrader) return;
    toast.loading(
      "Creating MetaCopier account... This can take a couple of minutes. Please don't close this page.",
      {
        id: "mc-account-creation",
        duration: 300000, // 5 minutes
      }
    );
    createMcAccount.mutate({ traderId: selectedTrader.id });
  };

  const handleViewCopiers = (trader: Trader) => {
    setSelectedTrader(trader);
    setCopiersDialogOpen(true);
  };

  const updateCopierStatus = trpc.admin.updateCopierStatus.useMutation({
    onSuccess: () => {
      toast.success("Copier status updated");
      refetchCopiers();
    },
    onError: error => {
      toast.error(error.message);
    },
  });

  const removeCopier = trpc.admin.removeCopier.useMutation({
    onSuccess: () => {
      toast.success("Copier removed successfully");
      refetchCopiers();
    },
    onError: error => {
      toast.error(error.message);
    },
  });

  const handleCopierAction = (copier: any, action: "D" | "M" | "A" | "X") => {
    if (!selectedTrader) return;

    if (action === "X") {
      if (
        confirm(
          `Remove copier to ${copier.toAccountAlias}? This will check for open positions first.`
        )
      ) {
        removeCopier.mutate({
          traderId: selectedTrader.id,
          toAccountId: copier.toAccountId,
          copierId: copier.id,
        });
      }
      return;
    }

    const statusMap = {
      D: "DISABLED" as const,
      M: "MANAGE" as const,
      A: "ACTIVE" as const,
    };

    updateCopierStatus.mutate({
      traderId: selectedTrader.id,
      toAccountId: copier.toAccountId,
      copierId: copier.id,
      status: statusMap[action],
    });
  };

  const handleSubmitEdit = () => {
    if (!selectedTrader) return;

    const updates: any = {
      id: selectedTrader.id,
      name: formData.name,
      profitShare: formData.profitShare,
      mtAccount: formData.mtAccount || undefined,
      mtServer: formData.mtServer || undefined,
      mtVersion: formData.mtVersion || undefined,
      mcLocation: formData.mcLocation || undefined,
      liveAccountNumber: formData.liveAccountNumber || undefined,
      telegramHandle: formData.telegramHandle || undefined,
      showMyTradesUrl: formData.showMyTradesUrl || "",
      lifetimeProfit: formData.lifetimeProfit,
      lifetimeProfitShare: formData.lifetimeProfitShare,
      lifetimeIncome: formData.lifetimeIncome,
    };

    if (formData.password) {
      updates.password = formData.password;
    }

    if (formData.mtPassword) {
      updates.mtPassword = formData.mtPassword;
    }

    updateTrader.mutate(updates);

    // If risk limit was changed and trader has an MC account, update it too
    if (riskLimitValue !== "" && selectedTrader?.mcAccountId) {
      updateRiskLimit.mutate({
        mcAccountId: selectedTrader.mcAccountId,
        absoluteRiskLimit: Number(riskLimitValue),
      });
    }
  };

  const handleSubmitAdd = () => {
    if (!formData.magicNumber || !formData.name || !formData.password) {
      toast.error("Magic Number, Name, and Password are required");
      return;
    }

    createTrader.mutate({
      magicNumber: formData.magicNumber,
      name: formData.name,
      password: formData.password,
      profitShare: formData.profitShare,
      mtAccount: formData.mtAccount || undefined,
      mtServer: formData.mtServer || undefined,
      mtPassword: formData.mtPassword || undefined,
      mtVersion: formData.mtVersion || undefined,
      mcLocation: formData.mcLocation || undefined,
    });
  };

  // Handle column sorting
  const handleSort = (field: keyof Trader | "copyRate") => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Filter and sort traders
  const filteredAndSortedTraders = (() => {
    let result =
      traders?.filter(trader => {
        if (managerFilter === "all") return true;
        return trader.manager === managerFilter;
      }) || [];

    if (sortField) {
      result = [...result].sort((a, b) => {
        // Handle copyRate as a special computed field
        let aVal: any;
        let bVal: any;

        if (sortField === "copyRate") {
          aVal = a.copierInfo?.isActive
            ? a.copierInfo.scaleType === 3
              ? a.copierInfo.fixedLotSize
              : a.copierInfo.multiplier
            : 0;
          bVal = b.copierInfo?.isActive
            ? b.copierInfo.scaleType === 3
              ? b.copierInfo.fixedLotSize
              : b.copierInfo.multiplier
            : 0;
        } else {
          aVal = a[sortField];
          bVal = b[sortField];
        }

        // Handle null values
        if (aVal === null && bVal === null) return 0;
        if (aVal === null) return 1;
        if (bVal === null) return -1;

        // Compare values
        if (typeof aVal === "string" && typeof bVal === "string") {
          return sortDirection === "asc"
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        }

        if (typeof aVal === "number" && typeof bVal === "number") {
          return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
        }

        if (typeof aVal === "boolean" && typeof bVal === "boolean") {
          return sortDirection === "asc"
            ? aVal === bVal
              ? 0
              : aVal
                ? 1
                : -1
            : aVal === bVal
              ? 0
              : bVal
                ? 1
                : -1;
        }

        return 0;
      });
    }

    return result;
  })();

  return (
    <AdminLayout>
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Manage Traders</h1>
            <p className="text-muted-foreground mt-1">
              Add, edit, and manage trader accounts
            </p>
          </div>
          <div className="flex gap-3">
            <select
              value={managerFilter}
              onChange={e => setManagerFilter(e.target.value)}
              className="px-3 py-2 border rounded-md bg-background"
            >
              <option value="all">All Managers</option>
              <option value="RFX">RFX</option>
              <option value="HubbFX">HubbFX</option>
            </select>
            {/* Broadcast message button */}
            <Button
              variant="outline"
              onClick={() => setBroadcastDialogOpen(true)}
            >
              <Megaphone className="h-4 w-4 mr-2" />
              Broadcast
            </Button>
            {/* Column visibility toggle */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Columns3 className="h-4 w-4 mr-2" />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(
                  [
                    ["manager", "Manager"],
                    ["profitShare", "Profit Share"],
                    ["copyRate", "Copy Rate"],
                    ["mtAccount", "MT Account"],
                    ["mtServer", "MT Server"],
                    ["mtVersion", "MT Version"],
                    ["mcLocation", "MC Location"],
                    ["weekPnL", "Profit This Week"],
                    ["monthPnL", "Profit This Month"],
                    ["lifetimeProfit", "Lifetime Profit"],
                    ["lifetimeShare", "Lifetime Share"],
                    ["lifetimeIncome", "Lifetime Income"],
                    ["riskLimit", "Risk Limit"],
                    ["telegram", "Telegram"],
                    ["status", "Status"],
                  ] as [string, string][]
                ).map(([key, label]) => (
                  <DropdownMenuCheckboxItem
                    key={key}
                    checked={visibleColumns[key]}
                    onCheckedChange={() => toggleColumn(key)}
                  >
                    {label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Trader
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="border rounded-lg overflow-x-auto max-h-[calc(100vh-220px)]">
            <Table>
              <TableHeader className="sticky top-0 z-30">
                <TableRow>
                  <TableHead
                    className="cursor-pointer select-none sticky left-0 z-40 bg-background"
                    onClick={() => handleSort("name")}
                  >
                    <div className="flex items-center gap-1">
                      Name
                      {sortField === "name" ? (
                        sortDirection === "asc" ? (
                          <ArrowUp className="h-4 w-4" />
                        ) : (
                          <ArrowDown className="h-4 w-4" />
                        )
                      ) : (
                        <ArrowUpDown className="h-4 w-4 opacity-30" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none sticky left-[160px] z-40 bg-background"
                    onClick={() => handleSort("magicNumber")}
                  >
                    <div className="flex items-center gap-1">
                      Magic
                      {sortField === "magicNumber" ? (
                        sortDirection === "asc" ? (
                          <ArrowUp className="h-4 w-4" />
                        ) : (
                          <ArrowDown className="h-4 w-4" />
                        )
                      ) : (
                        <ArrowUpDown className="h-4 w-4 opacity-30" />
                      )}
                    </div>
                  </TableHead>
                  {visibleColumns.manager && (
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("manager")}
                    >
                      <div className="flex items-center gap-1">
                        Manager
                        {sortField === "manager" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4 opacity-30" />
                        )}
                      </div>
                    </TableHead>
                  )}
                  {visibleColumns.profitShare && (
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("profitShare")}
                    >
                      <div className="flex items-center gap-1">
                        Profit Share
                        {sortField === "profitShare" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4 opacity-30" />
                        )}
                      </div>
                    </TableHead>
                  )}
                  {visibleColumns.copyRate && (
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("copyRate")}
                    >
                      <div className="flex items-center gap-1">
                        Copy Rate
                        {sortField === "copyRate" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4 opacity-30" />
                        )}
                      </div>
                    </TableHead>
                  )}
                  {visibleColumns.mtAccount && (
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("mtAccount")}
                    >
                      <div className="flex items-center gap-1">
                        MT Account
                        {sortField === "mtAccount" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4 opacity-30" />
                        )}
                      </div>
                    </TableHead>
                  )}
                  {visibleColumns.mtServer && (
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("mtServer")}
                    >
                      <div className="flex items-center gap-1">
                        MT Server
                        {sortField === "mtServer" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4 opacity-30" />
                        )}
                      </div>
                    </TableHead>
                  )}
                  {visibleColumns.mtVersion && (
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("mtVersion")}
                    >
                      <div className="flex items-center gap-1">
                        MT Version
                        {sortField === "mtVersion" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4 opacity-30" />
                        )}
                      </div>
                    </TableHead>
                  )}
                  {visibleColumns.mcLocation && (
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("mcLocation")}
                    >
                      <div className="flex items-center gap-1">
                        MC Location
                        {sortField === "mcLocation" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4 opacity-30" />
                        )}
                      </div>
                    </TableHead>
                  )}
                  {visibleColumns.weekPnL && (
                    <TableHead
                      className="text-right cursor-pointer select-none"
                      onClick={() => handleSort("weekPnL")}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Profit This Week
                        {sortField === "weekPnL" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4 opacity-30" />
                        )}
                      </div>
                    </TableHead>
                  )}
                  {visibleColumns.monthPnL && (
                    <TableHead
                      className="text-right cursor-pointer select-none"
                      onClick={() => handleSort("monthPnL")}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Profit This Month
                        {sortField === "monthPnL" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4 opacity-30" />
                        )}
                      </div>
                    </TableHead>
                  )}
                  {visibleColumns.lifetimeProfit && (
                    <TableHead
                      className="text-right cursor-pointer select-none"
                      onClick={() => handleSort("lifetimeProfit")}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Lifetime Profit
                        {sortField === "lifetimeProfit" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4 opacity-30" />
                        )}
                      </div>
                    </TableHead>
                  )}
                  {visibleColumns.lifetimeShare && (
                    <TableHead
                      className="text-right cursor-pointer select-none"
                      onClick={() => handleSort("lifetimeProfitShare")}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Lifetime Share
                        {sortField === "lifetimeProfitShare" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4 opacity-30" />
                        )}
                      </div>
                    </TableHead>
                  )}
                  {visibleColumns.lifetimeIncome && (
                    <TableHead
                      className="text-right cursor-pointer select-none"
                      onClick={() => handleSort("lifetimeIncome")}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Lifetime Income
                        {sortField === "lifetimeIncome" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4 opacity-30" />
                        )}
                      </div>
                    </TableHead>
                  )}
                  {visibleColumns.riskLimit && (
                    <TableHead>Risk Limit</TableHead>
                  )}
                  {visibleColumns.telegram && (
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("telegramHandle")}
                    >
                      <div className="flex items-center gap-1">
                        Telegram
                        {sortField === "telegramHandle" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4 opacity-30" />
                        )}
                      </div>
                    </TableHead>
                  )}
                  {visibleColumns.status && (
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("isActive")}
                    >
                      <div className="flex items-center gap-1">
                        Status
                        {sortField === "isActive" ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4 opacity-30" />
                        )}
                      </div>
                    </TableHead>
                  )}
                  <TableHead className="text-right sticky right-0 z-40 bg-background">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedTraders &&
                filteredAndSortedTraders.length > 0 ? (
                  filteredAndSortedTraders.map(trader => (
                    <TableRow key={trader.id}>
                      <TableCell className="font-medium sticky left-0 z-10 bg-background">
                        {trader.name}
                      </TableCell>
                      <TableCell className="sticky left-[160px] z-10 bg-background">
                        <span className="font-mono text-sm">
                          {trader.magicNumber}
                        </span>
                        {trader.isAdmin && (
                          <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                            Admin
                          </span>
                        )}
                      </TableCell>
                      {visibleColumns.manager && (
                        <TableCell>
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-secondary">
                            {trader.manager || "RFX"}
                          </span>
                        </TableCell>
                      )}
                      {visibleColumns.profitShare && (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={(trader.profitShare * 100).toFixed(1)}
                              onChange={e => {
                                const newValue =
                                  parseFloat(e.target.value) / 100;
                                if (
                                  !isNaN(newValue) &&
                                  newValue >= 0 &&
                                  newValue <= 1
                                ) {
                                  handleUpdateProfitShare(trader, newValue);
                                }
                              }}
                              className="w-16 h-8 text-sm"
                            />
                            <span className="text-sm text-muted-foreground">
                              %
                            </span>
                          </div>
                        </TableCell>
                      )}
                      {visibleColumns.copyRate && (
                        <TableCell>
                          <span className="font-mono text-sm font-semibold">
                            {trader.copierInfo ? (
                              trader.copierInfo.isActive ? (
                                trader.copierInfo.scaleType === 3 ? (
                                  trader.copierInfo.fixedLotSize.toFixed(2)
                                ) : (
                                  `${trader.copierInfo.multiplier}x`
                                )
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </span>
                        </TableCell>
                      )}
                      {visibleColumns.mtAccount && (
                        <TableCell>
                          <span className="font-mono text-sm">
                            {trader.mtAccount || "-"}
                          </span>
                        </TableCell>
                      )}
                      {visibleColumns.mtServer && (
                        <TableCell className="text-sm">
                          {trader.mtServer || "-"}
                        </TableCell>
                      )}
                      {visibleColumns.mtVersion && (
                        <TableCell className="text-sm">
                          {trader.mtVersion || "-"}
                        </TableCell>
                      )}
                      {visibleColumns.mcLocation && (
                        <TableCell className="text-sm">
                          {trader.mcLocation || "-"}
                        </TableCell>
                      )}
                      {visibleColumns.weekPnL && (
                        <TableCell className="text-right">
                          <span
                            className={
                              trader.weekPnL >= 0
                                ? "text-success"
                                : "text-destructive"
                            }
                          >
                            ${trader.weekPnL.toFixed(2)}
                          </span>
                        </TableCell>
                      )}
                      {visibleColumns.monthPnL && (
                        <TableCell className="text-right">
                          <span
                            className={
                              trader.monthPnL >= 0
                                ? "text-success"
                                : "text-destructive"
                            }
                          >
                            ${trader.monthPnL.toFixed(2)}
                          </span>
                        </TableCell>
                      )}
                      {visibleColumns.lifetimeProfit && (
                        <TableCell className="text-right">
                          <span
                            className={
                              trader.lifetimeProfit >= 0
                                ? "text-success"
                                : "text-destructive"
                            }
                          >
                            ${trader.lifetimeProfit.toFixed(2)}
                          </span>
                        </TableCell>
                      )}
                      {visibleColumns.lifetimeShare && (
                        <TableCell className="text-right">
                          <span className="text-success">
                            ${trader.lifetimeProfitShare.toFixed(2)}
                          </span>
                        </TableCell>
                      )}
                      {visibleColumns.lifetimeIncome && (
                        <TableCell className="text-right">
                          <span className="text-success">
                            ${trader.lifetimeIncome.toFixed(2)}
                          </span>
                        </TableCell>
                      )}
                      {visibleColumns.riskLimit && (
                        <TableCell>
                          <TraderRiskLimitCell
                            mcAccountId={trader.mcAccountId}
                          />
                        </TableCell>
                      )}
                      {visibleColumns.telegram && (
                        <TableCell>
                          {trader.telegramHandle ? (
                            <button
                              className={`flex items-center gap-1.5 text-sm group ${
                                trader.telegramConnected
                                  ? "cursor-pointer hover:text-primary"
                                  : "cursor-default text-muted-foreground"
                              }`}
                              onClick={() => {
                                if (!trader.telegramConnected) return;
                                setDmTrader(trader);
                                setDmTitle("");
                                setDmMessage("");
                                setDmSendTelegram(true);
                                setDmSendInApp(true);
                                setDmDialogOpen(true);
                              }}
                              title={
                                trader.telegramConnected
                                  ? `Send message to ${trader.telegramHandle}`
                                  : "Not connected to bot"
                              }
                            >
                              <span
                                className={`h-2 w-2 rounded-full flex-shrink-0 ${
                                  trader.telegramConnected
                                    ? "bg-green-500"
                                    : "bg-gray-300"
                                }`}
                              />
                              <span>{trader.telegramHandle}</span>
                              {trader.telegramConnected && (
                                <Send className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                              )}
                            </button>
                          ) : (
                            <span className="italic text-sm opacity-50">
                              Not set
                            </span>
                          )}
                        </TableCell>
                      )}
                      {visibleColumns.status && (
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={trader.isActive}
                              onCheckedChange={() => handleToggleActive(trader)}
                              disabled={trader.isAdmin}
                            />
                            <span className="text-sm text-muted-foreground">
                              {trader.isActive ? "Active" : "Inactive"}
                            </span>
                          </div>
                        </TableCell>
                      )}
                      <TableCell className="text-right sticky right-0 z-10 bg-background">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCheckMcStatus(trader)}
                            disabled={
                              !trader.mtAccount || checkMcStatus.isPending
                            }
                          >
                            {checkMcStatus.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Check MC"
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewCopiers(trader)}
                            disabled={!trader.mtAccount}
                          >
                            <Users className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(trader)}
                            disabled={trader.isAdmin}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(trader)}
                            disabled={trader.isAdmin}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={11}
                      className="text-center py-8 text-muted-foreground"
                    >
                      No traders found. Add your first trader to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Broadcast Message Dialog */}
        <Dialog
          open={broadcastDialogOpen}
          onOpenChange={setBroadcastDialogOpen}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Megaphone className="h-5 w-5" />
                Broadcast Message
              </DialogTitle>
              <DialogDescription>
                Send a message to all traders via Telegram and/or in-app
                notification.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="broadcast-title">Title</Label>
                <Input
                  id="broadcast-title"
                  value={broadcastTitle}
                  onChange={e => setBroadcastTitle(e.target.value)}
                  placeholder="e.g. System Maintenance Notice"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="broadcast-message">Message</Label>
                <Textarea
                  id="broadcast-message"
                  value={broadcastMessage}
                  onChange={e => setBroadcastMessage(e.target.value)}
                  placeholder="Write your message here..."
                  rows={5}
                />
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={broadcastSendTelegram}
                    onCheckedChange={setBroadcastSendTelegram}
                    id="bc-telegram"
                  />
                  <Label htmlFor="bc-telegram" className="cursor-pointer">
                    Telegram
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={broadcastSendInApp}
                    onCheckedChange={setBroadcastSendInApp}
                    id="bc-inapp"
                  />
                  <Label htmlFor="bc-inapp" className="cursor-pointer">
                    In-App
                  </Label>
                </div>
              </div>
              {traders && (
                <p className="text-xs text-muted-foreground">
                  Will send to <strong>{traders.length}</strong> traders
                  {broadcastSendTelegram &&
                    ` (${traders.filter(t => t.telegramConnected).length} connected to Telegram)`}
                  .
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setBroadcastDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() =>
                  broadcastMutation.mutate({
                    title: broadcastTitle,
                    message: broadcastMessage,
                    sendTelegram: broadcastSendTelegram,
                    sendInApp: broadcastSendInApp,
                  })
                }
                disabled={
                  !broadcastTitle.trim() ||
                  !broadcastMessage.trim() ||
                  broadcastMutation.isPending
                }
              >
                {broadcastMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Megaphone className="h-4 w-4 mr-2" />
                    Send Broadcast
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Direct Message Dialog */}
        <Dialog open={dmDialogOpen} onOpenChange={setDmDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Message {dmTrader?.name}
              </DialogTitle>
              <DialogDescription>
                Send a direct message to {dmTrader?.telegramHandle} via Telegram
                and/or in-app notification.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="dm-title">Title</Label>
                <Input
                  id="dm-title"
                  value={dmTitle}
                  onChange={e => setDmTitle(e.target.value)}
                  placeholder="e.g. Account Update"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dm-message">Message</Label>
                <Textarea
                  id="dm-message"
                  value={dmMessage}
                  onChange={e => setDmMessage(e.target.value)}
                  placeholder="Write your message here..."
                  rows={5}
                />
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={dmSendTelegram}
                    onCheckedChange={setDmSendTelegram}
                    id="dm-telegram"
                  />
                  <Label htmlFor="dm-telegram" className="cursor-pointer">
                    Telegram
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={dmSendInApp}
                    onCheckedChange={setDmSendInApp}
                    id="dm-inapp"
                  />
                  <Label htmlFor="dm-inapp" className="cursor-pointer">
                    In-App
                  </Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDmDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  dmTrader &&
                  sendDirectMutation.mutate({
                    traderId: dmTrader.id,
                    title: dmTitle,
                    message: dmMessage,
                    sendTelegram: dmSendTelegram,
                    sendInApp: dmSendInApp,
                  })
                }
                disabled={
                  !dmTitle.trim() ||
                  !dmMessage.trim() ||
                  sendDirectMutation.isPending
                }
              >
                {sendDirectMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Message
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Trader Dialog */}
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Trader</DialogTitle>
              <DialogDescription>
                Create a new trader account with MT4/MT5 details
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="magicNumber">Magic Number *</Label>
                  <Input
                    id="magicNumber"
                    value={formData.magicNumber}
                    onChange={e =>
                      setFormData({ ...formData, magicNumber: e.target.value })
                    }
                    placeholder="99999"
                    className="text-muted-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={e =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Trader name"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Password *</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={e =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    placeholder="Login password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profitShare">Profit Share (0-1)</Label>
                  <Input
                    id="profitShare"
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={formData.profitShare}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        profitShare: parseFloat(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              <div className="border-t pt-4 mt-2">
                <h3 className="font-semibold mb-3">MT4/MT5 Account Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="mtAccount">MT Account Number</Label>
                    <Input
                      id="mtAccount"
                      value={formData.mtAccount}
                      onChange={e =>
                        setFormData({ ...formData, mtAccount: e.target.value })
                      }
                      placeholder="e.g., 12345678"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mtServer">MT Server</Label>
                    <Input
                      id="mtServer"
                      value={formData.mtServer}
                      onChange={e =>
                        setFormData({ ...formData, mtServer: e.target.value })
                      }
                      placeholder="e.g., BrokerName-Live"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="mtPassword">MT Password</Label>
                    <Input
                      id="mtPassword"
                      type="password"
                      value={formData.mtPassword}
                      onChange={e =>
                        setFormData({ ...formData, mtPassword: e.target.value })
                      }
                      placeholder="MT account password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mtVersion">MT Version</Label>
                    <select
                      id="mtVersion"
                      value={formData.mtVersion}
                      onChange={e =>
                        setFormData({ ...formData, mtVersion: e.target.value })
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="MT4">MT4</option>
                      <option value="MT5">MT5</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mcLocation">MetaCopier Location</Label>
                  <select
                    id="mcLocation"
                    value={formData.mcLocation}
                    onChange={e =>
                      setFormData({ ...formData, mcLocation: e.target.value })
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="London">London</option>
                    <option value="New York">New York</option>
                    <option value="Berlin">Berlin</option>
                    <option value="Singapore">Singapore</option>
                  </select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmitAdd}
                disabled={createTrader.isPending}
              >
                {createTrader.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Create Trader
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Trader Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Trader</DialogTitle>
              <DialogDescription>
                Update trader details and MT4/MT5 configuration
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Magic Number</Label>
                  <Input
                    value={formData.magicNumber}
                    disabled
                    className="bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Name</Label>
                  <Input
                    id="edit-name"
                    value={formData.name}
                    onChange={e =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-password">New Password (optional)</Label>
                  <Input
                    id="edit-password"
                    type="password"
                    value={formData.password}
                    onChange={e =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    placeholder="Leave blank to keep current"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-profitShare">Profit Share (%)</Label>
                  <Input
                    id="edit-profitShare"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={(formData.profitShare * 100).toFixed(1)}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        profitShare: parseFloat(e.target.value) / 100,
                      })
                    }
                  />
                </div>
              </div>
              <div className="border-t pt-4 mt-2">
                <h3 className="font-semibold mb-3">MT4/MT5 Account Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-mtAccount">MT Account Number</Label>
                    <Input
                      id="edit-mtAccount"
                      value={formData.mtAccount}
                      onChange={e =>
                        setFormData({ ...formData, mtAccount: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-mtServer">MT Server</Label>
                    <Input
                      id="edit-mtServer"
                      value={formData.mtServer}
                      onChange={e =>
                        setFormData({ ...formData, mtServer: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-mtPassword">
                      MT Password (optional)
                    </Label>
                    <Input
                      id="edit-mtPassword"
                      type="password"
                      value={formData.mtPassword}
                      onChange={e =>
                        setFormData({ ...formData, mtPassword: e.target.value })
                      }
                      placeholder="Leave blank to keep current"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-mtVersion">MT Version</Label>
                    <select
                      id="edit-mtVersion"
                      value={formData.mtVersion}
                      onChange={e =>
                        setFormData({ ...formData, mtVersion: e.target.value })
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="MT4">MT4</option>
                      <option value="MT5">MT5</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-mcLocation">MetaCopier Location</Label>
                  <select
                    id="edit-mcLocation"
                    value={formData.mcLocation}
                    onChange={e =>
                      setFormData({ ...formData, mcLocation: e.target.value })
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="London">London</option>
                    <option value="New York">New York</option>
                    <option value="Berlin">Berlin</option>
                    <option value="Singapore">Singapore</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-liveAccountNumber">
                    Live Account Number
                  </Label>
                  <select
                    id="edit-liveAccountNumber"
                    value={formData.liveAccountNumber}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        liveAccountNumber: e.target.value,
                      })
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Select Live Account</option>
                    {rfxMasterAccounts?.map((account: any) => (
                      <option
                        key={account.id}
                        value={account.loginAccountNumber}
                      >
                        {account.alias} ({account.loginAccountNumber})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-telegramHandle">Telegram Handle</Label>
                  <Input
                    id="edit-telegramHandle"
                    value={formData.telegramHandle}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        telegramHandle: e.target.value,
                      })
                    }
                    placeholder="@username"
                  />
                </div>
                {selectedTrader?.mcAccountId && (
                  <div className="space-y-2">
                    <Label htmlFor="edit-riskLimit">Risk Limit ($)</Label>
                    <RiskLimitField
                      mcAccountId={selectedTrader.mcAccountId}
                      value={riskLimitValue}
                      onChange={setRiskLimitValue}
                      loading={riskLimitLoading}
                      setLoading={setRiskLimitLoading}
                    />
                    <p className="text-xs text-muted-foreground">
                      Absolute equity risk limit. If equity drops below this
                      value, all trades are closed.
                    </p>
                  </div>
                )}
              </div>
              <div className="border-t pt-4 mt-2">
                <h3 className="font-semibold mb-3">Lifetime Metrics</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-lifetimeProfit">
                      Lifetime Profit ($)
                    </Label>
                    <Input
                      id="edit-lifetimeProfit"
                      type="number"
                      step="0.01"
                      value={formData.lifetimeProfit}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          lifetimeProfit: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-lifetimeProfitShare">
                      Lifetime Share ($)
                    </Label>
                    <Input
                      id="edit-lifetimeProfitShare"
                      type="number"
                      step="0.01"
                      value={formData.lifetimeProfitShare}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          lifetimeProfitShare: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-lifetimeIncome">
                      Lifetime Income ($)
                    </Label>
                    <Input
                      id="edit-lifetimeIncome"
                      type="number"
                      step="0.01"
                      value={formData.lifetimeIncome}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          lifetimeIncome: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Previous Magic Numbers */}
              <div className="border-t pt-4 mt-2">
                <h3 className="font-semibold mb-3">Previous Magic Numbers</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Historical magic numbers this trader used. Lifetime P&L will
                  aggregate across all.
                </p>
                {prevMagicNumbers && prevMagicNumbers.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {prevMagicNumbers.map(pm => (
                      <div
                        key={pm.id}
                        className="flex items-center gap-2 text-sm bg-muted/50 rounded px-3 py-2"
                      >
                        <span className="font-mono font-medium">
                          {pm.previousMagicNumber}
                        </span>
                        {pm.note && (
                          <span className="text-muted-foreground">
                            — {pm.note}
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-6 w-6 p-0 text-destructive hover:text-destructive"
                          onClick={() => removePrevMagic.mutate({ id: pm.id })}
                          disabled={removePrevMagic.isPending}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    placeholder="Magic number"
                    value={newPrevMagic}
                    onChange={e => setNewPrevMagic(e.target.value)}
                    className="w-36"
                  />
                  <Input
                    placeholder="Note (optional)"
                    value={newPrevMagicNote}
                    onChange={e => setNewPrevMagicNote(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      !newPrevMagic.trim() ||
                      !selectedTrader ||
                      addPrevMagic.isPending
                    }
                    onClick={() => {
                      if (selectedTrader && newPrevMagic.trim()) {
                        addPrevMagic.mutate({
                          traderId: selectedTrader.id,
                          magicNumber: newPrevMagic.trim(),
                          note: newPrevMagicNote.trim() || undefined,
                        });
                      }
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </div>
              </div>

              {/* Previous Master Accounts */}
              <div className="border-t pt-4 mt-2">
                <h3 className="font-semibold mb-3">Previous Master Accounts</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Historical master/live accounts this trader was assigned to.
                  Lifetime P&L will aggregate across all.
                </p>
                {prevMasterAccounts && prevMasterAccounts.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {prevMasterAccounts.map(pa => {
                      const acct = rfxMasterAccounts?.find(
                        (a: any) =>
                          a.loginAccountNumber === pa.liveAccountNumber
                      );
                      return (
                        <div
                          key={pa.id}
                          className="flex items-center gap-2 text-sm bg-muted/50 rounded px-3 py-2"
                        >
                          <span className="font-mono font-medium">
                            {acct
                              ? `${acct.alias} (${pa.liveAccountNumber})`
                              : pa.liveAccountNumber}
                          </span>
                          {pa.note && (
                            <span className="text-muted-foreground">
                              — {pa.note}
                            </span>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="ml-auto h-6 w-6 p-0 text-destructive hover:text-destructive"
                            onClick={() =>
                              removePrevAccount.mutate({ id: pa.id })
                            }
                            disabled={removePrevAccount.isPending}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex gap-2">
                  <select
                    className="border rounded px-2 py-1 text-sm w-56 bg-background"
                    value={newPrevAccount}
                    onChange={e => setNewPrevAccount(e.target.value)}
                  >
                    <option value="">Select account</option>
                    {rfxMasterAccounts
                      ?.filter(
                        (a: any) =>
                          a.loginAccountNumber !== formData.liveAccountNumber
                      )
                      .map((a: any) => (
                        <option key={a.id} value={a.loginAccountNumber}>
                          {a.alias} ({a.loginAccountNumber})
                        </option>
                      ))}
                  </select>
                  <Input
                    placeholder="Note (optional)"
                    value={newPrevAccountNote}
                    onChange={e => setNewPrevAccountNote(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      !newPrevAccount ||
                      !selectedTrader ||
                      addPrevAccount.isPending
                    }
                    onClick={() => {
                      if (selectedTrader && newPrevAccount) {
                        addPrevAccount.mutate({
                          traderId: selectedTrader.id,
                          liveAccountNumber: newPrevAccount,
                          note: newPrevAccountNote.trim() || undefined,
                        });
                      }
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </div>
              </div>

              {/* ShowMyTrades URL */}
              <div className="border rounded-lg p-4 space-y-3">
                <h3 className="font-semibold mb-3">ShowMyTrades</h3>
                <div className="space-y-2">
                  <Label htmlFor="showMyTradesUrl">ShowMyTrades URL</Label>
                  <Input
                    id="showMyTradesUrl"
                    value={formData.showMyTradesUrl || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        showMyTradesUrl: e.target.value,
                      })
                    }
                    placeholder="https://www.showmytrades.com/..."
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEditDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitEdit}
                disabled={updateTrader.isPending}
              >
                {updateTrader.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Trader</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete{" "}
                <strong>{selectedTrader?.name}</strong>? This action cannot be
                undone and will remove all associated data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  selectedTrader &&
                  deleteTrader.mutate({ id: selectedTrader.id })
                }
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteTrader.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* MetaCopier Status Dialog */}
        <Dialog open={mcStatusDialogOpen} onOpenChange={setMcStatusDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>MetaCopier Account Status</DialogTitle>
              <DialogDescription>
                Check if the trader's MT account exists in MetaCopier
              </DialogDescription>
            </DialogHeader>
            <div className="py-6">
              {mcStatus && (
                <div className="flex flex-col items-center gap-4">
                  {mcStatus.exists ? (
                    <>
                      <CheckCircle2 className="h-16 w-16 text-success" />
                      <div className="text-center">
                        <p className="font-semibold text-lg">Account Found</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          MT Account{" "}
                          <span className="font-mono">
                            {mcStatus.mtAccount}
                          </span>{" "}
                          exists in MetaCopier
                        </p>
                        {mcStatus.accountId && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Account ID: {mcStatus.accountId}
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-16 w-16 text-destructive" />
                      <div className="text-center">
                        <p className="font-semibold text-lg">
                          Account Not Found
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          MT Account{" "}
                          <span className="font-mono">
                            {mcStatus.mtAccount}
                          </span>{" "}
                          does not exist in MetaCopier
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">
                          Would you like to create this account?
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              {mcStatus && !mcStatus.exists && (
                <Button
                  onClick={handleCreateMcAccount}
                  disabled={createMcAccount.isPending}
                >
                  {createMcAccount.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Create Account
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setMcStatusDialogOpen(false)}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Copiers Dialog */}
        <Dialog open={copiersDialogOpen} onOpenChange={setCopiersDialogOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Copiers for {selectedTrader?.name}</DialogTitle>
              <DialogDescription>
                Manage copiers that are copying from this trader's account
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {copiers && copiers.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>To Account</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {copiers.map((copier: any) => (
                      <TableRow key={copier.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">
                              {copier.toAccountAlias}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {copier.toAccountNumber}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              copier.status === "ACTIVE"
                                ? "bg-green-100 text-green-800"
                                : copier.status === "DISABLED"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-yellow-100 text-yellow-800"
                            }`}
                          >
                            {copier.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCopierAction(copier, "D")}
                              disabled={copier.status === "DISABLED"}
                              title="Disable copier"
                            >
                              D
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCopierAction(copier, "M")}
                              disabled={copier.status === "MANAGE"}
                              title="Manage mode (no new trades)"
                            >
                              M
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCopierAction(copier, "A")}
                              disabled={copier.status === "ACTIVE"}
                              title="Activate copier"
                            >
                              A
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleCopierAction(copier, "X")}
                              title="Remove copier (checks for open positions)"
                            >
                              X
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No copiers found for this trader
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCopiersDialogOpen(false)}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
