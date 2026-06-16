/**
 * MetaCopier real-time Socket client (STOMP over WebSocket).
 *
 * Maintains ONE long-lived connection (project API key, subscribe-all) and an
 * in-memory cache of the latest account-information and open-position snapshots
 * per accountId. The REST read methods in metacopier.ts consult this cache first
 * and fall back to REST when it's missing/stale — so the socket is purely an
 * optimization layer and never a hard dependency.
 *
 * Protocol (see https://docs.metacopier.io/socket-api/api):
 *   - wss://api.metacopier.io/ws/api/v1, STOMP 1.2 over a native WebSocket
 *   - CONNECT carries the `api-key` header; project key => all accounts
 *   - SUBSCRIBE /user/queue/accounts/changes, then SEND /app/subscribe {accountIds:[]}
 *   - Server pushes UpdateAccountInformationDTO / UpdateOpenPositionsDTO /
 *     UpdateHistoryDTO, each a COMPLETE snapshot (no deltas)
 *
 * Hand-rolled framing (no @stomp/stompjs) so we add no dependency / lockfile churn;
 * Node 22 provides a global WebSocket.
 */

import { EventEmitter } from "events";
import { ENV } from "./_core/env";
import { createDebug } from "./_core/debug";
import { logEvent } from "./logStore";

const debug = createDebug("socket");

const SOCKET_URL =
  process.env.METACOPIER_SOCKET_URL ?? "wss://api.metacopier.io/ws/api/v1";
const HEARTBEAT_MS = 15000; // send a heartbeat well within the server's ~20s window
const RECONNECT_BASE_MS = 5000;
const RECONNECT_MAX_MS = 60000;

export interface SocketAccountInfo {
  balance?: number;
  equity?: number;
  leverage?: number;
  status?: string;
  connected?: boolean;
  drawdown?: number;
  profitThisMonth?: number;
  [k: string]: unknown;
}

export interface SocketPositionDTO {
  id: string | number;
  symbol?: string;
  dealType?: string;
  orderType?: string;
  magicNumber?: string | number;
  volume?: number;
  openPrice?: number;
  closePrice?: number;
  currentPrice?: number;
  profit?: number;
  netProfit?: number;
  swap?: number;
  commission?: number;
  openTime?: string;
  closeTime?: string;
  stopLoss?: number;
  takeProfit?: number;
  comment?: string;
  [k: string]: unknown;
}

interface CacheEntry {
  info?: SocketAccountInfo;
  infoTs?: number;
  openPositions?: SocketPositionDTO[];
  posTs?: number;
  history?: SocketPositionDTO[];
  histTs?: number;
}

const cache = new Map<string, CacheEntry>();

/** Emits "update" with { accountId } whenever a snapshot for that account arrives. */
export const socketEvents = new EventEmitter();
socketEvents.setMaxListeners(100); // many SSE connections may subscribe

let ws: WebSocket | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let started = false;
let connected = false;
let lastMessageAt = 0;
let messageCount = 0;
let recvBuffer = "";

function entry(accountId: string): CacheEntry {
  let e = cache.get(accountId);
  if (!e) {
    e = {};
    cache.set(accountId, e);
  }
  return e;
}

// ---- public cache getters (used by metacopier.ts) -------------------------

/** Latest account info if present and newer than maxAgeMs, else null. */
export function getCachedInfo(
  accountId: string,
  maxAgeMs: number
): SocketAccountInfo | null {
  const e = cache.get(accountId);
  if (!e?.info || !e.infoTs) return null;
  if (Date.now() - e.infoTs > maxAgeMs) return null;
  return e.info;
}

/** Latest open positions if present and newer than maxAgeMs, else null. */
export function getCachedPositions(
  accountId: string,
  maxAgeMs: number
): SocketPositionDTO[] | null {
  const e = cache.get(accountId);
  if (!e?.openPositions || !e.posTs) return null;
  if (Date.now() - e.posTs > maxAgeMs) return null;
  return e.openPositions;
}

export function socketStatus() {
  return {
    enabled: ENV.mcSocketEnabled,
    connected,
    accounts: cache.size,
    lastMessageAt: lastMessageAt || null,
  };
}

// ---- STOMP framing --------------------------------------------------------

function frame(
  command: string,
  headers: Record<string, string> = {},
  body = ""
): string {
  let f = command + "\n";
  for (const [k, v] of Object.entries(headers)) f += `${k}:${v}\n`;
  return f + "\n" + body + "\x00";
}

/** Apply a parsed DTO to the cache and emit an update. Exported for tests. */
export function ingestDto(dto: any): void {
  const type = dto?.type;
  const data = dto?.data;
  const accountId = data?.accountId;
  if (!type || !accountId) return;
  const e = entry(accountId);
  const now = Date.now();
  if (type === "UpdateAccountInformationDTO" && data.info) {
    e.info = data.info;
    e.infoTs = now;
  } else if (type === "UpdateOpenPositionsDTO") {
    e.openPositions = Array.isArray(data.openPositions) ? data.openPositions : [];
    e.posTs = now;
  } else if (type === "UpdateHistoryDTO") {
    e.history = Array.isArray(data.history) ? data.history : [];
    e.histTs = now;
  } else {
    return;
  }
  messageCount++;
  socketEvents.emit("update", { accountId, type });
}

function processFrame(chunk: string): void {
  if (!chunk || chunk === "\n" || chunk === "\r\n") return; // heartbeat
  const sep = chunk.indexOf("\n\n");
  const head = chunk.slice(0, sep < 0 ? chunk.length : sep);
  const body = sep < 0 ? "" : chunk.slice(sep + 2);
  const command = head.split("\n")[0].trim();
  if (command === "CONNECTED") {
    connected = true;
    reconnectAttempts = 0;
    debug("CONNECTED — subscribing to all accounts");
    logEvent("socket", "Real-time socket connected — subscribed to all accounts");
    send(
      frame("SUBSCRIBE", {
        id: "sub-0",
        destination: "/user/queue/accounts/changes",
      })
    );
    send(
      frame(
        "SEND",
        { destination: "/app/subscribe", "content-type": "application/json" },
        JSON.stringify({ accountIds: [] })
      )
    );
  } else if (command === "MESSAGE") {
    try {
      ingestDto(JSON.parse(body));
    } catch {
      /* ignore malformed frame body */
    }
  } else if (command === "ERROR") {
    console.warn("[socket] STOMP ERROR frame:", head.replace(/\n/g, " | "));
  }
}

function send(text: string): void {
  try {
    ws?.send(text);
  } catch (e) {
    debug("send failed", String(e));
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  const delay = Math.min(
    RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts),
    RECONNECT_MAX_MS
  );
  reconnectAttempts++;
  debug(`reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function connect(): void {
  const key = process.env.METACOPIER_API_KEY;
  if (!key) {
    console.warn("[socket] No METACOPIER_API_KEY — socket disabled");
    return;
  }
  recvBuffer = "";
  connected = false;
  let socket: WebSocket;
  try {
    socket = new WebSocket(SOCKET_URL);
  } catch (e) {
    console.warn("[socket] WebSocket construct failed:", String(e));
    scheduleReconnect();
    return;
  }
  ws = socket;

  socket.addEventListener("open", () => {
    debug("ws open — sending CONNECT");
    send(
      frame("CONNECT", {
        "accept-version": "1.2",
        "heart-beat": "20000,20000",
        "api-key": key,
      })
    );
  });

  socket.addEventListener("message", (ev: MessageEvent) => {
    lastMessageAt = Date.now();
    const raw =
      typeof ev.data === "string"
        ? ev.data
        : Buffer.from(ev.data as ArrayBuffer).toString("utf8");
    recvBuffer += raw;
    let nul: number;
    while ((nul = recvBuffer.indexOf("\x00")) >= 0) {
      const f = recvBuffer.slice(0, nul);
      recvBuffer = recvBuffer.slice(nul + 1);
      processFrame(f);
    }
  });

  socket.addEventListener("error", (ev: Event) => {
    debug("ws error", (ev as any)?.message ?? "");
  });

  socket.addEventListener("close", () => {
    const wasConnected = connected;
    connected = false;
    if (ws === socket) ws = null;
    if (started) {
      if (wasConnected) {
        logEvent("socket", "Real-time socket disconnected — reconnecting", "warn");
      }
      scheduleReconnect();
    }
  });
}

/** Start the socket client (idempotent). No-op when disabled or already running. */
export function startMetaCopierSocket(): void {
  if (!ENV.mcSocketEnabled) {
    console.log("[socket] MC_SOCKET_ENABLED=false — real-time socket disabled");
    return;
  }
  if (started) return;
  if (typeof WebSocket === "undefined") {
    console.warn("[socket] global WebSocket unavailable — socket disabled");
    return;
  }
  started = true;
  console.log("[socket] Starting MetaCopier real-time socket");
  connect();
  // Outgoing heartbeat so the server doesn't drop us after ~20s idle.
  heartbeatTimer = setInterval(() => {
    if (connected) send("\n");
  }, HEARTBEAT_MS);
  // Periodic cache visibility (debug "socket" only).
  setInterval(() => {
    debug(
      `cache: ${cache.size} accounts, ${messageCount} msgs, connected=${connected}`
    );
  }, 30000);
}

export function stopMetaCopierSocket(): void {
  started = false;
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  try {
    ws?.close();
  } catch {
    /* noop */
  }
  ws = null;
  connected = false;
}
