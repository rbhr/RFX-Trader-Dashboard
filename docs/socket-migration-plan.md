# Plan: Migrate MetaCopier reads from REST polling to the Socket API

## Goal

Replace the polled REST reads (positions, equity/balance, recent history) with a
single push-based MetaCopier **Socket** stream, backed by an in-memory cache.
Lower latency (near-instant breach detection vs up-to-60s), far fewer REST calls
(kills most 429 pressure), and a path to a live dashboard. **All mutations stay
on REST** — the socket is a read/optimization layer, never a hard dependency.

## What we already know (spike, 2026-06-15 — confirmed working)

- `wss://api.metacopier.io/ws/api/v1`, **STOMP over WebSocket**. Node 22 has a
  global `WebSocket`; use `@stomp/stompjs` (handles framing/heartbeat/reconnect).
- Auth: `api-key` header in the STOMP CONNECT frame. Existing project-level
  `METACOPIER_API_KEY` grants access to **all** accounts.
- **One connection covers everything.** SUBSCRIBE `/user/queue/accounts/changes`,
  then SEND `/app/subscribe` with `{"accountIds": []}` (empty = all). New accounts
  auto-included. Limit 100 sessions/key; we use 1.
- Three message types, all **complete snapshots (no deltas)** → cache = last-write
  -wins per `accountId`:
  - `UpdateAccountInformationDTO` → `data.accountId`, `data.info` {`balance`,
    `equity`, `status`, `connected`, `drawdown`, `openPositions` bool, …}
  - `UpdateOpenPositionsDTO` → `data.accountId`, `data.openPositions: PositionDTO[]`
  - `UpdateHistoryDTO` → `data.accountId`, `data.history: PositionDTO[]` (last 24h)
- **`PositionDTO` verified to include** `profit`, `swap`, `commission`,
  `magicNumber` (string), `netProfit`, `currentPrice`, `symbol`, `volume`,
  `openTime`/`closeTime`, `openPrice`/`closePrice`, `stopLoss`, `takeProfit`,
  `dealType`, `comment`. → enough to compute floating P&L and filter by magic.
- Heartbeat ~20s (`heart-beat:20000,20000`), `reconnectDelay:5000`; server holds
  account "online" ~5min after disconnect. **Socket feature (type 25)** must be on
  each account — already added at creation in `server/metacopier.ts`.

## Scope

**Moves to socket (read path):**
- Open positions / live P&L (dashboard, filtered by `magicNumber`)
- Equity & balance (breach monitor + trailing risk limit) — event-driven
- Recent (24h) closed positions (recent history)

**Stays on REST (unchanged):**
- All mutations: account create/rename/label, copier CRUD, risk-limit CRUD,
  feature config.
- Full/lifetime history beyond 24h (socket only carries 24h).
- Cold-start / fallback reads when the socket cache is empty or stale.

## Architecture

### New: `server/metacopierSocket.ts` — connection + cache singleton
- Long-lived STOMP client (`@stomp/stompjs`), started once at server boot
  (alongside `startBreachMonitor` etc. in `server/_core/index.ts`).
- On connect: subscribe-all (`{accountIds: []}`). Handle reconnect/heartbeat via
  client config; log connect/disconnect/error transitions (behind a `socket`
  debug namespace — see `server/_core/debug.ts`).
- In-memory cache keyed by `accountId`:
  ```
  { info?: {balance, equity, status, connected, drawdown, ts},
    openPositions?: {positions: PositionDTO[], ts},
    history24h?: {positions: PositionDTO[], ts} }
  ```
- Public API (mirrors what routers/monitors need):
  - `getAccountInfoCached(accountId)` → info | null
  - `getOpenPositionsCached(accountId, magicNumber?)` → PositionDTO[] | null
  - `getHistory24hCached(accountId, magicNumber?)` → PositionDTO[] | null
  - `onAccountInfo(cb)` → event hook for the monitors
  - `isFresh(accountId, maxAgeMs)` → staleness guard
  - `status()` → {connected, accounts, lastMessageAt} for a health endpoint

### Read path: cache-first with REST fallback
Refactor the existing `metaCopierService` read methods (or add a thin resolver the
routers call) so each does: **return socket cache if fresh, else fall back to the
current REST call.** Keeps the tRPC API and the dashboard contract identical —
the dashboard keeps its `refetchInterval`s initially but is served from cache.
- `getOpenPositionsFromAccount` / `getOpenPositions` → cache filtered by magic
- `getAccountInfo*` → cache `info`
- history procedures → cache for ≤24h windows, REST for older/lifetime

### Monitors: event-driven
- **breachMonitor**: subscribe to `onAccountInfo`; on each equity update, compare
  to the trader's risk limit and trigger the existing breach logic. Keep a slow
  safety-net poll (e.g. every 5min) for accounts not seen recently.
- **trailingRiskLimit**: same hook (uses balance/equity).
- Both keep their current logic; only the *trigger* changes from `setInterval` to
  event + safety poll.

### Phase 2 (optional): live dashboard push
Stream cache updates to the browser via the app's own socket.io / SSE (the gateway
already routes `/api/` sockets — see `server/routers.ts` note). Removes client
`refetchInterval` polling for a truly live UI. Larger client change; deferred.

## Rollout (shadow-mode first)
1. Ship the socket layer + cache **without** changing any read path — just log
   coverage and compare cached vs REST values for a day (shadow mode).
2. Flip reads to cache-first with REST fallback.
3. Flip monitors to event-driven (safety poll retained).
4. (Later) Phase 2 live dashboard.
A feature flag / env toggle gates each cutover so we can revert instantly.

## Risks & mitigations
- **Partial coverage / staleness** → cache-first *with REST fallback* + freshness
  TTL; never treat socket as authoritative-only.
- **Account missing the Socket feature** → one-off audit that every `mcAccountId`
  has feature type 25; add if missing.
- **Reconnect storms / heartbeat** → `@stomp/stompjs` config; jittered backoff.
- **`magicNumber` typing** (string on socket vs number elsewhere) → normalize with
  `String()` when filtering (same care as existing copier matching).
- **Connection scale** → single connection covers all accounts (per docs), so this
  is a non-issue; monitor `status()`.

## Files
- `server/metacopierSocket.ts` (new) — connection + cache + events.
- `server/_core/index.ts` — start the socket client at boot.
- `server/metacopier.ts` — read methods become cache-first w/ REST fallback.
- `server/breachMonitor.ts`, `server/trailingRiskLimit.ts` — event-driven trigger.
- `server/_core/debug.ts` — `socket` debug namespace (already supports namespaces).
- `package.json` — add `@stomp/stompjs`.
- Tests: cache last-write-wins; magic filtering; REST fallback when stale; monitor
  fires on equity-below-limit event.

## Effort
- Phase 1 (socket layer + cache + cache-first reads + event-driven monitors,
  shadow → cutover): ~1.5–3 days.
- Phase 2 (live dashboard push): ~2–3 days.

## Open items
- Confirm `UpdateAccountInformationDTO.info` field names against a live sample for
  the exact `equity`/`balance`/`status` keys used by the monitors (spike saw the
  keys; pin types when building).
- Decide the freshness TTL per data type (e.g. info 90s, positions 30s) for the
  REST-fallback trigger.
