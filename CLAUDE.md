# RFX Trader Dashboard

Trading P&L dashboard for RFX traders. Full-stack TypeScript app with tRPC for end-to-end type safety.

## Commands

```bash
pnpm dev          # Start dev server (Express + Vite HMR) on port 3000
pnpm build        # Build frontend (Vite) + bundle server (esbuild)
pnpm start        # Run production build
pnpm test         # Run backend tests (Vitest)
pnpm check        # TypeScript type checking (no emit)
pnpm format       # Format code with Prettier
pnpm db:push      # Generate + apply database migrations (Drizzle Kit)
```

## Architecture

- **Frontend**: React 19, Wouter (routing), TanStack Query (server state), shadcn/ui + Tailwind CSS
- **Backend**: Express + tRPC 11 (type-safe API), Drizzle ORM (MySQL)
- **Services**: MetaCopier API integration, Telegram bot, server-side breach monitor (1-min interval)
- **Auth**: JWT cookies — trader auth via magic number + password, admin auth via OAuth

## Project Structure

```
client/src/       React frontend (pages, components, hooks, contexts)
server/           Express backend (routers.ts, db.ts, services)
server/_core/     Server bootstrap (Express init, tRPC config, env vars)
shared/           Shared types and constants
drizzle/          Database schema (schema.ts) and migration files
```

## Key Files

- `server/routers.ts` — All tRPC procedures (auth, trading, admin)
- `server/db.ts` — Database query helpers
- `server/metacopier.ts` — MetaCopier API client
- `server/breachMonitor.ts` — Server-side risk limit monitor
- `server/telegram.ts` — Telegram bot integration
- `drizzle/schema.ts` — All table definitions

## Deployment

- **Runtime**: Docker Compose (rfx-app, mysql, caddy) on Oracle Cloud
- **Domain**: tradersdash.rftrust.co (Caddy auto-HTTPS)
- **DB migrations**: `docker exec -it rfx-app pnpm db:push`
- **Rebuild app**: `docker compose up -d --build rfx-app`
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
