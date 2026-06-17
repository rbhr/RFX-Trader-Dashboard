import { useEffect } from "react";
import { trpc } from "@/lib/trpc";

type PositionInput =
  | { viewAsTraderId?: number; masterAccountId?: string }
  | undefined;
type ViewAsInput = { viewAsTraderId?: number } | undefined;

/**
 * Phase 2 — overlay live data onto the polled query caches via SSE: open
 * positions (getOpenPositions, keyed by the positions view) and the trader's
 * account balance/equity (getAccountEquity / getAccountBalanceAndEquity, keyed
 * by the view-as input).
 *
 * Purely additive: only connects when built with VITE_LIVE_STREAM=true (and the
 * server has MC_LIVE_STREAM=true). On any error the EventSource is closed and the
 * existing `refetchInterval` polling remains the source of truth, so this can
 * never regress the dashboard.
 */
export function useLivePositions(
  input: PositionInput,
  viewAsInput: ViewAsInput,
  enabled: boolean
): void {
  const utils = trpc.useUtils();
  const key = JSON.stringify(input ?? null);

  useEffect(() => {
    if (!enabled) return;
    if ((import.meta as any).env?.VITE_LIVE_STREAM !== "true") return;
    if (typeof EventSource === "undefined") return;

    // Pass the current view (admin view-as / selected master) so the server
    // resolves the same accounts the polled query does.
    const params = new URLSearchParams();
    if (input?.viewAsTraderId != null)
      params.set("viewAsTraderId", String(input.viewAsTraderId));
    if (input?.masterAccountId) params.set("masterAccountId", input.masterAccountId);
    const qs = params.toString();
    const es = new EventSource(
      `/api/live/positions${qs ? `?${qs}` : ""}`,
      { withCredentials: true }
    );

    const onPositions = (ev: MessageEvent) => {
      try {
        const positions = JSON.parse(ev.data);
        utils.trading.getOpenPositions.setData(input, positions);
      } catch {
        /* ignore malformed payload — polling still updates the cache */
      }
    };
    es.addEventListener("positions", onPositions as EventListener);

    const onAccount = (ev: MessageEvent) => {
      try {
        const acct = JSON.parse(ev.data) as {
          balance: number | null;
          equity: number | null;
        };
        // Equity/balance queries are keyed by the view-as input, not the
        // positions input (which may include a master account).
        utils.trading.getAccountEquity.setData(viewAsInput, acct.equity ?? null);
        if (acct.balance != null && acct.equity != null) {
          utils.trading.getAccountBalanceAndEquity.setData(viewAsInput, {
            balance: acct.balance,
            equity: acct.equity,
          });
        }
      } catch {
        /* ignore malformed payload — polling still updates the cache */
      }
    };
    es.addEventListener("account", onAccount as EventListener);

    return () => {
      es.removeEventListener("positions", onPositions as EventListener);
      es.removeEventListener("account", onAccount as EventListener);
      es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);
}
