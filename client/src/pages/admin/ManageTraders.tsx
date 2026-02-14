import { useState } from "react";
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
import { toast } from "sonner";
import { Pencil, Trash2, Plus, CheckCircle2, XCircle, Loader2 } from "lucide-react";

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
  mtLocation: string | null;
  lifetimeProfit: number;
  lifetimeProfitShare: number;
  lifetimeIncome: number;
  createdAt: Date;
  updatedAt: Date;
}

export default function ManageTraders() {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mcStatusDialogOpen, setMcStatusDialogOpen] = useState(false);
  const [selectedTrader, setSelectedTrader] = useState<Trader | null>(null);
  const [mcStatus, setMcStatus] = useState<{ exists: boolean; accountId?: string; mtAccount?: string } | null>(null);

  const [formData, setFormData] = useState({
    magicNumber: "",
    name: "",
    password: "",
    profitShare: 0.35,
    mtAccount: "",
    mtServer: "",
    mtPassword: "",
    mtLocation: "MT4",
  });

  const utils = trpc.useUtils();
  const { data: traders, isLoading } = trpc.admin.listTraders.useQuery();

  const updateTrader = trpc.admin.updateTrader.useMutation({
    onSuccess: () => {
      utils.admin.listTraders.invalidate();
      toast.success("Trader updated successfully");
      setEditDialogOpen(false);
    },
    onError: (error) => {
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
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteTrader = trpc.admin.deleteTrader.useMutation({
    onSuccess: () => {
      utils.admin.listTraders.invalidate();
      toast.success("Trader deleted successfully");
      setDeleteDialogOpen(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const checkMcStatus = trpc.admin.checkMetaCopierStatus.useMutation({
    onSuccess: (data) => {
      setMcStatus(data);
      setMcStatusDialogOpen(true);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const createMcAccount = trpc.admin.createMetaCopierAccount.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message || "MetaCopier account created successfully");
        setMcStatusDialogOpen(false);
      } else {
        toast.error(data.message || "Failed to create MetaCopier account");
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      magicNumber: "",
      name: "",
      password: "",
      profitShare: 0.35,
      mtAccount: "",
      mtServer: "",
      mtPassword: "",
      mtLocation: "MT4",
    });
  };

  const handleEdit = (trader: Trader) => {
    setSelectedTrader(trader);
    setFormData({
      magicNumber: trader.magicNumber,
      name: trader.name,
      password: "",
      profitShare: trader.profitShare,
      mtAccount: trader.mtAccount || "",
      mtServer: trader.mtServer || "",
      mtPassword: trader.mtPassword || "",
      mtLocation: trader.mtLocation || "MT4",
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
    createMcAccount.mutate({ traderId: selectedTrader.id });
  };

  const handleSubmitEdit = () => {
    if (!selectedTrader) return;

    const updates: any = {
      id: selectedTrader.id,
      name: formData.name,
      profitShare: formData.profitShare,
      mtAccount: formData.mtAccount || undefined,
      mtServer: formData.mtServer || undefined,
      mtLocation: formData.mtLocation || undefined,
    };

    if (formData.password) {
      updates.password = formData.password;
    }

    if (formData.mtPassword) {
      updates.mtPassword = formData.mtPassword;
    }

    updateTrader.mutate(updates);
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
      mtLocation: formData.mtLocation || undefined,
    });
  };

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
          <Button onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Trader
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Magic</TableHead>
                  <TableHead>Profit Share</TableHead>
                  <TableHead>MT Account</TableHead>
                  <TableHead>MT Server</TableHead>
                  <TableHead>MT Location</TableHead>
                  <TableHead className="text-right">Lifetime Profit</TableHead>
                  <TableHead className="text-right">Lifetime Share</TableHead>
                  <TableHead className="text-right">Lifetime Income</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {traders && traders.length > 0 ? (
                  traders.map((trader) => (
                    <TableRow key={trader.id}>
                      <TableCell className="font-medium">{trader.name}</TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">{trader.magicNumber}</span>
                        {trader.isAdmin && (
                          <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                            Admin
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={trader.profitShare}
                          onChange={(e) => {
                            const newValue = parseFloat(e.target.value);
                            if (!isNaN(newValue) && newValue >= 0 && newValue <= 1) {
                              handleUpdateProfitShare(trader, newValue);
                            }
                          }}
                          className="w-20 h-8 text-sm"
                        />
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">{trader.mtAccount || "-"}</span>
                      </TableCell>
                      <TableCell className="text-sm">{trader.mtServer || "-"}</TableCell>
                      <TableCell className="text-sm">{trader.mtLocation || "-"}</TableCell>
                      <TableCell className="text-right">
                        <span className={trader.lifetimeProfit >= 0 ? "text-success" : "text-destructive"}>
                          ${trader.lifetimeProfit.toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-success">${trader.lifetimeProfitShare.toFixed(2)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-success">${trader.lifetimeIncome.toFixed(2)}</span>
                      </TableCell>
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
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCheckMcStatus(trader)}
                            disabled={!trader.mtAccount || checkMcStatus.isPending}
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
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                      No traders found. Add your first trader to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

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
                    onChange={(e) => setFormData({ ...formData, magicNumber: e.target.value })}
                    placeholder="e.g., 100001"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
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
                    onChange={(e) => setFormData({ ...formData, profitShare: parseFloat(e.target.value) })}
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
                      onChange={(e) => setFormData({ ...formData, mtAccount: e.target.value })}
                      placeholder="e.g., 12345678"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mtServer">MT Server</Label>
                    <Input
                      id="mtServer"
                      value={formData.mtServer}
                      onChange={(e) => setFormData({ ...formData, mtServer: e.target.value })}
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
                      onChange={(e) => setFormData({ ...formData, mtPassword: e.target.value })}
                      placeholder="MT account password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mtLocation">Platform</Label>
                    <select
                      id="mtLocation"
                      value={formData.mtLocation}
                      onChange={(e) => setFormData({ ...formData, mtLocation: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="MT4">MT4</option>
                      <option value="MT5">MT5</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmitAdd} disabled={createTrader.isPending}>
                {createTrader.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
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
                  <Input value={formData.magicNumber} disabled className="bg-muted" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Name</Label>
                  <Input
                    id="edit-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Leave blank to keep current"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-profitShare">Profit Share (0-1)</Label>
                  <Input
                    id="edit-profitShare"
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={formData.profitShare}
                    onChange={(e) => setFormData({ ...formData, profitShare: parseFloat(e.target.value) })}
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
                      onChange={(e) => setFormData({ ...formData, mtAccount: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-mtServer">MT Server</Label>
                    <Input
                      id="edit-mtServer"
                      value={formData.mtServer}
                      onChange={(e) => setFormData({ ...formData, mtServer: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-mtPassword">MT Password (optional)</Label>
                    <Input
                      id="edit-mtPassword"
                      type="password"
                      value={formData.mtPassword}
                      onChange={(e) => setFormData({ ...formData, mtPassword: e.target.value })}
                      placeholder="Leave blank to keep current"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-mtLocation">Platform</Label>
                    <select
                      id="edit-mtLocation"
                      value={formData.mtLocation}
                      onChange={(e) => setFormData({ ...formData, mtLocation: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="MT4">MT4</option>
                      <option value="MT5">MT5</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmitEdit} disabled={updateTrader.isPending}>
                {updateTrader.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
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
                Are you sure you want to delete <strong>{selectedTrader?.name}</strong>? This action
                cannot be undone and will remove all associated data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => selectedTrader && deleteTrader.mutate({ id: selectedTrader.id })}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteTrader.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
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
                          MT Account <span className="font-mono">{mcStatus.mtAccount}</span> exists in MetaCopier
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
                        <p className="font-semibold text-lg">Account Not Found</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          MT Account <span className="font-mono">{mcStatus.mtAccount}</span> does not exist in MetaCopier
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
                <Button onClick={handleCreateMcAccount} disabled={createMcAccount.isPending}>
                  {createMcAccount.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Account
                </Button>
              )}
              <Button variant="outline" onClick={() => setMcStatusDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
