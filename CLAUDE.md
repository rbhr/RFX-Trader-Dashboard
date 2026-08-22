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

- **Runtime**: Docker Compose (rfx-app, mysql, caddy) on Oracle Cloud
- **Domain**: tradersdash.rftrust.co (Caddy auto-HTTPS)
- **Pull + rebuild app** (full deploy command — injects git short hash as BUILD_HASH for the version footer):
  ```bash
  git pull origin main && BUILD_HASH=$(git rev-parse --short HEAD) docker compose up -d --build rfx-app
  ```
- **DB migrations**: `docker exec -it rfx-app pnpm db:push`
- **View logs**: `docker logs rfx-app --tail 50 -f`

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
