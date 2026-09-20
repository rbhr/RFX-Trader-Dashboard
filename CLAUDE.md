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
  renaming it breaks routing.
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
