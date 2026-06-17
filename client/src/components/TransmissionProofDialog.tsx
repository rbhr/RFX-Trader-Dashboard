import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export interface ProofPayment {
  amount: number;
  network?: string | null;
  networkFee?: number | null;
  transactionHash: string;
  narration?: string | null;
  paymentDate: string | Date;
  traderName?: string | null;
  usdtAddress?: string | null;
}

/**
 * Read-only "transmission proof" receipt for a payout — used in the trader's
 * payment history (own dashboard, /history, and the admin's embedded trader
 * view). Mirrors the admin ManagePayments proof dialog without its editing.
 */
export function TransmissionProofDialog({
  payment,
  open,
  onOpenChange,
}: {
  payment: ProofPayment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const pending =
    !!payment && String(payment.transactionHash).startsWith("PENDING-");
  const explorer =
    payment && !pending
      ? payment.network === "ERC20"
        ? `https://etherscan.io/tx/${payment.transactionHash}`
        : `https://tronscan.org/#/transaction/${payment.transactionHash}`
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {payment && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <div className="flex justify-center">
                <img
                  src={payment.network === "ERC20" ? "/usdt-erc20.png" : "/usdt-trc20.png"}
                  alt={`USDT ${payment.network || "TRC20"}`}
                  className="w-16 h-16"
                />
              </div>
              <h2 className="text-2xl font-bold">
                Withdrawn {payment.amount} USDT
              </h2>
              <div className="text-sm font-medium text-muted-foreground">
                {payment.network || "TRC20"}
              </div>
            </div>

            <div className="flex items-center justify-between py-4 border-y">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="font-medium">Status</span>
              </div>
              <span className="text-muted-foreground">
                {pending ? "Pending confirmation" : "Completed"}
              </span>
            </div>

            <div className="space-y-4">
              {payment.traderName && (
                <div className="flex justify-between py-3 border-b">
                  <span className="text-muted-foreground">Address name</span>
                  <span className="font-medium">{payment.traderName}</span>
                </div>
              )}

              <div className="flex justify-between py-3 border-b">
                <span className="text-muted-foreground">Address</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm break-all">{payment.usdtAddress || "N/A"}</span>
                  {payment.usdtAddress && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(payment.usdtAddress!);
                        toast.success("Address copied");
                      }}
                      className="p-1 hover:bg-accent rounded shrink-0"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex justify-between py-3 border-b">
                <span className="text-muted-foreground">Network</span>
                <span>{payment.network || "TRC20"}</span>
              </div>

              <div className="flex justify-between py-3 border-b">
                <span className="text-muted-foreground">Network fee</span>
                <span>{payment.networkFee ?? 0} USDT</span>
              </div>

              <div className="flex justify-between py-3 border-b">
                <span className="text-muted-foreground">Transaction ID</span>
                {pending ? (
                  <span className="text-xs font-medium text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">
                    Pending confirmation
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">
                      {payment.transactionHash.substring(0, 8)}...
                      {payment.transactionHash.substring(payment.transactionHash.length - 6)}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(payment.transactionHash);
                        toast.success("Transaction hash copied");
                      }}
                      className="p-1 hover:bg-accent rounded"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    {explorer && (
                      <a href={explorer} target="_blank" rel="noopener noreferrer" className="p-1 hover:bg-accent rounded">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                )}
              </div>

              {payment.narration && (
                <div className="flex justify-between py-3 border-b">
                  <span className="text-muted-foreground">Transaction Narration</span>
                  <span className="text-right max-w-[300px]">{payment.narration}</span>
                </div>
              )}

              <div className="flex justify-between py-3">
                <span className="text-muted-foreground">Submitted time</span>
                <span>
                  {new Date(payment.paymentDate).toLocaleString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZoneName: "short",
                  })}
                </span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
