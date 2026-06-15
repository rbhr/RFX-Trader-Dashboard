import { useEffect } from "react";
import { trpc } from "@/lib/trpc";

type PositionInput =
  | { viewAsTraderId?: number; masterAccountId?: string }
  | undefined;

/**
 * Phase 2 — overlay live open positions onto the polled query cache via SSE.
 *
 * Purely additive: only connects when built with VITE_LIVE_STREAM=true (and the
 * server has MC_LIVE_STREAM=true). On any error the EventSource is closed and the
 * existing `refetchInterval` polling remains the source of truth, so this can
 * never regress the dashboard.
 */
export function useLivePositions(input: PositionInput, enabled: boolean): void {
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

    return () => {
      es.removeEventListener("positions", onPositions as EventListener);
      es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);
}
