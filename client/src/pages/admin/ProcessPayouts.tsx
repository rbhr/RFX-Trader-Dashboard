import { useLocation } from "wouter";
import AdminLayout from "@/components/AdminLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Banknote, ArrowLeft } from "lucide-react";

export default function ProcessPayouts() {
  const [, setLocation] = useLocation();

  return (
    <AdminLayout>
      <div className="p-8 space-y-6">
        <div className="flex items-center gap-3">
          <Banknote className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Process Payouts</h1>
            <p className="text-muted-foreground text-sm">
              Run weekly, fortnightly and ad-hoc payout batches.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => setLocation("/admin/payments")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Payments
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Payout batches</CardTitle>
            <CardDescription>
              Batch payout processing is coming soon.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-muted-foreground">
              <Banknote className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Payout batch processing will be available here.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
