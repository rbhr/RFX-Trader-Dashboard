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

A second review on 2026-11-03 went over the remediation code itself and found four more,
three of them in code written that day — they are #5–#7 below, plus independent confirmation
of #3. All are now fixed. That review arrived as a loose `rr.MD`; it is folded in here so
there is one standing list.

Reviewed 2026-07-24 and 2026-11-03; status updated 2026-11-03.

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

### 2. Plaintext password fallback — FIXED v4.18.1
- **Was:** `verifyPassword` fell back to `password === hash` for any stored value that was not
  `$2a$`/`$2b$`-shaped. Flagged 2026-07-24, re-confirmed by the 2026-11-03 review.
- **Status when fixed:** 0 of 33 rows non-bcrypt, so it was never how anyone got in, and
  removing it changed nothing — which is when to remove it.
- **Now:** an unsupported format is refused and written to the `auth` log, so a broken row is
  visible rather than a mystery. The on-login re-hash migration went with it; it could no
  longer be reached.

### 3. Telegram username-binding takeover — FIXED v4.18.1
- **Was:** on `/start`, the bot bound the sender's chat ID to every trader whose stored
  `telegramHandle` equalled the sender's *current* username, overwriting any existing binding.
  Telegram 2FA and password-reset codes go to that chat, so somebody who registered a trader's
  abandoned username could `/start`, capture the binding and run a password reset.
- **Now:** a bare `/start` only ever completes a **first** link — anything already bound keeps
  the chat ID it has, and the attempt is logged. Moving an account to a different Telegram
  needs a single-use token issued to a signed-in session (Settings → Account → **Connect
  Telegram**, `t.me/<bot>?start=<token>`, 15 minutes, spent by a conditional update so one
  token cannot bind twice).

### 4. IP-based "known device" skips 2FA — FIXED v4.16.0 and v4.18.2
- **Was:** any active session from the same egress IP was treated as trusted, skipping 2FA —
  and every stored IP was a *Cloudflare edge* address, so unrelated traders were matching each
  other. A trader's 2FA could be skipped for anybody who happened through the same edge.
- **v4.16.0** recorded the real client address, so the comparison became honest. It also made
  the per-IP login rate limiter meaningful, which had been bucketing unrelated traders.
- **v4.18.2** stopped trusting addresses altogether. A device is identified by a secret it was
  given in a cookie the first time it completed a full login, stored as a SHA-256 in
  `trusted_devices`. Precise in both directions: household and carrier NAT no longer make
  strangers look like the same device, and a phone changing cells no longer looks like a new
  one. Stateful rather than a signed stateless cookie so trust can lapse (180 days, refreshed
  on use) and be revoked — a password change or reset forgets every device, like it ends every
  session.

### 5. An existing authenticator could be replaced with only a session and password — FIXED v4.18.1
- **Was:** `startTotpEnrolment` verified the password, then `beginTotpEnrolment` immediately
  wrote the new secret over `totpSecret` and cleared `totpEnabledAt`, `totpLastStep` and the
  recovery codes. So a stolen session plus the password stripped the account's second factor
  and destroyed its ten recovery codes **before proving anything**, then let the holder confirm
  their own. The four-hour payout hold delayed spending; it did not prevent the takeover. A
  comment in that function claimed the opposite — that an abandoned enrolment could not lock
  anybody out — which was true of the new secret and false of the old one.
- **Now:** the new secret lands in a separate `totpPendingSecret` and nothing in force is
  touched until a code from the new device confirms it, so an abandoned or unwanted attempt
  leaves the account exactly as it was. Replacing a working authenticator additionally requires
  a current code from it, or one recovery code — recovery codes are accepted precisely so that
  a lost phone does not force a disable first, which is the thing being guarded. The payout
  hold is stamped on confirmation, when the factor actually changes.

### 6. Verification codes were not consumed atomically — FIXED v4.18.1
- **Was:** every code path read state and then wrote it. `consumeTotpCode` compared against a
  `totpLastStep` loaded earlier; `verifyTwoFactorCode` did `select … where used = false`
  followed by `update … where id = ?`. Two concurrent requests carrying one valid code both
  passed. It mattered most for recovery codes, where two simultaneous uses burnt one slot and
  granted two sessions.
- **Now:** every code is claimed by a conditional update that must report exactly one affected
  row — `claimTotpStep` (the step must advance), `claimRecoveryCodes` (compare-and-swap on the
  list as read), and `used = false` in the WHERE for Telegram codes.

### 7. Admin password edits bypassed session revocation — FIXED v4.18.1
- **Was:** `updateTrader` wrote a new password hash and revoked nothing, while the self-service
  change and reset paths both evicted sessions. An admin resetting a trader's password —
  exactly what you do when that trader reports a compromise — left the stolen session alive.
- **Now:** a password written from there evicts every session for that account and logs the
  count.

### 8. A stolen session could move the account's Telegram — FIXED v4.18.3
- **Was:** `createTelegramLinkToken` issued a rebinding link on a session cookie alone. Telegram
  is where this account's second factor is delivered, so a session was enough to redirect the
  channel: rebind the chat, then change the payout address with the 2FA code now arriving in
  the attacker's own Telegram, and wait for the next payout run. The 4.14.0 address 2FA would
  have been *satisfied* rather than defeated — the 2 November attack rebuilt out of the parts
  built to stop it. It is also what was tried first on 2 November, at 06:17, against trader
  51190.
- **Now:** the current password is required, plus the factor already on the account — an
  authenticator code, or a Telegram code to the chat being moved away from, which proves the
  caller still holds the channel they are abandoning. A first link has neither to prove and
  the password stands alone. Moving the chat holds payouts for the same cool-off as moving the
  address, stamped on a rebind and on an admin unlink. An admin can unlink
  (Edit Trader → Unlink Telegram) for a trader who has genuinely lost that Telegram, since
  they cannot read the code themselves — logged, and the hold applies.

### 9. Confirming an authenticator enrolment was not atomic — FIXED v4.18.3
- **Was:** `completeTotpEnrolment` verified against the pending secret it had loaded and then
  wrote unconditionally. Two confirmations of one enrolment both verified the same code — there
  is deliberately no spent-step guard on a first enrolment — and each generated its own ten
  recovery codes, so both reported success while only the last set stayed valid. The first
  caller was shown ten dead codes. A stale confirmation could also overwrite a newer enrolment.
  The same class as #6, in the one place the 4.18.1 fix had missed.
- **Now:** `claimPendingTotpSecret` promotes the secret only if the row still holds exactly the
  pending *and* active secrets that were verified, and must affect one row. The losing
  confirmation is told it failed rather than handed codes that will not work.

## Resolved since the 2026-07-24 review

- **`server/tron.ts` treated broadcast as success** — a TRC20 transfer that reverted on-chain
  recorded as paid and raised the payout baseline (silent underpayment). Now the send returns
  a `confirmed` flag, an unconfirmed payout is recorded `Pending`, and `paymentConfirmer`
  settles it to Confirmed or Failed and can undo the baseline advance.
- **"Load failed" on an already-successful payout** — a slow TRON broadcast outlasted the
  browser fetch timeout, so the client reported failure for a payout that completed. The send
  now returns as soon as it is broadcast and the UI says "Payment broadcast — confirming
  on-chain" rather than claiming either outcome.

## What is left

One item, open by decision rather than by oversight.

### A first Telegram link still trusts a username — OPEN, accepted 2026-11-03
`server/telegram.ts` binds a bare `/start` to any account whose `telegramHandle` matches the
sender's current Telegram username, provided that account has no chat id yet. A rebind has
needed a dashboard token since 4.18.1, and now a password and a code as well (#8), but the
*first* link does not.

- **The exposure:** a Telegram username can be abandoned and re-registered by somebody else.
  Someone who acquires a username an admin has already typed into a trader's record can
  capture that account's verification channel before the real trader links it — and they would
  then receive the login 2FA codes for an account that has never been used.
- **Why it is open:** closing it means a dashboard-issued token for every link, which changes
  onboarding. Today an admin types the handle and the trader messages the bot; after a fix the
  trader has to sign in on their password first and open a link. That is a workflow decision,
  not a defect, and it was weighed and deferred on 2026-11-03.
- **Mitigations in place:** the window is only ever between an admin typing a handle and the
  trader linking; every link is logged; and an account with no Telegram has no second factor to
  steal yet — the attacker gains the channel for codes, not the password.
- **If it is ever taken up:** require a token for the first link too, and keep admin unlink
  (#8) as the recovery path, since it reopens the username branch for exactly one account at a
  time and on purpose.

Everything else from both review passes is fixed and deployed. The thing to carry forward is
not any individual finding but the review passes themselves: the first was written and
shelved, and the account it described was emptied four months later. The second and third read
the *fixes* rather than the original code, and each found fresh holes in work that had
typechecked, passed its tests and shipped the same day — including one where a comment
asserted a safety the code did not provide, and one where the fix for a race was applied
everywhere but the place it started. Review the remediation, not only the thing being
remediated.
