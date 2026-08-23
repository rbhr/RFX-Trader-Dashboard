# Security Checkpoint

Findings from a focused security review of auth/JWT/2FA, custodial USDT payout
wallets, and the admin↔trader authorization boundary. Dated **2026-07-24**.
Nothing here has been fixed yet — this is a to-do list to return to.

## Context: what's already solid (no action needed)

- **Authorization boundary** — 44 admin procedures, 44 matching `isAdmin` guards,
  no gaps. `viewAsTraderId` / `masterAccountId` gated behind an admin /
  `showAllData` check that traders cannot set on themselves. No cross-tenant read
  or action.
- **Payouts** — recipient address and amount always come from trusted DB values,
  never client input. Fund-sending is admin-only. In-flight guards prevent
  double-sends.
- **Monitors** — the only one that closes positions (`missedTradeMonitor`) acts
  solely on server-sourced account IDs and fails *closed* at every branch. The
  protected demo/slave account is never a target.
- **OTP/2FA mechanics** — CSPRNG codes, 5-min expiry, single-use, bound to
  trader+purpose, 5-attempt cap. JWT pinned to HS256 (no alg-confusion).

## Findings to action (ranked)

### 1. Admin login bypasses 2FA — MEDIUM→HIGH in context
- **Location:** `server/routers.ts:628-632` — the new-device 2FA challenge ends
  with `&& !magicNumberData.isAdmin`, so admins are explicitly excluded.
- **Why it matters:** the single admin account can move funds from the custodial
  wallet, yet is protected by password only — no second factor, any IP. Password
  phish → attacker logs in → drains hot wallet in $10k increments (create trader →
  set its payout address → `sendWalletPayment` as admin). 2FA is disabled for
  precisely the highest-value account.
- **Fix:** invert the logic so admins are *always* challenged for 2FA on login
  (at minimum for admins, not instead of them).

### 2. Plaintext password fallback — MEDIUM, currently dormant
- **Location:** `server/routers.ts:176-179` — `verifyPassword` falls back to
  `password === hash` for any non-bcrypt stored value.
- **Status:** verified against the DB on 2026-07-24 — **0 rows are non-bcrypt**,
  so not currently exploitable. Latent foot-gun: if any future seed/import writes
  a plaintext password it silently "works," and a DB read would expose usable
  credentials.
- **Fix:** remove the fallback — return `false` for any non-bcrypt hash. Zero
  behavioral impact today.

### 3. Telegram username-binding takeover — MEDIUM, conditional
- **Location:** `server/telegram.ts:66-94` — on `/start`, the bot binds the
  sender's chat ID to every trader whose stored `telegramHandle` equals the
  sender's *current* Telegram username, overwriting any existing binding.
- **Why it matters:** 2FA and password-reset codes go to that chat ID. If a
  trader's stored handle is an **unregistered or renamed** Telegram username, an
  attacker can register it, `/start`, capture the binding, then run password reset
  → account takeover. Narrow (needs a stale/free handle) but a real path.
- **Fix:** don't overwrite an established `telegramChatId` without re-verification;
  bind via a dashboard-generated one-time token rather than raw username match.

### 4. IP-based "known device" skips 2FA — LOW
- **Location:** `server/routers.ts:626` — any active session from the same egress
  IP is treated as trusted, skipping 2FA.
- **Why it matters:** on shared NAT/CGNAT, an attacker with the password and the
  same IP skips 2FA.
- **Fix:** use a device cookie instead of / in addition to the IP match.

## Non-security correctness note (not a vuln)

- `server/tron.ts:303` treats broadcast as success — a TRC20 transfer that reverts
  on-chain still records as paid and raises the trader's payout baseline (silent
  underpayment). The ERC20 path handles this correctly (`tx.wait` + revert check).
  Worth fixing when that path is next touched.

## UX gotcha — "Load failed" on already-successful payouts (not a vuln)

- **Symptom:** processing a batch of profit-share payouts, the client toast reports
  a trader as "Load failed" (Safari's fetch-timeout message) even though that
  payout actually completed. Observed 2026-07-24: a 3-payout batch showed "2/3 OK,
  1 load failed" for Varun (81308, $27.14) — yet on-chain that tx
  (`858bd3d9…`) confirmed SUCCESS to the correct wallet. All three were verified
  good on-chain (correct amount + recipient).
- **Cause:** each trader's payout is a separate `processProfitSharePayout` request.
  A slow TRON broadcast/confirm (~6 min here) outlasts the browser fetch timeout,
  so the client reports failure while the server completes the send, records the
  payment, sends the Telegram receipt, and raises the baseline. A **false
  negative**, not a lost payment.
- **Why it's low-risk today:** a naive retry of the "failed" payout is already
  blocked — the `inFlightWalletPayments` guard plus the baseline advance mean the
  recompute returns $0 owed on the next attempt, so no double-send. But the toast
  is misleading and invites a manual re-check every time.
- **Fix when touching the payout path:** either raise the client request timeout
  for payout mutations, or make the send fire-and-record server-side (return
  immediately with a "processing" state and reconcile status from the payments
  table / on-chain), so a slow broadcast doesn't surface as a scary "Load failed".
  Verification recipe used this time: match `payments` rows by time, then confirm
  each `transactionHash` via TronGrid `gettransactioninfobyid`
  (`receipt.result: SUCCESS`) and `/v1/transactions/{tx}/events` (recipient +
  amount vs the trader's `usdtAddress`).

## Suggested order when resuming

#1 and #2 are small, safe, high-value fixes (invert the admin 2FA check + harden
`verifyPassword`). #3 needs a small design change (token-based Telegram linking).
#4 is a hardening improvement. The Tron note is correctness, bundle it with any
payout-path work.
