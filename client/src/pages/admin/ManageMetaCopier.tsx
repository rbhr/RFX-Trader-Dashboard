import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, Users, Check, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function ManageMetaCopier() {
  const utils = trpc.useUtils();
  
  const { data: templates = [], isLoading } = trpc.copierTemplates.list.useQuery();
  const createTemplate = trpc.copierTemplates.create.useMutation();
  const updateTemplate = trpc.copierTemplates.update.useMutation();
  const deleteTemplate = trpc.copierTemplates.delete.useMutation();

  // Master assignment data
  const { data: masterAccounts = [], isLoading: mastersLoading } = trpc.admin.getRfxMasterAccounts.useQuery();
  const { data: allTraders = [], isLoading: tradersLoading } = trpc.admin.getTradersForMasterAssignment.useQuery();
  const assignTradersMutation = trpc.admin.assignTradersToMaster.useMutation();
  const unassignTraderMutation = trpc.admin.unassignTraderFromMaster.useMutation();

  // Confirm unassign state: { traderId, traderName }
  const [confirmUnassign, setConfirmUnassign] = useState<{ traderId: number; traderName: string } | null>(null);
  const [unassigningId, setUnassigningId] = useState<number | null>(null);

  // Per-master selected trader IDs: { [masterLoginAccountNumber]: Set<number> }
  const [masterSelections, setMasterSelections] = useState<Record<string, Set<number>>>({});
  const [savingMaster, setSavingMaster] = useState<string | null>(null);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    multiplier: "1.0000",
    copyStopLoss: true,
    copyTakeProfit: true,
    skipPendingOrders: true,
    scaleTypeId: 3,
    scaleTypeName: "Fixed lot size",
    active: false,
    monitorOnly: false,
    maxSlippage: 0,
    forceMinTrade: true,
    fixMasterBalanceAndEquity: "0.00",
    fixSlaveBalanceAndEquity: "0.00",
    fixedLotSize: "0.01",
    martingaleStrategy: false,
    openRetry: true,
    openRetryTimeoutInMinutes: 10,
    reverse: false,
    copyOpenPositions: false,
    maxOpenPositions: 0,
    maxLotSize: "0.00",
    maximumLot: "0.00",
    hideComment: false,
    forcePositionLotSize: false,
    ignoreContractSize: false,
    ignoreCurrency: false,
    copyMagicNumber: true,
    copyOriginalComment: false,
  });

  const handleCreate = () => {
    setSelectedTemplate(null);
    setFormData({
      name: "",
      description: "",
      multiplier: "1.0000",
      copyStopLoss: true,
      copyTakeProfit: true,
      skipPendingOrders: true,
      scaleTypeId: 3,
      scaleTypeName: "Fixed lot size",
      active: false,
      monitorOnly: false,
      maxSlippage: 0,
      forceMinTrade: true,
      fixMasterBalanceAndEquity: "0.00",
      fixSlaveBalanceAndEquity: "0.00",
      fixedLotSize: "0.01",
      martingaleStrategy: false,
      openRetry: true,
      openRetryTimeoutInMinutes: 10,
      reverse: false,
      copyOpenPositions: false,
      maxOpenPositions: 0,
      maxLotSize: "0.00",
      maximumLot: "0.00",
      hideComment: false,
      forcePositionLotSize: false,
      ignoreContractSize: false,
      ignoreCurrency: false,
      copyMagicNumber: true,
      copyOriginalComment: false,
    });
    setEditDialogOpen(true);
  };

  const handleEdit = (template: any) => {
    setSelectedTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || "",
      multiplier: template.multiplier,
      copyStopLoss: template.copyStopLoss,
      copyTakeProfit: template.copyTakeProfit,
      skipPendingOrders: template.skipPendingOrders,
      scaleTypeId: template.scaleTypeId,
      scaleTypeName: template.scaleTypeName,
      active: template.active,
      monitorOnly: template.monitorOnly,
      maxSlippage: template.maxSlippage,
      forceMinTrade: template.forceMinTrade,
      fixMasterBalanceAndEquity: template.fixMasterBalanceAndEquity,
      fixSlaveBalanceAndEquity: template.fixSlaveBalanceAndEquity,
      fixedLotSize: template.fixedLotSize,
      martingaleStrategy: template.martingaleStrategy,
      openRetry: template.openRetry,
      openRetryTimeoutInMinutes: template.openRetryTimeoutInMinutes,
      reverse: template.reverse,
      copyOpenPositions: template.copyOpenPositions,
      maxOpenPositions: template.maxOpenPositions,
      maxLotSize: template.maxLotSize,
      maximumLot: template.maximumLot,
      hideComment: template.hideComment,
      forcePositionLotSize: template.forcePositionLotSize,
      ignoreContractSize: template.ignoreContractSize,
      ignoreCurrency: template.ignoreCurrency,
      copyMagicNumber: template.copyMagicNumber,
      copyOriginalComment: template.copyOriginalComment,
    });
    setEditDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (selectedTemplate) {
        await updateTemplate.mutateAsync({ id: selectedTemplate.id, ...formData });
        alert("Template updated successfully");
      } else {
        await createTemplate.mutateAsync(formData);
        alert("Template created successfully");
      }
      utils.copierTemplates.list.invalidate();
      setEditDialogOpen(false);
    } catch (error: any) {
      alert(`Error: ${error.message || "Failed to save/delete template"}`);
    }
  };

  const handleDelete = async () => {
    if (!selectedTemplate) return;
    
    try {
      await deleteTemplate.mutateAsync({ id: selectedTemplate.id });
      alert("Template deleted successfully");
      utils.copierTemplates.list.invalidate();
      setDeleteDialogOpen(false);
      setSelectedTemplate(null);
    } catch (error: any) {
      alert(`Error: ${error.message || "Failed to save/delete template"}`);
    }
  };

  // Toggle a trader's selection for a given master
  const toggleTraderForMaster = (masterLoginAccountNumber: string, traderId: number) => {
    setMasterSelections(prev => {
      const current = new Set(prev[masterLoginAccountNumber] || []);
      if (current.has(traderId)) {
        current.delete(traderId);
      } else {
        current.add(traderId);
      }
      return { ...prev, [masterLoginAccountNumber]: current };
    });
  };

  const handleUnassign = async (traderId: number, traderName: string) => {
    setConfirmUnassign({ traderId, traderName });
  };

  const confirmUnassignAction = async () => {
    if (!confirmUnassign) return;
    setUnassigningId(confirmUnassign.traderId);
    try {
      await unassignTraderMutation.mutateAsync({ traderId: confirmUnassign.traderId });
      toast.success(`${confirmUnassign.traderName} unassigned`, {
        description: "Live account number has been cleared.",
      });
      utils.admin.getTradersForMasterAssignment.invalidate();
    } catch (err: any) {
      toast.error("Unassign failed", { description: err.message || "Could not unassign trader" });
    } finally {
      setUnassigningId(null);
      setConfirmUnassign(null);
    }
  };

  const handleAssignSave = async (masterLoginAccountNumber: string) => {
    const selected = masterSelections[masterLoginAccountNumber];
    if (!selected || selected.size === 0) {
      toast.warning("No traders selected", { description: "Please select at least one trader to assign." });
      return;
    }
    setSavingMaster(masterLoginAccountNumber);
    try {
      const result = await assignTradersMutation.mutateAsync({
        masterLoginAccountNumber,
        traderIds: Array.from(selected),
      });
      toast.success(`Assigned ${result.updated} trader${result.updated !== 1 ? 's' : ''}`, {
        description: `Live account number set to ${masterLoginAccountNumber}`,
      });
      // Clear selections and refresh traders
      setMasterSelections(prev => ({ ...prev, [masterLoginAccountNumber]: new Set() }));
      utils.admin.getTradersForMasterAssignment.invalidate();
    } catch (err: any) {
      toast.error("Assignment failed", { description: err.message || "Could not assign traders" });
    } finally {
      setSavingMaster(null);
    }
  };

  const handleScaleTypeChange = (value: string) => {
    const scaleTypeId = parseInt(value);
    const scaleTypeName = scaleTypeId === 3 ? "Fixed lot size" : "No scaling";
    setFormData({ ...formData, scaleTypeId, scaleTypeName });
  };

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Manage MetaCopier</h1>
          <p className="text-muted-foreground mt-2">
            Configure MetaCopier API settings and copier templates
          </p>
        </div>

        <div className="grid gap-6">
          {/* Copier Templates Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Copier Templates</CardTitle>
                  <CardDescription>
                    Manage reusable copier configuration templates
                  </CardDescription>
                </div>
                <Button onClick={handleCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Template
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading templates...</div>
              ) : templates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No templates yet. Create your first template to get started.
                </div>
              ) : (
                <div className="space-y-4">
                  {templates.map((template: any) => (
                    <div key={template.id} className="border rounded-lg p-4 flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">{template.name}</h3>
                        {template.description && (
                          <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
                        )}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm">
                          <div>
                            <span className="text-muted-foreground">Scale Type:</span>
                            <div className="font-medium">{template.scaleTypeName}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Fixed Lot Size:</span>
                            <div className="font-medium">{template.fixedLotSize}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Multiplier:</span>
                            <div className="font-medium">{template.multiplier}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Settings:</span>
                            <div className="font-medium">
                              {template.copyStopLoss && "SL"} {template.copyTakeProfit && "TP"} {template.skipPendingOrders && "Skip Pending"}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <Button variant="outline" size="sm" onClick={() => handleEdit(template)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => {
                            setSelectedTemplate(template);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Assign Traders to Master Accounts */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle>Assign Traders to Master Accounts</CardTitle>
                  <CardDescription className="mt-1">
                    Select traders to assign to each RFX Master account. Traders already assigned to a different master are greyed out and cannot be selected.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {mastersLoading || tradersLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading master accounts...</div>
              ) : masterAccounts.length === 0 ? (
                <div className="flex items-center gap-2 py-8 text-muted-foreground justify-center">
                  <AlertCircle className="h-4 w-4" />
                  <span>No accounts with the "RFX Master" label found in MetaCopier.</span>
                </div>
              ) : (
                <div className="space-y-6">
                  {masterAccounts.map((master: any) => {
                    const masterLogin = master.loginAccountNumber;
                    const selectedSet = masterSelections[masterLogin] || new Set<number>();
                    const isSaving = savingMaster === masterLogin;

                    // Traders already assigned to THIS master
                    const assignedToThisMaster = allTraders.filter(
                      (t: any) => t.liveAccountNumber === masterLogin
                    );

                    return (
                      <div key={master.id} className="border rounded-lg p-5 space-y-4">
                        {/* Master header */}
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold text-base">{master.alias}</h3>
                            <p className="text-sm text-muted-foreground font-mono">{masterLogin}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            {assignedToThisMaster.length > 0 && (
                              <Badge variant="secondary">
                                {assignedToThisMaster.length} assigned
                              </Badge>
                            )}
                            <Button
                              size="sm"
                              disabled={isSaving || selectedSet.size === 0}
                              onClick={() => handleAssignSave(masterLogin)}
                            >
                              {isSaving ? "Saving..." : `Save (${selectedSet.size} selected)`}
                            </Button>
                          </div>
                        </div>

                        {/* Currently assigned traders */}
                        {assignedToThisMaster.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Currently assigned</p>
                            <div className="flex flex-wrap gap-2">
                              {assignedToThisMaster.map((t: any) => (
                                <Badge
                                  key={t.id}
                                  variant="outline"
                                  className="text-xs flex items-center gap-1 pr-1"
                                >
                                  {t.name}
                                  <span className="font-mono ml-1 opacity-60">{t.magicNumber}</span>
                                  <button
                                    type="button"
                                    title={`Unassign ${t.name}`}
                                    disabled={unassigningId === t.id}
                                    onClick={() => handleUnassign(t.id, t.name)}
                                    className="ml-1 rounded-full hover:bg-destructive/20 hover:text-destructive p-0.5 transition-colors disabled:opacity-50"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Trader selection grid */}
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Select traders to assign</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                            {allTraders.map((trader: any) => {
                              const isAssignedElsewhere =
                                trader.liveAccountNumber !== null &&
                                trader.liveAccountNumber !== masterLogin;
                              const isSelected = selectedSet.has(trader.id);

                              return (
                                <button
                                  key={trader.id}
                                  type="button"
                                  disabled={isAssignedElsewhere}
                                  onClick={() => !isAssignedElsewhere && toggleTraderForMaster(masterLogin, trader.id)}
                                  className={[
                                    "flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-left transition-colors",
                                    isAssignedElsewhere
                                      ? "opacity-40 cursor-not-allowed bg-muted border-muted"
                                      : isSelected
                                      ? "bg-primary/10 border-primary text-primary font-medium cursor-pointer"
                                      : "hover:bg-muted cursor-pointer",
                                  ].join(" ")}
                                >
                                  <span className={[
                                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                                    isSelected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40",
                                  ].join(" ")}>
                                    {isSelected && <Check className="h-3 w-3" />}
                                  </span>
                                  <span className="flex-1 truncate">{trader.name}</span>
                                  <span className="font-mono text-xs opacity-60 shrink-0">{trader.magicNumber}</span>
                                  {isAssignedElsewhere && (
                                    <span className="text-xs opacity-60 shrink-0">({trader.liveAccountNumber})</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>API Configuration</CardTitle>
              <CardDescription>
                MetaCopier API credentials and settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                API configuration interface coming soon...
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit/Create Template Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedTemplate ? "Edit Template" : "Create Template"}</DialogTitle>
            <DialogDescription>
              Configure copier settings for this template
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Template Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Fixed Lot 0.01"
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="scaleType">Scale Type</Label>
                <Select value={formData.scaleTypeId.toString()} onValueChange={handleScaleTypeChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">Fixed lot size</SelectItem>
                    <SelectItem value="4">No scaling</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="fixedLotSize">Fixed Lot Size</Label>
                <Input
                  id="fixedLotSize"
                  type="number"
                  step="0.01"
                  value={formData.fixedLotSize}
                  onChange={(e) => setFormData({ ...formData, fixedLotSize: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="multiplier">Multiplier</Label>
                <Input
                  id="multiplier"
                  type="number"
                  step="0.0001"
                  value={formData.multiplier}
                  onChange={(e) => setFormData({ ...formData, multiplier: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="maxSlippage">Max Slippage</Label>
                <Input
                  id="maxSlippage"
                  type="number"
                  value={formData.maxSlippage}
                  onChange={(e) => setFormData({ ...formData, maxSlippage: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="copyStopLoss">Copy Stop Loss</Label>
                <Switch
                  id="copyStopLoss"
                  checked={formData.copyStopLoss}
                  onCheckedChange={(checked) => setFormData({ ...formData, copyStopLoss: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="copyTakeProfit">Copy Take Profit</Label>
                <Switch
                  id="copyTakeProfit"
                  checked={formData.copyTakeProfit}
                  onCheckedChange={(checked) => setFormData({ ...formData, copyTakeProfit: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="skipPendingOrders">Skip Pending Orders</Label>
                <Switch
                  id="skipPendingOrders"
                  checked={formData.skipPendingOrders}
                  onCheckedChange={(checked) => setFormData({ ...formData, skipPendingOrders: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="copyMagicNumber">Copy Magic Number</Label>
                <Switch
                  id="copyMagicNumber"
                  checked={formData.copyMagicNumber}
                  onCheckedChange={(checked) => setFormData({ ...formData, copyMagicNumber: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="openRetry">Open Retry</Label>
                <Switch
                  id="openRetry"
                  checked={formData.openRetry}
                  onCheckedChange={(checked) => setFormData({ ...formData, openRetry: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="forceMinTrade">Force Min Trade</Label>
                <Switch
                  id="forceMinTrade"
                  checked={formData.forceMinTrade}
                  onCheckedChange={(checked) => setFormData({ ...formData, forceMinTrade: checked })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!formData.name}>
              {selectedTemplate ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedTemplate?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unassign Trader Confirmation Dialog */}
      <Dialog open={!!confirmUnassign} onOpenChange={(open) => !open && setConfirmUnassign(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Unassign Trader</DialogTitle>
            <DialogDescription>
              Remove <strong>{confirmUnassign?.traderName}</strong> from this master account? Their live account number will be cleared and they will no longer copy this master.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmUnassign(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmUnassignAction}
              disabled={!!unassigningId}
            >
              {unassigningId ? "Removing..." : "Unassign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
