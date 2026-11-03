import { useCallback, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";

/**
 * The authenticator prompt in front of anything that moves money.
 *
 * Deliberately asked *before* the send rather than retried after a refusal.
 * A payout run is one call per trader, so re-running it after a mid-flight
 * expiry would pay the traders at the start of the list twice — the window is
 * confirmed up front instead, and a payment that still fails surfaces as a
 * failure rather than being quietly repeated.
 *
 * Admin-only, so English only, like the rest of /admin.
 */

/** Leave this much of the window, so a long run does not expire inside it. */
const MIN_REMAINING_MS = 90_000;

/** True for the sentinel assertPaymentElevation throws. */
export function isStepUpError(error: unknown): boolean {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error);
  return message.includes("PAYMENT_STEP_UP_REQUIRED");
}

export function usePaymentStepUp() {
  const { data: session, refetch } = trpc.trading.getSession.useQuery(undefined);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const verify = trpc.trading.verifyPaymentStepUp.useMutation({
    onSuccess: () => {
      setCode("");
      setOpen(false);
      void refetch();
      resolver.current?.(true);
      resolver.current = null;
    },
    onError: error => {
      toast.error(error.message);
    },
  });

  const settle = (ok: boolean) => {
    setOpen(false);
    setCode("");
    resolver.current?.(ok);
    resolver.current = null;
  };

  /**
   * Resolves true when this session may move money. Prompts for a code if the
   * window is missing or nearly up; false means the person cancelled.
   */
  const ensureElevated = useCallback(async (): Promise<boolean> => {
    if (!session?.totpEnabled) {
      toast.error(
        "Moving money requires an authenticator app. Set one up in Settings → Security."
      );
      return false;
    }
    // A code proves nothing if the authenticator itself was just swapped, so
    // say so rather than opening a prompt that cannot succeed.
    if (session.authenticatorHoldUntil) {
      const until = new Date(session.authenticatorHoldUntil);
      if (until.getTime() > Date.now()) {
        toast.error(
          `The authenticator on this account was changed recently, so payouts ` +
            `are held until ${until.toISOString().slice(0, 16).replace("T", " ")} UTC.`
        );
        return false;
      }
    }
    const expiresAt = session.paymentElevationExpiresAt
      ? new Date(session.paymentElevationExpiresAt).getTime()
      : 0;
    if (expiresAt - Date.now() > MIN_REMAINING_MS) return true;

    setOpen(true);
    return new Promise<boolean>(resolve => {
      resolver.current = resolve;
    });
  }, [
    session?.totpEnabled,
    session?.authenticatorHoldUntil,
    session?.paymentElevationExpiresAt,
  ]);

  const dialog = (
    <Dialog open={open} onOpenChange={next => (next ? setOpen(true) : settle(false))}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Confirm with your authenticator
          </DialogTitle>
          <DialogDescription>
            Moving money needs a fresh code. One code covers the next few
            minutes, so a payout run only asks once.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="stepUpCode">Authenticator code</Label>
          <Input
            id="stepUpCode"
            dir="ltr"
            maxLength={16}
            value={code}
            onChange={e => setCode(e.target.value.trim())}
            onKeyDown={e => {
              if (e.key === "Enter" && code.length >= 6) verify.mutate({ code });
            }}
            placeholder="6-digit code"
            autoFocus
            autoComplete="one-time-code"
            className="text-center text-2xl tracking-widest font-mono"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => settle(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => verify.mutate({ code })}
            disabled={code.length < 6 || verify.isPending}
          >
            {verify.isPending ? "Verifying…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { ensureElevated, dialog };
}
