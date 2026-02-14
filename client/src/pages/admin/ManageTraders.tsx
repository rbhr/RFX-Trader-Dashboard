import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function ManageTraders() {
  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Manage Traders</h1>
            <p className="text-muted-foreground mt-2">
              Add, edit, and manage trader accounts
            </p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Trader
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Trader Accounts</CardTitle>
            <CardDescription>
              List of all registered trading accounts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-muted-foreground">
              Trader management interface coming soon...
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
