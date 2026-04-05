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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, Send, Copy, ExternalLink, Download, AlertCircle, Wallet, Loader2 } from "lucide-react";
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

export default function ManagePayments() {
  const [selectedTraderId, setSelectedTraderId] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().slice(0, 16));
  const [amount, setAmount] = useState<string>("");
  const [networkFee, setNetworkFee] = useState<string>("0");
  const [transactionHash, setTransactionHash] = useState<string>("");
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [proofDialogOpen, setProofDialogOpen] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [paymentMode, setPaymentMode] = useState<"manual" | "wallet">("manual");

  const { data: traders, isLoading: tradersLoading } = trpc.admin.getAllTraders.useQuery();
  const { data: paymentHistory, isLoading: paymentsLoading, refetch: refetchPayments } = trpc.admin.getAllPayments.useQuery();
  const { data: walletInfo } = trpc.admin.getWalletInfo.useQuery(undefined, { refetchInterval: 30_000 });
  const makePaymentMutation = trpc.admin.makePayment.useMutation();
  const sendWalletPaymentMutation = trpc.admin.sendWalletPayment.useMutation();

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

  const handleMakePayment = () => {
    if (paymentMode === "manual") {
      if (!selectedTraderId || !amount || !transactionHash) {
        toast.error("Please fill in all required fields");
        return;
      }
    } else {
      if (!selectedTraderId || !amount) {
        toast.error("Please select a trader and enter an amount");
        return;
      }
      const selectedTrader = traders?.find(t => t.id === parseInt(selectedTraderId));
      if (!selectedTrader?.usdtAddress || !selectedTrader?.usdtNetwork) {
        toast.error("Selected trader has no USDT address configured");
        return;
      }
    }
    setConfirmDialogOpen(true);
  };

  const resetForm = () => {
    setSelectedTraderId("");
    setAmount("");
    setNetworkFee("0");
    setTransactionHash("");
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    setPaymentDate(`${year}-${month}-${day}T${hours}:${minutes}`);
  };

  const handleConfirmPayment = async () => {
    setConfirmDialogOpen(false);
    try {
      if (paymentMode === "wallet") {
        const result = await sendWalletPaymentMutation.mutateAsync({
          magicNumberId: parseInt(selectedTraderId),
          amount: parseFloat(amount),
        });
        toast.success(`Payment sent on-chain! TX: ${result.txHash.substring(0, 12)}...`);
      } else {
        await makePaymentMutation.mutateAsync({
          magicNumberId: parseInt(selectedTraderId),
          amount: parseFloat(amount),
          networkFee: parseFloat(networkFee),
          transactionHash,
          paymentDate: new Date(paymentDate),
        });
        toast.success("Payment recorded and trader notified");
      }

      resetForm();
      refetchPayments();
    } catch (error: any) {
      toast.error(error?.message || "Payment failed");
    }
  };

  const handleExportCSV = () => {
    if (!paymentHistory || paymentHistory.length === 0) {
      toast.error("No payment history to export");
      return;
    }
    const headers = ["Date", "Trader", "Magic Number", "Amount (USDT)", "Network", "Network Fee (USDT)", "Transaction Hash"];
    const rows = paymentHistory.map((p) => [
      new Date(p.paymentDate).toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }),
      p.traderName,
      p.magicNumber,
      p.amount.toFixed(2),
      p.network || 'TRC20',
      (p.networkFee || 0).toFixed(2),
      p.transactionHash,
    ]);
    const csvContent = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `payments_export_${today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Payment history exported");
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
          {/* Wallet Info Card */}
          {(walletInfo?.trc20 || walletInfo?.erc20) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="w-5 h-5" />
                  Wallet Balances
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {walletInfo.trc20 && (
                    <div className="p-4 bg-muted/50 rounded-lg border space-y-2">
                      <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        TRC-20 (TRON)
                        {walletInfo.trc20.gasFreeEnabled && (
                          <span className="text-[10px] font-semibold bg-green-500/20 text-green-600 px-1.5 py-0.5 rounded">GasFree</span>
                        )}
                      </div>
                      {walletInfo.trc20.gasFreeEnabled && walletInfo.trc20.gasFreeBalance ? (
                        <>
                          <div className="text-2xl font-bold">{walletInfo.trc20.gasFreeBalance} USDT</div>
                          <div className="text-xs text-muted-foreground">GasFree wallet</div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground truncate">{walletInfo.trc20.gasFreeAddress}</span>
                            <button
                              onClick={() => { navigator.clipboard.writeText(walletInfo.trc20!.gasFreeAddress!); toast.success("GasFree address copied"); }}
                              className="p-1 hover:bg-accent rounded shrink-0"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 pt-1 border-t">
                            Main wallet: {walletInfo.trc20.usdtBalance} USDT
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-2xl font-bold">{walletInfo.trc20.usdtBalance} USDT</div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground truncate">{walletInfo.trc20.address}</span>
                            <button
                              onClick={() => { navigator.clipboard.writeText(walletInfo.trc20!.address); toast.success("Address copied"); }}
                              className="p-1 hover:bg-accent rounded shrink-0"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {walletInfo.erc20 && (
                    <div className="p-4 bg-muted/50 rounded-lg border space-y-2">
                      <div className="text-sm font-medium text-muted-foreground">ERC-20 ({walletInfo.erc20.chainName})</div>
                      <div className="text-2xl font-bold">{walletInfo.erc20.usdtBalance} USDT</div>
                      <div className="text-sm text-muted-foreground">
                        Gas: {parseFloat(walletInfo.erc20.nativeBalance).toFixed(4)} {walletInfo.erc20.chainName === "EVM" ? "ETH" : walletInfo.erc20.chainName === "Polygon" ? "MATIC" : "ETH"}
                      </div>
                      {parseFloat(walletInfo.erc20.nativeBalance) < 0.01 && (
                        <div className="flex items-center gap-1 text-xs text-amber-500">
                          <AlertCircle className="w-3 h-3" />
                          Low gas balance
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground truncate">{walletInfo.erc20.address}</span>
                        <button
                          onClick={() => { navigator.clipboard.writeText(walletInfo.erc20!.address); toast.success("Address copied"); }}
                          className="p-1 hover:bg-accent rounded shrink-0"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Make Payment</CardTitle>
              <CardDescription>
                {paymentMode === "wallet" ? "Send USDT directly from the server wallet" : "Record a payment already sent externally"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Payment mode toggle */}
              <Tabs value={paymentMode} onValueChange={(v) => setPaymentMode(v as "manual" | "wallet")}>
                <TabsList className="w-full">
                  <TabsTrigger value="manual" className="flex-1">Record Manual</TabsTrigger>
                  <TabsTrigger value="wallet" className="flex-1" disabled={!walletInfo?.trc20 && !walletInfo?.erc20}>
                    <Wallet className="w-4 h-4 mr-2" />
                    Send from Wallet
                  </TabsTrigger>
                </TabsList>
              </Tabs>

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

                {paymentMode === "manual" && (
                  <div className="space-y-2">
                    <Label htmlFor="paymentDate">Payment Date & Time</Label>
                    <Input
                      id="paymentDate"
                      type="datetime-local"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                    />
                  </div>
                )}

                {paymentMode === "wallet" && selectedTraderId && (() => {
                  const selectedTrader = traders?.find(t => t.id === parseInt(selectedTraderId));
                  const network = selectedTrader?.usdtNetwork;
                  const sourceBalance = network === "ERC20"
                    ? walletInfo?.erc20?.usdtBalance
                    : (walletInfo?.trc20?.gasFreeEnabled && walletInfo?.trc20?.gasFreeBalance)
                      ? walletInfo.trc20.gasFreeBalance
                      : walletInfo?.trc20?.usdtBalance;
                  return (
                    <div className="space-y-2">
                      <Label>Source Wallet ({network || "Not Set"})</Label>
                      <div className="text-sm text-muted-foreground p-2 bg-muted/50 rounded border">
                        {sourceBalance ? `${sourceBalance} USDT available` : "Wallet not configured for this network"}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className={paymentMode === "manual" ? "grid grid-cols-3 gap-4" : ""}>
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

                {paymentMode === "manual" && (
                  <>
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
                  </>
                )}
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
                if (paymentMode === "wallet") {
                  return (
                    <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-amber-600">
                      <AlertCircle className="w-4 h-4 inline mr-2" />
                      This trader has no USDT address configured. They need to set one in their dashboard first.
                    </div>
                  );
                }
                return null;
              })()}

              {paymentMode === "manual" ? (
                <Button
                  onClick={handleMakePayment}
                  disabled={makePaymentMutation.isPending || !selectedTraderId || !amount || !transactionHash}
                  className="w-full"
                >
                  <Send className="w-4 h-4 mr-2" />
                  {makePaymentMutation.isPending ? "Recording Payment..." : "Payment Has Been Made"}
                </Button>
              ) : (
                <Button
                  onClick={handleMakePayment}
                  disabled={sendWalletPaymentMutation.isPending || !selectedTraderId || !amount}
                  className="w-full"
                >
                  {sendWalletPaymentMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending on-chain...
                    </>
                  ) : (
                    <>
                      <Wallet className="w-4 h-4 mr-2" />
                      Send USDT from Wallet
                    </>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle>Payment History</CardTitle>
                <CardDescription>
                  Record of all payments made to traders
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!paymentHistory || paymentHistory.length === 0}>
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
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

      {/* Payment Confirmation Dialog */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              Confirm Payment
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>Please review the payment details before confirming:</p>
                <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                  {(() => {
                    const trader = traders?.find(t => t.id === parseInt(selectedTraderId));
                    return (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Trader</span>
                          <span className="font-medium text-foreground">{trader?.name || '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Amount</span>
                          <span className="font-semibold text-foreground">{parseFloat(amount || '0').toFixed(2)} USDT</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Network</span>
                          <span className="font-medium text-foreground">{trader?.usdtNetwork || 'TRC20'}</span>
                        </div>
                        {paymentMode === "wallet" ? (
                          <>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">From</span>
                              <span className="font-mono text-xs text-foreground break-all max-w-[200px] text-right">
                                {trader?.usdtNetwork === "ERC20" ? walletInfo?.erc20?.address : walletInfo?.trc20?.address}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">To</span>
                              <span className="font-mono text-xs text-foreground break-all max-w-[200px] text-right">{trader?.usdtAddress}</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Network Fee</span>
                              <span className="font-medium text-foreground">{parseFloat(networkFee || '0').toFixed(2)} USDT</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">TX Hash</span>
                              <span className="font-mono text-xs text-foreground break-all max-w-[200px] text-right">{transactionHash}</span>
                            </div>
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>
                {paymentMode === "wallet" && (
                  <p className="text-amber-500 text-xs">This will send a real on-chain transaction. It cannot be reversed.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmPayment} disabled={makePaymentMutation.isPending || sendWalletPaymentMutation.isPending}>
              {(makePaymentMutation.isPending || sendWalletPaymentMutation.isPending)
                ? (paymentMode === "wallet" ? "Sending..." : "Recording...")
                : (paymentMode === "wallet" ? "Confirm & Send" : "Confirm Payment")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                      ? '/usdt-trc20.png'
                      : '/usdt-erc20.png'
                    }
                    alt={`USDT ${selectedPayment.network || 'Logo'}`}
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
