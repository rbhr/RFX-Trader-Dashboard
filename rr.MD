# Security Audit Findings

Source review dated 2026-11-03. These findings concern the checked-out code; deployed behavior was not verified. No tests or production requests were run. This is a source-review pass, not a complete security audit.

## 1. High — Existing TOTP can be replaced with only a session and password

`server/routers.ts:1561` starts authenticator enrollment after verifying only the password. Enrollment immediately clears the existing factor and recovery codes in `server/totpAuth.ts:88`.

Someone holding a stolen session and password could install their own authenticator. The payout hold delays spending but does not prevent account takeover.

**Recommended fix:** Require the existing factor before replacement, and preserve it until the replacement is confirmed.

## 2. High, conditional — Telegram username reuse can redirect verification codes

`server/telegram.ts:96` overwrites established chat bindings whenever `/start` matches a stored username.

An attacker who acquires a trader's abandoned Telegram username could receive their Telegram verification and password-reset codes.

**Recommended fix:** Link through an authenticated, single-use dashboard token. Never overwrite an established binding solely from a username match.

## 3. Medium — Verification codes are not consumed atomically

`server/totpAuth.ts:216` checks previously loaded state before updating it. Concurrent requests can accept the same TOTP or recovery code. Telegram codes have the same read-then-update race in `server/db.ts:890`.

This weakens the single-use guarantee for verification codes.

**Recommended fix:** Consume codes through conditional database updates or transactions, and require exactly one successful update before accepting a code.

## 4. Medium — Admin password edits bypass session revocation

`server/routers.ts:2842` permits password updates without deleting the target account's existing sessions.

A compromised session survives an administrative password reset, even though the dedicated password-change and reset flows revoke sessions.

**Recommended fix:** Apply session revocation consistently across every password-writing path.
