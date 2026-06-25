# Changelog

All notable changes to the RFX Trader Dashboard are documented here. The format
loosely follows [Keep a Changelog](https://keepachangelog.com/). The app carries
a single version in `package.json`, shown in the UI footer alongside the build
hash.

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
