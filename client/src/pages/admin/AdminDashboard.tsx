import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import Dashboard from "@/pages/Dashboard";

export default function AdminDashboard() {
  const [selectedTraderId, setSelectedTraderId] = useState<string>("");
  const { data: traders, isLoading } = trpc.admin.getAllTraders.useQuery();

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Trader Dashboard</h1>
            <p className="text-muted-foreground mt-2">
              View any trader's dashboard as they see it
            </p>
          </div>
          <div className="w-[280px]">
            <Select value={selectedTraderId} onValueChange={setSelectedTraderId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a trader..." />
              </SelectTrigger>
              <SelectContent>
                {isLoading ? (
                  <SelectItem value="loading" disabled>Loading traders...</SelectItem>
                ) : traders && traders.length > 0 ? (
                  traders.map((t) => (
                    <SelectItem key={t.id} value={t.id.toString()}>
                      {t.name} - {t.magicNumber}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled>No traders</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedTraderId ? (
          // key remounts the Dashboard on trader switch so internal state
          // (master-account filter, dialogs) doesn't leak between traders
          <Dashboard
            key={selectedTraderId}
            viewAsTraderId={parseInt(selectedTraderId)}
            embedded
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Select a Trader</CardTitle>
              <CardDescription>
                Choose a trader from the dropdown above to view their dashboard
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                Select a trader to see their P&L, open positions, copier configuration, and payment history.
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
