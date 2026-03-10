import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldAlert, CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "@/components/AdminLayout";

type Breach = {
  id: number;
  magicNumberId: number;
  traderName: string;
  magicNumber: string;
  equityAtBreach: number;
  riskLimitAtBreach: number;
  traderNotified: boolean;
  adminNotified: boolean;
  resolvedAt: Date | null;
  createdAt: Date | null;
};

export default function RiskLimitBreaches() {
  const [resolveTarget, setResolveTarget] = useState<Breach | null>(null);
  const [bulkResolveOpen, setBulkResolveOpen] = useState(false);
  const utils = trpc.useUtils();

  const { data: breaches, isLoading } = trpc.admin.getRiskLimitBreaches.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const resolveMutation = trpc.admin.resolveRiskLimitBreach.useMutation({
    onSuccess: () => {
      toast.success(`Trading re-enabled for ${resolveTarget?.traderName}`);
      setResolveTarget(null);
      utils.admin.getRiskLimitBreaches.invalidate();
      utils.admin.countActiveBreaches.invalidate();
    },
    onError: (err: any) => {
      toast.error(`Failed to resolve breach: ${err.message}`);
    },
  });

  const bulkResolveMutation = trpc.admin.bulkResolveBreaches.useMutation({
    onSuccess: (data) => {
      toast.success(`Trading re-enabled for ${data.resolved} trader${data.resolved !== 1 ? "s" : ""}`);
      setBulkResolveOpen(false);
      utils.admin.getRiskLimitBreaches.invalidate();
      utils.admin.countActiveBreaches.invalidate();
    },
    onError: (err: any) => {
      toast.error(`Bulk resolve failed: ${err.message}`);
    },
  });

  type BreachItem = NonNullable<typeof breaches>[number];
  const activeBreaches: BreachItem[] = breaches?.filter((b: BreachItem) => !b.resolvedAt) ?? [];
  const resolvedBreaches: BreachItem[] = breaches?.filter((b: BreachItem) => b.resolvedAt) ?? [];

  const formatDate = (d: Date | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleString();
  };

  return (
    <AdminLayout>
      <div className="p-8 space-y-6">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-7 w-7 text-destructive" />
          <div>
            <h1 className="text-2xl font-bold">Risk Limit Breaches</h1>
            <p className="text-muted-foreground text-sm">
              Traders whose equity dropped below their risk limit. Resolve to re-enable trading.
            </p>
          </div>
          {activeBreaches.length > 0 && (
            <>
              <Badge variant="destructive" className="ml-auto text-sm px-3 py-1">
                {activeBreaches.length} Active
              </Badge>
              <Button
                variant="outline"
                size="sm"
                className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => setBulkResolveOpen(true)}
                disabled={bulkResolveMutation.isPending}
              >
                <ShieldCheck className="h-4 w-4 mr-2" />
                Resolve All
              </Button>
            </>
          )}
        </div>

        {/* Active Breaches */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              Active Breaches
            </CardTitle>
            <CardDescription>
              These traders have had trading disabled due to equity falling below their risk limit.
              Click "Re-enable Trading" to restore access after reviewing the account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground text-sm py-4">Loading breaches...</p>
            ) : activeBreaches.length === 0 ? (
              <div className="flex items-center gap-2 text-muted-foreground py-6 justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span>No active breaches — all traders are within their risk limits.</span>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trader</TableHead>
                    <TableHead>Magic Number</TableHead>
                    <TableHead>Equity at Breach</TableHead>
                    <TableHead>Risk Limit</TableHead>
                    <TableHead>Breached At</TableHead>
                    <TableHead>Trader Notified</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeBreaches.map((breach) => (
                    <TableRow key={breach.id}>
                      <TableCell className="font-medium">{breach.traderName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{breach.magicNumber}</Badge>
                      </TableCell>
                      <TableCell className="text-destructive font-semibold">
                        ${breach.equityAtBreach.toFixed(2)}
                      </TableCell>
                      <TableCell>${breach.riskLimitAtBreach.toFixed(2)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(breach.createdAt)}
                      </TableCell>
                      <TableCell>
                        {breach.traderNotified ? (
                          <Badge variant="secondary" className="text-green-600">Yes</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">No</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => setResolveTarget(breach)}
                        >
                          Re-enable Trading
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Resolved Breaches */}
        {resolvedBreaches.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-muted-foreground" />
                Resolved Breaches
              </CardTitle>
              <CardDescription>Historical record of resolved risk limit breaches.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trader</TableHead>
                    <TableHead>Magic Number</TableHead>
                    <TableHead>Equity at Breach</TableHead>
                    <TableHead>Risk Limit</TableHead>
                    <TableHead>Breached At</TableHead>
                    <TableHead>Resolved At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resolvedBreaches.map((breach) => (
                    <TableRow key={breach.id} className="opacity-60">
                      <TableCell className="font-medium">{breach.traderName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{breach.magicNumber}</Badge>
                      </TableCell>
                      <TableCell className="text-destructive">
                        ${breach.equityAtBreach.toFixed(2)}
                      </TableCell>
                      <TableCell>${breach.riskLimitAtBreach.toFixed(2)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(breach.createdAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          {formatDate(breach.resolvedAt)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Confirm Re-enable Single Breach Dialog */}
      <AlertDialog open={!!resolveTarget} onOpenChange={() => setResolveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-enable Trading for {resolveTarget?.traderName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the breach as resolved and re-enable trading for{" "}
              <strong>{resolveTarget?.traderName}</strong> (Magic: {resolveTarget?.magicNumber}).
              <br /><br />
              Make sure you have reviewed the account and are satisfied the trader understands the
              risk limit before re-enabling.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (resolveTarget) {
                  resolveMutation.mutate({
                    breachId: resolveTarget.id,
                    magicNumberId: resolveTarget.magicNumberId,
                  });
                }
              }}
              disabled={resolveMutation.isPending}
            >
              {resolveMutation.isPending ? "Processing..." : "Re-enable Trading"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Bulk Resolve Dialog */}
      <AlertDialog open={bulkResolveOpen} onOpenChange={setBulkResolveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resolve All {activeBreaches.length} Active Breaches?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark all <strong>{activeBreaches.length}</strong> active breach
              {activeBreaches.length !== 1 ? "es" : ""} as resolved and re-enable trading for every
              affected trader simultaneously.
              <br /><br />
              Ensure you have reviewed all accounts before proceeding. Each trader will receive an
              in-app notification that their trading has been re-enabled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkResolveMutation.mutate()}
              disabled={bulkResolveMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkResolveMutation.isPending
                ? "Processing..."
                : `Re-enable ${activeBreaches.length} Trader${activeBreaches.length !== 1 ? "s" : ""}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
