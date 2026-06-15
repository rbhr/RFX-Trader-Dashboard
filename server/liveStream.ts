/**
 * Phase 2 — live dashboard push over Server-Sent Events (SSE).
 *
 * Streams a trader's open positions (their live account, filtered by magic) from
 * the real-time socket cache, pushing whenever a fresh snapshot arrives. Purely
 * additive: the dashboard keeps polling as the fallback, so if this is disabled
 * or errors, nothing regresses.
 *
 * Gated by MC_LIVE_STREAM=true (server) — the client only connects when built
 * with VITE_LIVE_STREAM=true. Auth mirrors the tRPC tradingProcedure (the
 * rfx_trading_session cookie + expiry check).
 */

import type { Express, Request, Response } from "express";
import { getTradingSessionByToken } from "./db";
import { metaCopierService } from "./metacopier";
import { socketEvents } from "./metacopierSocket";
import { ENV } from "./_core/env";

const TRADING_SESSION_COOKIE = "rfx_trading_session";

export function registerLiveStreamRoutes(app: Express): void {
  if (!ENV.mcLiveStream) return;

  app.get("/api/live/positions", async (req: Request, res: Response) => {
    try {
      const token = req.cookies?.[TRADING_SESSION_COOKIE];
      const sessionData = token
        ? await getTradingSessionByToken(token)
        : undefined;
      if (!sessionData || new Date() > sessionData.session.expiresAt) {
        res.status(401).end();
        return;
      }

      const trader = sessionData.magicNumber;
      // Only normal traders with a live account stream; admin / view-as keep
      // polling (their position source is dynamic).
      if (trader.isAdmin || !trader.liveAccountNumber) {
        res.status(204).end();
        return;
      }
      const liveAccountId = await metaCopierService.getAccountIdByLoginNumber(
        trader.liveAccountNumber
      );
      if (!liveAccountId) {
        res.status(204).end();
        return;
      }
      const magic = trader.magicNumber;

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // disable proxy buffering
      });
      res.write("retry: 5000\n\n");

      let lastSent = 0;
      let inFlight = false;
      const send = async () => {
        if (inFlight) return;
        inFlight = true;
        try {
          const positions =
            await metaCopierService.getOpenPositionsFromAccount(
              liveAccountId,
              magic
            );
          res.write(`event: positions\ndata: ${JSON.stringify(positions)}\n\n`);
          lastSent = Date.now();
        } catch {
          /* transient — client still has its polled data */
        } finally {
          inFlight = false;
        }
      };

      const onUpdate = (payload: { accountId?: string }) => {
        if (payload?.accountId !== liveAccountId) return;
        if (Date.now() - lastSent < 2000) return; // per-connection debounce
        void send();
      };
      socketEvents.on("update", onUpdate);

      // Comment ping keeps the connection alive through idle proxies.
      const keepAlive = setInterval(() => {
        try {
          res.write(": ping\n\n");
        } catch {
          /* noop */
        }
      }, 25000);

      const cleanup = () => {
        socketEvents.off("update", onUpdate);
        clearInterval(keepAlive);
      };
      req.on("close", cleanup);

      void send(); // initial snapshot
    } catch {
      try {
        res.status(500).end();
      } catch {
        /* noop */
      }
    }
  });
}
