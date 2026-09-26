# Changelog

All notable changes to the RFX Trader Dashboard are documented here. The format
loosely follows [Keep a Changelog](https://keepachangelog.com/). The app carries
a single version in `package.json`, shown in the UI footer alongside the build
hash.

## [4.0.9] — 2026-09-26

### Added

- **Traders are told when their live copier's state changes.** Setting a copier to Active,
  Manage only or Disabled — from the copiers dialog or the all-copiers header — sends the
  trader an in-app notification and a Telegram message in their language, and an English copy
  to the alerts channel. The all-copiers action sends one message per trader. The demo
  routing copier never triggers a message.

## [4.0.8] — 2026-09-26

### Changed

- **Manage Traders column choices follow the admin.** They were kept in the browser only, so
  another device or a cleared browser lost them. They are now saved on the server per admin
  (the browser copy remains as the first paint).

## [4.0.7] — 2026-09-26

### Added

- **Trader limits now mirrored onto their live copiers.** Saving max total lots or max open
  trades in Edit Trader writes the account guardrail as before AND the copier-level
  "Maximum lot" (total open lots, per symbol) and "Max open positions" on every live copier.
  Those copier limits *skip* a copy that would break them, so an oversized trade now stays on
  the incubator (where the guardrail closes it) instead of reaching live for a second and
  losing money. The figure is converted through each copier's copy settings — a 0.05 limit
  copied at 2x becomes 0.10 on the copier, a fixed-lot copier is capped at fixed lot × max
  open trades. New live copiers and copy-setting changes inherit the limits; Edit Trader
  shows a red note when a copier has drifted out of step. Existing copiers are brought in
  line the next time a trader's limits are saved (57 of 68 currently have none).
- **All-copiers D / M / A** in the Manage Traders header: sets every active trader's live
  copiers to Disabled, Manage only or Active after a confirmation. Demo routing copiers are
  never touched; the result is logged.

### Fixed

- **Copiers dialog showed no status and never greyed a button.** It read a `status` field
  MetaCopier copiers don't have. State is now derived from `active` + `monitorOnly`; D
  (Disabled, black), M (Manage only, yellow) and A (Active, blue) show the current one
  depressed in its colour, and the account number appears.
- **Removing a copier** checked the destination account for *any* open positions rather than
  this trader's, and a failed check let the removal through. It now checks only the trader's
  own positions on that account and blocks if the check fails. Removals and status changes
  are logged.

## [4.0.6] — 2026-09-21

### Added

- **Daily loss limit hits are recorded and announced.** MetaCopier enforces the max daily loss
  itself — closes everything, blocks new trades until rollover — and only logs it, so the
  dashboard recorded nothing and the trader was never told. The log monitor now picks up
  "Risk limit … was hit" lines, works out which limit it was, and for the daily one records
  it, tells the trader in-app and on Telegram (en/ur/ar) what their daily limit was and that
  they can resume after rollover, and logs it under Breach. One record per trader per day.
- **Risk Limit Breaches screen shows both kinds.** Total-equity breaches keep the Active and
  Resolved lists and "Re-enable Trading"; a new **Daily Loss Limit Hits** list shows the day's
  starting balance, equity at the hit, the loss, the limit and "Blocked until rollover" or
  "Lifted". Daily hits never count as active and have nothing to re-enable. New columns
  `risk_limit_breaches.breachType` and `referenceBalance`.
- **Alerts channel.** With `TELEGRAM_ALERT_CHANNEL_ID` set, an English copy of each risk
  message sent to a trader — equity breach, daily loss limit, lot-limit and max-open-trades
  closes, missed trade — also goes to that Telegram channel, whether or not the trader has
  Telegram linked. The bot must be an admin of the channel.

### Fixed

- The "is there already an active breach?" check looked only at the trader's latest breach
  row; it now looks for an unresolved equity breach, so a later row of another kind cannot
  hide one and cause it to be recorded twice.
- A percentage set on an *Actual* limit (not something the dashboard models) is now logged for
  the admin when MetaCopier hits it, instead of passing unseen.

### Deploy note

- Schema: adds `risk_limit_breaches.breachType` and `referenceBalance`. Add the columns before
  the new container starts, then confirm with `docker exec -it rfx-trader-dashboard pnpm db:push`.

## [4.0.5] — 2026-09-21

### Added

- **Limit-close monitor.** MetaCopier enforces a trader's lot limit (Trade Guardrails) and
  max open trades by closing the offending trade itself, within about a second, and only
  writes a line to its own log — so the trader saw a trade vanish and was never told why
  (Sameer 81301, 0.25 lots against a 0.04 limit on 2026-09-21; six other closes that day).
  The monitor reads that log, records each close under a new **Limit Closes** log category and
  tells the trader in-app and on Telegram, in their language. MetaCopier's socket has no log
  stream, so the account's own history/positions push triggers a log read about 1.5s later
  (2-3s end to end), with a 30s poll behind it; each read is one ~50KB request for the whole
  project. The position is persisted, so a restart neither repeats nor skips a close, and a
  close older than 30 minutes is logged but not sent.
- It reports the close; it cannot prevent it. By the time the guardrail closes the incubator
  trade the copier has usually already opened it on live. Keeping oversized trades off live
  needs copier-level limits kept in step with the account's — tracked as high priority in
  `todo.md`.

## [4.0.4] — 2026-09-20

### Added

- **"Other Copiers" in Edit Trader.** At the bottom of Copy Settings, a read-only list of every
  other account this trader's account copies into — account number and name, copy type, copy
  ratio, and whether it is enabled. The copier into the trader's current master is the one Copy
  Settings edits, so it is not repeated; the demo routing copier is marked as such.

### Changed

- **Toasts wait for each other and stay up longer.** Edit Trader can fire four saves at once,
  and their toasts stacked and expired together. `@/lib/toast` now shows one at a time, in
  order, for 5.5s instead of 4s (explicit durations are kept). Progress toasts are unaffected.

## [4.0.3] — 2026-09-20

### Fixed

- **Editing a trader did not check their demo copier or magic number.** Only Add Trader ran the
  MetaCopier link flow, so a trader added earlier with the 99999 placeholder kept it. Saving the
  Edit Trader dialog now links an MT account that already exists in MetaCopier, creates the demo
  copier (1x, no scaling) if it is missing, and replaces the 99999 placeholder with the real
  magic — setting the login password to it as well. An established trader's magic and password
  are never changed: a mismatch is reported instead. The check does not run for the grid's
  inline toggles, and never creates a live copier or renames an account made in MetaCopier.
- A failed read of a master's or the demo account's copiers could be mistaken for "no copier
  yet" and create a duplicate. Those reads now fail loudly instead.

## [4.0.2] — 2026-09-20

### Added

- **Copy Settings in Edit Trader and Add Trader.** Type (Multiplier or Fixed Lot) and a
  free-form value to 2 decimals. A multiplier is always sent as MetaCopier's "No scaling" type
  with that multiplier; a fixed lot as "Fixed lot size". Edit prefills from the trader's copier
  into their master account and only writes when the values change.
- **Changing a trader's master account sets up the new copier.** Saving asks "Save Settings and
  Change Master Account?", then creates a copier into the new master with the copy settings on
  the screen (news filter following the trader's news setting). It is created disabled unless
  "Start copying to the new master straight away" is ticked. The copier into the previous master
  is never disabled or changed; if the new master already has a copier from the trader, only its
  copy settings are updated.
- **Add Trader links an account that already exists in MetaCopier.** With a Master Account and
  copy settings now on the Add screen, saving a trader whose MT account is already in MetaCopier
  sets up the demo copier (1x, no scaling) to obtain the trader's magic number, updates the magic
  number in the dashboard, adds a disabled copier into the chosen master, and renames and labels
  the account — the same flow as "Create MetaCopier account", now shared code. An account already
  linked to another trader is refused rather than double-linked.

## [4.0.0] — 2026-09-19

### Added

- **Trading controls in Edit Trader.** Max daily loss (%), daily profit limit
  (%), max total lots, max open trades and a "News trading allowed" checkbox
  (default off). All five live in MetaCopier, not our database: the dialog reads
  them on open and writes back only the fields the admin changed. Max daily loss
  is the "Balance-equity daily" risk limit; the daily profit limit is feature 10
  with pause-instead-of-close; max total lots is Trade Guardrails with
  *aggregate per symbol* forced on; news trading is the News filter (feature 49)
  on every live copier, never the demo routing copier. Settings mirror
  "RFX - Bisma - 81279" and her copier into "01 exness Master 8220".
- **Max daily loss on the trader dashboard.** Shows today's dollar allowance and
  the equity at which the daily limit closes all trades, measured from the
  balance MetaCopier recorded at rollover.
- **Why trades are not being copied.** The dashboard now says "due to News" when
  the copier is active but its news filter is inside a blackout (with the symbol,
  event and end time), and "by your Administrator" when the copier is disabled.
  The blackout comes from MetaCopier's news-filter preview for the symbols the
  trader used in the last 30 days; the project id it needs is read from
  `GET /apiKeys/current`.
- New incubator accounts get aggregate-per-symbol guardrails, a 4% max daily loss
  and a 5% daily profit limit; new live copiers get the news filter.
- **Language selector: English, Urdu (اردو) and Arabic (العربية).** On the Login page, the
  trader Dashboard and History. English is the default. The choice is saved on the trader
  (`magic_numbers.language`) so it follows them across devices; a choice made on the Login
  page before signing in is saved once they are in. Urdu and Arabic mirror the layout
  right-to-left, while money, lots, prices, tickets, hashes and dates stay left-to-right
  with Western digits. Self-hosted Noto Sans Arabic gives both a consistent face.
- **Telegram messages and in-app notifications in the trader's language** — breach,
  trailing limit, missed trade, payment, onboarding, verification codes, the test message
  and the bot's /start replies. The admin **Logs** show each outgoing message in English
  and in the language it was sent in. System notifications store their translation key and
  params, so they follow the reader's language (an admin viewing as a trader reads English).
- `shared/i18n/` holds the three dictionaries. Urdu and Arabic are typed against English, so
  a missing translation fails the typecheck; `server/i18n.test.ts` checks placeholders and
  Telegram HTML tags line up.

### Changed

- **Edit Trader rearranged** into Trader, Profit Share & Payouts, Trading
  Account, Risk Controls, Lifetime Metrics, history and ShowMyTrades.
- **Dashboard wording.** "Maximum lots open at the same time" and "maximum trades
  open at the same time" replace the per-trade wording, and falling below the
  risk limit now reads as a permanent breach — on the dashboard, in the breach
  Telegram message and in both in-app breach notifications, none of which still
  tell the trader to ask an admin to re-enable trading.
- **Onboarding complete now also notifies in-app.** It was the one
  trader-facing Telegram message without an in-app twin. The notification
  leaves out the MT login details, since notifications are stored in plain text.
- **Profit share box** is titled Weekly or Fortnightly Profit Share after the
  trader's payout cycle, read from the session query rather than the slower P&L
  summary so the title is right while the figures are still loading.
- **Trader dashboard emphasis.** The max daily loss amount and its breach equity
  are bold red. A disabled copier reads "- Disabled by your Administrator", and
  the line warning that trades placed now do not count toward profit share is
  red.
- Admin screens, the payment (transmission) proof and admin-typed messages stay English by
  decision; `/admin/*` is always rendered in English, left-to-right.
- The breach toast on the dashboard now also says the account is permanently breached.

### Fixed

- **Profit share box ignored earlier losses.** It showed the share of any
  positive week, even when cumulative profit was still below the high-water
  mark. It now uses the payout formula, `max(0, cumulative − baseline) × share`,
  so it reads $0 until earlier losses are recovered.
- **Risk limit read from, and written to, the wrong MetaCopier limit.** The same
  first-active-limit selection fixed in the trailing monitor in 3.1.5 was still
  in the dashboard's risk limit, the breach monitor and the admin Risk Limit
  field, whose save path took `limits.find(l => l.active)`. On an account that
  lists its daily limit first, the dashboard and breach monitor used the daily
  limit's figure and an admin edit wrote the dollar stopout into the daily limit.
  All four now share `findActualRiskLimit` (riskType 4).
- **@RFXTraderBot ignored anything that was not exactly `/start`.** `/start <payload>` (what a
  t.me deep link sends), `/start@RFXTraderBot` and any other text got no reply and no log line,
  which looks the same as the bot being down. It now accepts the `/start` variants, answers
  other messages with a short pointer to `/start` (en/ur/ar), logs a failed `/start` as an
  error, and logs repeated polling conflicts, which mean a second bot instance is running.
- **Dashboard header overflowed on narrow windows.** With the language selector added, the
  six header controls no longer fit on one row and the last ones were pushed off-screen. The
  Dashboard and History headers now wrap.
- **Max open trades / max total lots could not be set to 0 in Edit Trader.** The dialog and
  the server both rejected 0, so the save was silently skipped. 0 (or a cleared field) now
  saves as MetaCopier's "no limit", and the trader dashboard says "no limit" rather than
  "unavailable".

### Deploy note

- Schema: adds `magic_numbers.language` and `notifications.i18nKey` / `i18nParams`. Add the
  columns **before** the new container starts (old code ignores them; new code selects them),
  then confirm with `docker exec -it rfx-trader-dashboard pnpm db:push`.

## [3.1.5] — 2026-09-07

### Fixed

- **Trailing risk limit wrote into the wrong MetaCopier limit.** The trailing
  monitor selected its target with `absoluteRiskLimit != null`, and `0.0` is not
  null, so it took whichever active limit the API happened to return first. On
  accounts that list the "Balance-equity daily" limit (riskType 1) ahead of the
  "Actual" limit (riskType 4), the trailing stopout was written into the daily
  limit — leaving the intended limit stale and putting a balance-minus-buffer
  figure on a limit configured as a percentage. It now matches on
  `riskType.id === 4` and never touches any other limit type. The 14 affected
  accounts had the stray absolute value on their daily limit reset to 0.

### Changed

- **Manage Traders manager filter.** Replaced the hardcoded `HubbFX` option,
  which matched no traders, with `RFX - Group 2`.

## [3.1.4] — 2026-08-16

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
