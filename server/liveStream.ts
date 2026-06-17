/**
 * Phase 2 — live dashboard push over Server-Sent Events (SSE).
 *
 * Streams open positions for whatever view the dashboard is showing — a trader's
 * own account, an admin viewing-as a trader, an admin's selected master account,
 * or the admin aggregate overview — pushing whenever a fresh snapshot for any of
 * the relevant accounts arrives on the real-time socket. Resolution mirrors
 * admin.getOpenPositions via the shared resolveViewPositions helper.
 *
 * Purely additive: the dashboard keeps polling as the fallback. Gated by
 * MC_LIVE_STREAM=true (server) + VITE_LIVE_STREAM=true (client build).
 */

import type { Express, Request, Response } from "express";
import { getTradingSessionByToken, getMagicNumberById } from "./db";
import { resolveViewPositions, metaCopierService } from "./metacopier";
import { socketEvents } from "./metacopierSocket";
import { ENV } from "./_core/env";
import { createDebug } from "./_core/debug";

const debug = createDebug("socket");
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
      const caller = sessionData.magicNumber;

      // Resolve the trader to view; admins may view-as another trader.
      const viewAsTraderId = req.query.viewAsTraderId
        ? Number(req.query.viewAsTraderId)
        : undefined;
      const masterAccountId =
        typeof req.query.masterAccountId === "string" && req.query.masterAccountId
          ? req.query.masterAccountId
          : undefined;

      let trader = caller;
      if (viewAsTraderId != null && !Number.isNaN(viewAsTraderId)) {
        if (!caller.isAdmin) {
          res.status(403).end();
          return;
        }
        const t = await getMagicNumberById(viewAsTraderId);
        if (!t) {
          res.status(404).end();
          return;
        }
        trader = t;
      }

      const showAllData = !!(trader.showAllData || trader.isAdmin);
      const plan = {
        isAdmin: !!trader.isAdmin,
        showAllData,
        magicNumber: trader.magicNumber,
        liveAccountNumber: trader.liveAccountNumber,
        masterAccountId,
      };

      // Equity/balance come from the trader's own incubator account (not the
      // positions-source master). Admin-overview has none → no account events.
      const equityAccountId = trader.mcAccountId ?? undefined;
      const initial = await resolveViewPositions(plan);
      const watched = new Set([
        ...initial.accountIds,
        ...(equityAccountId ? [equityAccountId] : []),
      ]);
      debug(
        `live stream OPEN: ${trader.name} admin=${trader.isAdmin} watching ${watched.size} account(s)`
      );

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.write("retry: 5000\n\n");

      let lastSent = 0;
      let inFlight = false;
      const pushAll = async (
        preResolved?: import("./metacopier").Position[]
      ) => {
        if (inFlight) return;
        inFlight = true;
        try {
          const positions =
            preResolved ?? (await resolveViewPositions(plan)).positions;
          res.write(`event: positions\ndata: ${JSON.stringify(positions)}\n\n`);
          if (equityAccountId) {
            const info =
              await metaCopierService.getAccountInfoById(equityAccountId);
            res.write(
              `event: account\ndata: ${JSON.stringify({
                balance: info.balance ?? null,
                equity: info.equity ?? null,
              })}\n\n`
            );
          }
          debug(
            `live push: ${positions.length} positions${equityAccountId ? " + account" : ""} → ${trader.name}`
          );
          lastSent = Date.now();
        } catch {
          /* transient — client keeps its polled data */
        } finally {
          inFlight = false;
        }
      };

      const onUpdate = (payload: { accountId?: string }) => {
        if (!payload?.accountId || !watched.has(payload.accountId)) return;
        if (Date.now() - lastSent < 2000) return; // per-connection debounce
        void pushAll();
      };
      socketEvents.on("update", onUpdate);

      const keepAlive = setInterval(() => {
        try {
          res.write(": ping\n\n");
        } catch {
          /* noop */
        }
      }, 25000);

      req.on("close", () => {
        socketEvents.off("update", onUpdate);
        clearInterval(keepAlive);
      });

      void pushAll(initial.positions); // initial snapshot
    } catch {
      try {
        res.status(500).end();
      } catch {
        /* noop */
      }
    }
  });
}
