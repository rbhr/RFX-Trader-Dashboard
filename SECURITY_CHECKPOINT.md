# Security Checkpoint

A standing list of findings from security reviews of auth/2FA, the custodial USDT payout
wallets, and the admin↔trader authorization boundary.

**Finding #1 below was exploited on 2026-11-02 before it was fixed.** It had been written
down on 2026-07-24, with the attack described almost exactly as it happened: *"the single
admin account can move funds from the custodial wallet, yet is protected by password only —
no second factor, any IP. Password phish → attacker logs in → drains hot wallet."* What
actually happened was simpler, because the admin password was still the account default. The
incident record is `/home/rfx/.claude/plans/precious-cooking-pretzel.md`; the remediation
shipped over v4.13.0–v4.18.0.

The lesson worth keeping is not about the finding. It is that a known, written-down,
ranked-first finding sat unactioned for four months, while the app logged
`password still default` for that account on every onboarding re-check — including twice
during the theft. Detection without action is not a control.

Reviewed 2026-07-24; status updated 2026-11-03.

## Context: what's already solid (no action needed)

- **Authorization boundary** — admin procedures all carry an `isAdmin` guard, and since
  v4.13.0 `tradingProcedure` itself refuses an admin session off the tailnet, so a new admin
  procedure cannot forget either check. `viewAsTraderId` / `masterAccountId` are gated behind
  an admin / `showAllData` check that traders cannot set on themselves. No cross-tenant read
  or action.
- **Payouts** — recipient address and amount always come from trusted DB values, never client
  input. Fund-sending is admin-only, needs a fresh authenticator code, and refuses a
  destination that moved in the last four hours. In-flight guards prevent double-sends, and
  the destination is now recorded on the payment row.
- **Monitors** — the only one that closes positions (`missedTradeMonitor`) acts solely on
  server-sourced account IDs and fails *closed* at every branch. The protected demo/slave
  account is never a target.
- **OTP/2FA mechanics** — CSPRNG codes, 5-min expiry, single-use, bound to trader+purpose,
  5-attempt cap. TOTP is RFC 6238 over node:crypto, tested against the published vectors, with
  replay refused by step and a 5-attempt cap. JWT pinned to HS256 (no alg-confusion).

## Findings

### 1. Admin login bypasses 2FA — FIXED v4.13.0–v4.15.0, after being exploited
- **Was:** `server/routers.ts` ended the new-device 2FA challenge with
  `&& !magicNumberData.isAdmin`, so admins were explicitly excluded. The admin row also had
  no `telegramChatId`, so it was exempt twice over and could never have received a code.
- **Exploited 2026-11-02**: login as `admin`/`admin` from a Google Cloud box, payout address
  of the Administrator row pointed at an attacker wallet, 2030 USDT sent, address restored.
  234 seconds.
- **Now:** the admin account is reachable only from the tailnet (`tda.rfx.capital`, three
  independent layers — unroutable address, a Caddy `remote_ip` guard, and the app's own check
  in `tradingProcedure`); an authenticator is required at sign-in and before any money moves;
  and the account default password can no longer go unnoticed, because the account is renamed
  and rotated. The `!isAdmin` clause still exists but is now unreachable in practice for the
  one admin account, which has TOTP enrolled.

### 2. Plaintext password fallback — STILL OPEN
- **Location:** `server/routers.ts`, `verifyPassword` — falls back to `password === hash` for
  any stored value that is not `$2a$`/`$2b$`-shaped.
- **Status:** re-checked 2026-11-02 during the incident — **0 rows are non-bcrypt**, so it was
  not how the attacker got in and is not currently exploitable. Latent foot-gun unchanged: any
  future seed or import that writes a plaintext password silently "works", and a database read
  would then expose usable credentials.
- **Fix:** return `false` for any non-bcrypt hash. Zero behavioural impact today; it is a
  two-line change and the cheapest item on this list.

### 3. Telegram username-binding takeover — STILL OPEN
- **Location:** `server/telegram.ts` — on `/start`, the bot binds the sender's chat ID to
  every trader whose stored `telegramHandle` equals the sender's *current* Telegram username,
  overwriting any existing binding.
- **Why it matters:** Telegram 2FA and password-reset codes go to that chat ID. If a trader's
  stored handle is an **unregistered or renamed** username, somebody can register it, `/start`,
  capture the binding, then run a password reset → account takeover. Narrow (needs a stale or
  free handle) but a real path.
- **Mitigated slightly** since v4.15.0: an account with an authenticator takes TOTP instead of
  the Telegram code for login and password change, so a captured binding is not sufficient for
  those. A password *reset* still goes through Telegram, and no trader has TOTP yet.
- **Fix:** don't overwrite an established `telegramChatId` without re-verification; bind via a
  dashboard-generated one-time token rather than a raw username match.

### 4. IP-based "known device" skips 2FA — HALF FIXED v4.16.0
- **Was:** any active session from the same egress IP was treated as trusted, skipping 2FA —
  and every stored IP was a *Cloudflare edge* address, so unrelated traders were matching each
  other. A trader's 2FA could be skipped for anybody who happened through the same edge.
- **Now:** `server/clientIp.ts` records the real client address, so the comparison is between
  actual devices. It also made the per-IP login rate limiter meaningful, which had been
  bucketing unrelated traders together.
- **Still open:** the recommendation to key device recognition on a **signed device cookie**
  rather than an IP. Mobile addresses rotate, so a real device still looks new sometimes —
  which errs towards asking for 2FA, the safe direction.

## Resolved since the 2026-07-24 review

- **`server/tron.ts` treated broadcast as success** — a TRC20 transfer that reverted on-chain
  recorded as paid and raised the payout baseline (silent underpayment). Now the send returns
  a `confirmed` flag, an unconfirmed payout is recorded `Pending`, and `paymentConfirmer`
  settles it to Confirmed or Failed and can undo the baseline advance.
- **"Load failed" on an already-successful payout** — a slow TRON broadcast outlasted the
  browser fetch timeout, so the client reported failure for a payout that completed. The send
  now returns as soon as it is broadcast and the UI says "Payment broadcast — confirming
  on-chain" rather than claiming either outcome.

## Suggested order when resuming

**#2** first: two lines, no behavioural change today, and it is the last way a database read
could yield a usable credential. **#3** next, and it needs a small design change (token-based
Telegram linking) — it is the remaining account-takeover path, and the one the 2 November
attacker tried first, at 06:17, before pivoting to the admin account. **#4**'s device cookie
is hardening and can wait.
