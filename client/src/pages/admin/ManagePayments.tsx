import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { DollarSign, Send } from "lucide-react";

export default function ManagePayments() {
  const [selectedTraderId, setSelectedTraderId] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState<string>("");
  const [transactionHash, setTransactionHash] = useState<string>("");

  const { data: traders, isLoading: tradersLoading } = trpc.admin.getAllTraders.useQuery();
  const { data: paymentHistory, isLoading: paymentsLoading, refetch: refetchPayments } = trpc.admin.getAllPayments.useQuery();
  const makePaymentMutation = trpc.admin.makePayment.useMutation();

  const handleMakePayment = async () => {
    if (!selectedTraderId || !amount || !transactionHash) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      await makePaymentMutation.mutateAsync({
        magicNumberId: parseInt(selectedTraderId),
        amount: parseFloat(amount),
        transactionHash,
        paymentDate: new Date(paymentDate),
      });

      toast.success("Payment recorded and trader notified");
      
      // Reset form
      setSelectedTraderId("");
      setAmount("");
      setTransactionHash("");
      setPaymentDate(new Date().toISOString().split('T')[0]);
      
      // Refresh payment history
      refetchPayments();
    } catch (error) {
      toast.error("Failed to record payment");
    }
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    });
  };

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Manage Payments</h1>
          <p className="text-muted-foreground mt-2">
            Record payments and track payment history
          </p>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Make Payment</CardTitle>
              <CardDescription>
                Record a new payment to a trader
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="trader">Trader</Label>
                  <Select value={selectedTraderId} onValueChange={setSelectedTraderId}>
                    <SelectTrigger id="trader">
                      <SelectValue placeholder="Select trader" />
                    </SelectTrigger>
                    <SelectContent>
                      {tradersLoading ? (
                        <SelectItem value="loading" disabled>Loading traders...</SelectItem>
                      ) : traders && traders.length > 0 ? (
                        traders.map((trader) => (
                          <SelectItem key={trader.id} value={trader.id.toString()}>
                            {trader.name} - {trader.magicNumber}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="none" disabled>No traders available</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="paymentDate">Payment Date</Label>
                  <Input
                    id="paymentDate"
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (USD)</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="transactionHash">Transaction Hash</Label>
                  <Input
                    id="transactionHash"
                    placeholder="Enter transaction hash"
                    value={transactionHash}
                    onChange={(e) => setTransactionHash(e.target.value)}
                  />
                </div>
              </div>

              <Button 
                onClick={handleMakePayment} 
                disabled={makePaymentMutation.isPending || !selectedTraderId || !amount || !transactionHash}
                className="w-full"
              >
                <Send className="w-4 h-4 mr-2" />
                {makePaymentMutation.isPending ? "Recording Payment..." : "Payment Has Been Made"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment History</CardTitle>
              <CardDescription>
                Record of all payments made to traders
              </CardDescription>
            </CardHeader>
            <CardContent>
              {paymentsLoading ? (
                <div className="text-center py-12 text-muted-foreground">
                  Loading payment history...
                </div>
              ) : paymentHistory && paymentHistory.length > 0 ? (
                <div className="space-y-3">
                  {paymentHistory.map((payment) => (
                    <div key={payment.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-semibold">{payment.traderName} - {payment.magicNumber}</div>
                          <div className="text-sm text-muted-foreground">
                            {new Date(payment.paymentDate).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-primary">{formatCurrency(payment.amount)}</div>
                          <div className="text-xs text-muted-foreground">
                            {payment.notificationSent ? "✓ Notified" : "Pending notification"}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">
                        <div className="font-mono break-all">TX: {payment.transactionHash}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <DollarSign className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No payment history available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
