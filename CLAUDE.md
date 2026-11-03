# RFX Trader Dashboard

Trading P&L dashboard for RFX traders. Full-stack TypeScript app with tRPC for end-to-end type safety.

## Architecture

- **Frontend**: React 19, Wouter (routing), TanStack Query (server state), shadcn/ui + Tailwind CSS
- **Backend**: Express + tRPC 11 (type-safe API), Drizzle ORM (MySQL)
- **Services**: MetaCopier API integration, Telegram bot, server-side breach monitor (1-min interval), trailing risk-limit monitor, custodial USDT payout wallets (TRC20 + ERC20)
- **Auth**: JWT cookies — trader auth via magic number + bcrypt-hashed password (12 rounds), with Telegram-delivered 2FA for login/password reset/change; admin auth via OAuth
- **Traders**: each `magic_numbers` row has a `manager` (e.g. `RFX`, `RFX - Zarab`) and a `liveAccountNumber` (the MetaCopier master/live account their trades copy to)

## Key Files

- `server/routers.ts` — All tRPC procedures (auth, trading, admin)
- `server/db.ts` — Database query helpers
- `server/metacopier.ts` — MetaCopier API client
- `server/breachMonitor.ts` — Server-side risk limit monitor
- `server/trailingRiskLimit.ts` — Trailing risk-limit monitor
- `server/telegram.ts` — Telegram bot integration
- `server/tron.ts` / `server/erc20.ts` — Custodial USDT payout wallets (TRC20 / EVM)
- `drizzle/schema.ts` — All table definitions (11 tables)

## Deployment

- **Runtime**: Docker Compose on Oracle Cloud — service `rfx-app` (container
  `rfx-trader-dashboard`) + `dashboard-mysql` (container `rfx-dash-db`). TLS and hostname
  routing are handled by the shared edge Caddy in the parent folder (`/home/rfx`), which
  `include`s this stack; this stack no longer runs its own Caddy or Portainer.
- **Domains**: tradersdash.rfx.capital and tradersdash.rftrust.co → `rfx-trader-dashboard:3000`
  over the external `rfx_edge` network. The container name is what the edge Caddyfile targets —
  renaming it breaks routing. **tda.rfx.capital** reaches the same container but only from the
  tailnet, and is the sole place an `isAdmin` account can be used (see Admin access below).
  The service publishes no host port: the edge Caddy is the only way in, which is what makes
  `req.ip` trustworthy.
- **Pull + rebuild app** (full deploy command — injects git short hash as BUILD_HASH for the version
  footer). **Run it from `/home/rfx`, not from this folder.** This stack is `include`d by the parent
  compose file, so it is no longer a standalone project: running compose here uses project name
  `rfx-trader-dashboard` instead of `rfx` and tries to create a *second* MySQL against the same
  `data/mysql` bind mount. Docker refuses on the container-name clash, and that clash is the only
  thing standing between you and two mysqld processes on one data directory.
  ```bash
  git -C RFX-Trader-Dashboard pull origin main && \
    BUILD_HASH=$(git -C RFX-Trader-Dashboard rev-parse --short HEAD) \
    docker compose up -d --build rfx-app
  ```
- **DB migrations**: `docker exec -it rfx-trader-dashboard pnpm db:push`
- **View logs**: `docker logs rfx-trader-dashboard --tail 50 -f`
- **DB shell**: `docker compose exec dashboard-mysql mysql -urfx -p rfx_trader`
  (MySQL data is bind-mounted at `data/mysql` on the host, so it survives container recreation.)

## Admin access

Admin accounts are usable **only from the tailnet**, over `https://tda.rfx.capital`, since
2026-11-02 — someone logged in as `admin` from the internet (default password; `isAdmin`
accounts are exempt from the Telegram 2FA every trader gets) and moved 2030 USDT out of the
custodial wallet. `server/adminNetwork.ts` holds the rule; the edge Caddy enforces it again at
the hostname. Traders are unaffected on `tradersdash.*`.

**An authenticator (TOTP) is the admin's second factor**, since 4.15.0 — the account has no
Telegram, so the code every trader gets could never reach it. `server/totp.ts` is the
arithmetic (RFC 6238, tested against the published vectors); `server/totpAuth.ts` is enrolment
and spending a code, including the two rules that make a correct code fail: a step at or below
the last one accepted is a replay, and a recovery code is deleted as it is used. The secret is
encrypted with `EMAIL_TOKEN_KEY`.

**Taking the authenticator away holds payouts**, for `TOTP_CHANGE_COOL_OFF_HOURS`.
`clearTotp` and a `beginTotpEnrolment` over a working authenticator stamp `totpChangedAt`, and
`assertAuthenticatorSettled` refuses payouts while it is fresh — a step-up proves someone holds
the current factor, which is worth nothing if they installed it a minute ago. A first enrolment
and a recovery-code sign-in deliberately do not stamp it.

**Moving money needs a step-up.** `sendWalletPayment` and `processProfitSharePayout` call
`assertPaymentElevation`, which refuses a session that has not entered a code in the last
`PAYMENT_ELEVATION_MINUTES`, and refuses an account with no authenticator outright. The
clearance lives on `trading_sessions.totpVerifiedAt`, not the account, so a second stolen
session does not inherit it. The client asks *before* the first transfer
(`client/src/components/PaymentStepUp.tsx`): re-running a half-finished payout run would pay
the traders at the top of the list twice.

The app-side check lives in **`tradingProcedure`**, not `adminProcedure`: most admin
procedures take a plain `tradingProcedure` and test `isAdmin` inline — `sendWalletPayment`
among them — so the session middleware is the only chokepoint that cannot be forgotten. Put
new admin surfaces behind `tradingProcedure`; if one must read the session cookie directly
(as `server/liveStream.ts` does), repeat the check with `isTailnetAdminRequest`.
`trading.login` refuses an admin before comparing the password and writes an `auth` log row.

**There are two notions of "client IP", and they are not interchangeable.** `req.ip`
(`trust proxy` 1) is the *immediate peer* — the hop Caddy appends — which is what
`server/adminNetwork.ts` needs and what `req.protocol`, and so the session cookie's `secure`
flag, is derived from. `clientIpOf` (`server/clientIp.ts`) walks on through Cloudflare to the
*end client*, and is what records who a user is: sessions, rate limits, auth logs. Do not
unify them: 100.64.0.0/10 is carrier-grade NAT space real mobile networks hand out, so an end
client can hold a 100.x address while being nowhere near the tailnet.

Still open from that incident, in `/home/rfx/.claude/plans/precious-cooking-pretzel.md`:
`updateUsdtInfo` lets an account change its own payout address with no 2FA, no logging and no
cool-off; `payments` records no destination address; `trading_sessions.ipAddress` stores
Cloudflare's address rather than `CF-Connecting-IP`, so `hasSeenDevice` is near-meaningless;
and a password change does not invalidate sessions.

## Translations (English / Urdu / Arabic)

Trader-facing text is translated; English is the default and the language wording is
discussed in. **Whenever trader-facing text changes, update the Urdu and Arabic in the same
change** — Claude writes the translations.

- All trader-facing strings live in `shared/i18n/en.ts` (the source of truth). `ur.ts` and
  `ar.ts` are typed against it, so a missing or extra key fails `pnpm check`, and
  `server/i18n.test.ts` checks that placeholders and Telegram HTML tags match.
- Client: `useLanguage()` gives `t()`, `tError()` (server error messages) and `lang`;
  `<Trans>` is for sentences with styled values inside, `<Ltr>` wraps figures (money, lots,
  prices, tickets, hashes, dates) so they read left-to-right with Western digits.
- Urdu and Arabic mirror the layout (`<html dir="rtl">`): use logical Tailwind classes
  (`ms-`/`me-`, `ps-`/`pe-`, `start-`/`end-`, `text-start`/`text-end`), never `ml-`/`mr-`/
  `text-right` on trader pages. Directional icons get `rtl:rotate-180`.
- Server: the trader's choice is `magic_numbers.language`. Telegram builders take a `lang`;
  send through `localizedTelegram(...)` so the admin Logs show English and the trader's
  language together. System notifications go through `createSystemNotification`, which stores
  the i18n key + params so they render in the reader's language.
- Keep trading terms in Latin script in every language: lot, SL/TP, stop-loss, take-profit,
  P&L, Magic Number, USDT, Telegram, Incubator, Live.
- English-only by decision: admin screens (`/admin/*` is forced to English), the payment
  (transmission) proof dialogs, admin-typed broadcasts/DMs, admin alerts.

## User Preferences

- Always provide full Docker commands for any server/DB operations — never assume the user will translate `pnpm db:push` into the Docker equivalent
- When making schema changes, include the Docker migration command in the summary

## Conventions

- TypeScript strict mode — avoid `any`
- Zod for all tRPC input validation
- camelCase for variables/functions, PascalCase for components
- Prettier for formatting (2-space indent, trailing commas)
- Tests live next to source files in server/ (*.test.ts)
- Environment variables defined in server/_core/env.ts
