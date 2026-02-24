import { useState, useEffect } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { DollarSign, Send, Copy, ExternalLink } from "lucide-react";

export default function ManagePayments() {
  const [selectedTraderId, setSelectedTraderId] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().slice(0, 16));
  const [amount, setAmount] = useState<string>("");
  const [networkFee, setNetworkFee] = useState<string>("0");
  const [transactionHash, setTransactionHash] = useState<string>("");
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [proofDialogOpen, setProofDialogOpen] = useState(false);

  const { data: traders, isLoading: tradersLoading } = trpc.admin.getAllTraders.useQuery();
  const { data: paymentHistory, isLoading: paymentsLoading, refetch: refetchPayments } = trpc.admin.getAllPayments.useQuery();
  const makePaymentMutation = trpc.admin.makePayment.useMutation();

  // Update payment date to current time on mount
  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      // Get local datetime in YYYY-MM-DDTHH:mm format
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const localDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
      setPaymentDate(localDateTime);
    };
    updateDateTime();
    // Update every minute to keep it current
    const interval = setInterval(updateDateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleMakePayment = async () => {
    if (!selectedTraderId || !amount || !transactionHash) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      await makePaymentMutation.mutateAsync({
        magicNumberId: parseInt(selectedTraderId),
        amount: parseFloat(amount),
        networkFee: parseFloat(networkFee),
        transactionHash,
        paymentDate: new Date(paymentDate),
      });

      toast.success("Payment recorded and trader notified");
      
      // Reset form
      setSelectedTraderId("");
      setAmount("");
      setNetworkFee("0");
      setTransactionHash("");
      // Reset to current local time
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      setPaymentDate(`${year}-${month}-${day}T${hours}:${minutes}`);
      
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
                  <Label htmlFor="paymentDate">Payment Date & Time</Label>
                  <Input
                    id="paymentDate"
                    type="datetime-local"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (USDT)</Label>
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
                  <Label htmlFor="networkFee">Network Fee (USDT)</Label>
                  <Input
                    id="networkFee"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={networkFee}
                    onChange={(e) => setNetworkFee(e.target.value)}
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

              {/* USDT Address Display */}
              {selectedTraderId && (() => {
                const selectedTrader = traders?.find(t => t.id === parseInt(selectedTraderId));
                if (selectedTrader?.usdtAddress) {
                  return (
                    <div className="space-y-2 p-4 bg-muted/50 rounded-lg border">
                      <Label>Trader's USDT Address ({selectedTrader.usdtNetwork || 'Not Set'})</Label>
                      <div className="flex gap-2">
                        <Input
                          value={selectedTrader.usdtAddress}
                          readOnly
                          className="font-mono text-sm bg-background"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            navigator.clipboard.writeText(selectedTrader.usdtAddress!);
                            toast.success("USDT address copied to clipboard");
                          }}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

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
                    <div 
                      key={payment.id} 
                      className="border rounded-lg p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                      onClick={() => {
                        setSelectedPayment(payment);
                        setProofDialogOpen(true);
                      }}
                    >
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

      {/* Transmission Proof Dialog */}
      <Dialog open={proofDialogOpen} onOpenChange={setProofDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedPayment && (
            <div className="space-y-6">
              {/* Header with Logo */}
              <div className="text-center space-y-2">
                <div className="flex justify-center">
                  <img 
                    src={selectedPayment.network === 'TRC20' 
                      ? '/icons8-tether-50.png' 
                      : '/icons8-tether-502.png'
                    } 
                    alt="USDT Logo" 
                    className="w-16 h-16"
                  />
                </div>
                <h2 className="text-2xl font-bold">Withdrawn {selectedPayment.amount} USDT</h2>
                <div className="text-sm font-medium text-muted-foreground">
                  {selectedPayment.network || 'TRC20'}
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between py-4 border-y">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                    <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="font-medium">Status</span>
                </div>
                <span className="text-muted-foreground">Completed</span>
              </div>

              {/* Payment Details */}
              <div className="space-y-4">
                <div className="flex justify-between py-3 border-b">
                  <span className="text-muted-foreground">Address name</span>
                  <span className="font-medium">{selectedPayment.traderName}</span>
                </div>

                <div className="flex justify-between py-3 border-b">
                  <span className="text-muted-foreground">Address</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{selectedPayment.usdtAddress || 'N/A'}</span>
                    {selectedPayment.usdtAddress && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(selectedPayment.usdtAddress);
                          toast.success('Address copied');
                        }}
                        className="p-1 hover:bg-accent rounded"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex justify-between py-3 border-b">
                  <span className="text-muted-foreground">Network</span>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                    <span>{selectedPayment.network || 'TRC20'}</span>
                  </div>
                </div>

                <div className="flex justify-between py-3 border-b">
                  <span className="text-muted-foreground">Network fee</span>
                  <span>{selectedPayment.networkFee || 0} USDT</span>
                </div>

                <div className="flex justify-between py-3 border-b">
                  <span className="text-muted-foreground">Transaction ID</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">
                      {selectedPayment.transactionHash.substring(0, 8)}...{selectedPayment.transactionHash.substring(selectedPayment.transactionHash.length - 6)}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(selectedPayment.transactionHash);
                        toast.success('Transaction hash copied');
                      }}
                      className="p-1 hover:bg-accent rounded"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <a
                      href={selectedPayment.network === 'ERC20' 
                        ? `https://etherscan.io/tx/${selectedPayment.transactionHash}`
                        : `https://tronscan.org/#/transaction/${selectedPayment.transactionHash}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 hover:bg-accent rounded"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>

                <div className="flex justify-between py-3">
                  <span className="text-muted-foreground">Submitted time</span>
                  <span>
                    {new Date(selectedPayment.paymentDate).toLocaleString('en-US', {
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
    </AdminLayout>
  );
}
