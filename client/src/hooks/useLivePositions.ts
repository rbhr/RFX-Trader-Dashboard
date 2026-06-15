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

    const es = new EventSource("/api/live/positions", {
      withCredentials: true,
    });

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
