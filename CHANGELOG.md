# Changelog

All notable changes to the RFX Trader Dashboard are documented here. The format
loosely follows [Keep a Changelog](https://keepachangelog.com/). The app carries
a single version in `package.json`, shown in the UI footer alongside the build
hash.

## [3.1.3] — 2026-08-15

### Added

- **Manual profit adjustment ("Adjust Profit").** When a copied trade is missed
  or mis-valued, an admin can apply a persistent ± correction to a trader's
  profit from the **Process Payouts** screen (an "Adjust Profit" button per row,
  alongside "Settle"). The delta is added to a running per-trader total and folds
  into cumulative realized profit, so it flows through the *next* payout once and
  is then absorbed by the high-water mark — never paid twice, and the HWM formula
  is unchanged. A negative adjustment gates future payouts until re-earned (never
  a negative send). The corrected figure shows in the trader's own **week, month
  and all-time** P&L **and** the admin's view of that trader (ManageTraders grid,
  "view as trader"), so both see the same number (today stays the pure live
  intraday figure). Every change is written to the Payment logs with
  old → new value and an optional reason. New `magic_numbers.profitAdjustment`
  column (requires `db:push`).

## [3.1.2] — 2026-08-15

### Fixed

- **Real-time socket reconnect flap.** The MetaCopier STOMP socket was
  reconnecting ~120–180×/hour around the clock: the outbound heartbeat ran on a
  single global 15s timer that aliased against the ~15s connected window, so
  whole windows went heartbeat-less and the server dropped the link (~20s kill
  window). Heartbeats now fire every 8s, started fresh and aligned on each
  `CONNECTED` (with an immediate first beat), and the declared `heart-beat` is
  `10000,10000` for real margin. The connection now holds indefinitely.

### Performance

- **Admin dashboard P&L speed.** Closed-position history was re-fetched from REST
  on every load and every 30–60s poll, and the today/week/month/all-time windows
  each looped the ~10 master accounts **serially** — one load fanned out to ~90
  uncached, mostly-duplicate REST calls (all-time alone ~14s serial), risking
  MetaCopier 429s. History is now served from a 30s coalesced cache keyed by
  `(account, range)` — with the magic-number filter applied per caller so admin
  and per-trader reads of the same window share one fetch — and the per-master
  fan-out runs in parallel. Cold fan-out dropped from ~14s to ~1.9s; polled and
  duplicate reads are near-instant.
- **REST timeout cap.** The MetaCopier REST client timeout was cut from 5 minutes
  to 15s so a slow or hung upstream call can no longer freeze a user-facing read
  for minutes.

## [3.0.3] — 2026-06-25

### Added

- This changelog.

## [3.0.2] — 2026-06-25

### Fixed

- **Trade direction colors.** REST-sourced positions carry no `type` field — the
  MetaCopier REST API encodes direction as `dealType` (`DealBuy`/`DealSell`) /
  `orderType` (`Buy`/`Sell`) — so Trade History (always REST) and the
  open-positions REST fallback rendered every trade red. Positions are now
  normalized centrally (`mapRestPosition`, mirroring the socket mapper) across
  all four REST fetches, so **BUY shows blue and SELL red** on both live and
  historic tables. This is the real fix behind the 3.0.1 color change.

## [3.0.1] — 2026-06-25

### Changed

- Trade badges colored by direction (blue BUY / red SELL) instead of the theme's
  `default`/`destructive` variants, both of which read red. (The color logic was
  correct but ineffective until the data fix in 3.0.2.)

## [3.0.0] — 2026-06-19

### Added

- **Process Payouts** — high-water-mark profit-share batch payouts. Tick-box
  trader grid with Select All, per-trader baseline ratchet, on-chain USDT sends
  (TRC20/ERC20), wallet-balance gating, and per-cycle waiting periods (Weekly
  ≥ 7 days, Fortnightly ≥ 14 days). Each payout fires the same Telegram
  notification and transmission proof as a manual payment.
- **Testing Mode** for payout runs — routes sends to a test wallet without
  touching real accounting, lifetime totals, baselines, or trader notifications.
- **Payout Cycle** field on traders (Weekly / Fortnightly / Self Service), with
  selectors on the add-trader and edit-trader forms.
- Payment **type** (Profit Share / Other) and **payout period** (from / to)
  columns; paginated payment history.

### Changed

- Payout waiting period gated on `payoutPeriodTo`.
- `beforeunload` warning while a payout run is in progress.
- Wallet Balances and Process Payouts cards evenly sized; edit-trader Payout
  Cycle moved below the Profit Share selector.

### Fixed

- `[TEST]` payouts no longer count toward the profit-share waiting-period check.
