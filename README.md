# RFX Trader Dashboard

A full-stack TypeScript P&L dashboard for RFX traders running on MetaCopier.io. Traders log in with a magic number + password to view their live P&L, open positions, and trade history; admins manage traders, MetaCopier copiers, master/live account assignments, risk limits, and USDT payouts. Built with tRPC for end-to-end type safety.

## Features

### Authentication & Security
- **Magic number authentication** — traders log in with their trading account identifier + password
- **bcrypt password hashing** — passwords are stored as bcrypt hashes (12 rounds), never plaintext
- **Two-factor authentication** — short-lived codes delivered via Telegram for login, password reset, and password change
- **Admin OAuth** — admin portal authenticates via OAuth
- **JWT session cookies** — secure HTTP-only cookies with configurable expiration

### Trader Dashboard
- **Real-time P&L** — today (realized + floating), weekly, monthly, and all-time
- **Profit share** — displays the trader's share of positive weekly P&L (default 35%)
- **Open positions** — live view of active trades with color-coded P&L
- **Trade history** — historical trades grouped by close date, expandable for detail
- **Account & copier configuration** — scale type, max open trades, max lot size, risk limit, balance, equity
- **Notifications** — in-app bell for breaches, payments, and admin broadcasts
- **Settings** — Telegram handle connection and USDT payout details (TRC20/ERC20)

### Admin Portal
- **Manage Traders** — full CRUD, inline profit-share editing, active toggle, sortable/sticky columns with persisted visibility, manager filter
- **MetaCopier integration** — create MC accounts (auto magic-number retrieval, naming, features, risk limits), view/manage copiers (Disable / Manage / Activate / Remove)
- **Master account assignment** — assign/unassign traders to live ("master") accounts, which sets `liveAccountNumber`
- **Risk limit breaches** — server-side monitor; active/resolved breach tables with single and bulk re-enable
- **Payments** — record USDT payouts, transmission-proof dialog with blockchain explorer links, CSV export
- **Messaging** — direct and broadcast messages over Telegram + in-app

### Server-side services
- **Breach monitor** (`breachMonitor.ts`) — checks every trader's equity against their risk limit every 1 minute
- **Trailing risk limit** (`trailingRiskLimit.ts`) — trailing risk limit monitor
- **Telegram bot** (`telegram.ts`) — `@RFXTraderBot`, handles `/start`, notifications, 2FA codes
- **Custodial USDT wallets** (`tron.ts`, `erc20.ts`) — server-side TRC20 and ERC20/EVM wallets for outbound payouts; private keys live only on the server

## Technology Stack

- **Frontend**: React 19 + TypeScript, Wouter (routing), TanStack Query (server state), shadcn/ui + Radix on Tailwind CSS
- **Backend**: Node.js + Express, tRPC 11, Drizzle ORM (MySQL 8.0)
- **External**: MetaCopier.io REST API, Telegram Bot API, TRON (`tronweb`) + EVM (`ethers`) for payouts
- **Auth**: bcrypt, JWT cookies, OAuth (admin)

## Project Structure

```
client/src/        Frontend (pages, components, hooks, contexts, lib)
server/            Express backend
  routers.ts       All tRPC procedures (auth, trading, admin)
  db.ts            Drizzle query helpers
  metacopier.ts    MetaCopier API client
  breachMonitor.ts Server-side risk-limit monitor (1-min interval)
  trailingRiskLimit.ts  Trailing risk-limit monitor
  telegram.ts      Telegram bot integration
  tron.ts          Custodial TRC20 wallet
  erc20.ts         Custodial ERC20/EVM wallet
  *.test.ts        Backend tests (Vitest), next to source
  _core/           Server bootstrap (Express init, tRPC config, env vars, OAuth)
shared/            Shared types and constants
drizzle/           schema.ts (table definitions) + migration files
```

## Commands

```bash
pnpm dev          # Dev server (Express + Vite HMR) on port 3000
pnpm build        # Build frontend (Vite) + bundle server (esbuild)
pnpm start        # Run production build
pnpm test         # Backend tests (Vitest)
pnpm check        # TypeScript type checking (no emit)
pnpm format       # Prettier
pnpm db:push      # Generate + apply DB migrations (Drizzle Kit)
```

## Database Schema

11 tables (`drizzle/schema.ts`):

| Table | Purpose |
|-------|---------|
| `users` | Admin / OAuth users backing the auth flow |
| `magic_numbers` | Trader configs: magic number, hashed password, profit share, MT & MetaCopier details, manager, live account, Telegram, profit tracking, risk limit, USDT payout info |
| `trading_sessions` | Active trader sessions (token, IP, user agent, expiry) |
| `copier_templates` | Reusable copier configuration templates |
| `payments` | USDT payout records (amount, hash, network, fee) |
| `notifications` | In-app notifications |
| `risk_limit_breaches` | Equity-below-limit breach history |
| `trader_previous_magic_numbers` | Historical magic numbers per trader |
| `trader_previous_master_accounts` | Historical live/master accounts per trader |
| `two_factor_codes` | Short-lived Telegram-delivered 2FA codes |
| `admin_settings` | Key-value admin settings store |

## Configuration

Environment variables are defined in `server/_core/env.ts` and set via `.env` (see the keys below). Required:

```env
# Database
DATABASE_URL=mysql://rfx:PASSWORD@mysql:3306/rfx_trader
MYSQL_ROOT_PASSWORD=...
MYSQL_PASSWORD=...

# Auth
JWT_SECRET=...
VITE_APP_ID=...
OAUTH_SERVER_URL=...
OWNER_OPEN_ID=...

# MetaCopier
METACOPIER_API_KEY=...
METACOPIER_ACCOUNT_ID=...

# Telegram
TELEGRAM_BOT_TOKEN=...

# Domain (Caddy auto-HTTPS)
DOMAIN=tradersdash.rftrust.co

# Payouts — TRC20 (TRON)
TRON_PRIVATE_KEY=...
TRON_FULL_NODE=...
TRON_USDT_CONTRACT=...
GASFREE_API_KEY=...
GASFREE_API_SECRET=...

# Payouts — ERC20 (EVM)
EVM_PRIVATE_KEY=...
EVM_RPC_URL=...
EVM_USDT_CONTRACT=...
EVM_CHAIN_NAME=...

# Logging (optional) — comma-separated debug namespaces, or */1/true for all.
# Empty/unset = quiet (default). See "Logs & debugging".
DEBUG=
```

## Deployment

Runs as Docker Compose (`rfx-app`, `mysql`, `caddy`) on Oracle Cloud. Caddy provides automatic HTTPS for **tradersdash.rftrust.co**.

```bash
# Pull + rebuild app (injects git short hash as BUILD_HASH for the version footer)
git pull origin main && BUILD_HASH=$(git rev-parse --short HEAD) docker compose up -d --build rfx-app

# Apply DB migrations
docker exec -it rfx-app pnpm db:push

# View logs
docker logs rfx-app --tail 50 -f
```

> Note: MySQL is only reachable on the internal Docker network. Run DB/MetaCopier scripts inside the app container, e.g.:
> `docker exec -w /app -i rfx-app node --input-type=module < script.mjs`

### Logs & debugging

Logs are **quiet by default** — verbose per-request lines (e.g. `[Auth] Missing session cookie`) are gated behind the `DEBUG` env var, so the stream stays greppable.

```bash
# Follow logs and filter to a topic. 2>&1 merges stderr (where many logs go);
# --line-buffered makes grep emit matches in real time instead of in chunks.
docker logs rfx-app -f 2>&1 | grep --line-buffered Onboarding

# Invert to hide noise instead
docker logs rfx-app -f 2>&1 | grep --line-buffered -ivE 'session|cookie'
```

Turn verbose logging on by setting `DEBUG` in `.env`, then restart (it's read once at startup):

```bash
echo "DEBUG=auth" >> .env && docker compose up -d rfx-app   # enable the "auth" namespace
```

`DEBUG=auth,onboarding` enables multiple; `DEBUG=*` (or `1`/`true`) enables everything; remove the line and restart to silence again. New namespaces are added in code via `createDebug("name")` (see `server/_core/debug.ts`).

## P&L Calculation

```
P&L = Σ(profit + swap + commission)
```

- **Floating P&L** — sum over open positions
- **Realized P&L** — sum over closed positions in the period
- **Total P&L** — floating + realized

Trader P&L is computed from positions on the trader's **live (master) account**, filtered by their magic number.

## MetaCopier Notes

- New copiers are created with No-scaling (scaleType 4), `copyMagicNumber` enabled, and a custom magic number equal to the trader's magic, plus a "skip position if SL or TP missing" feature (type 31).
- The `POST /copiers` create endpoint ignores `scaleType`/`copyMagicNumber` in the body — these are applied via a follow-up `PUT` (and must be sent together with `customMagicNumber`, since setting `copyMagicNumber` alone clears it). See `metacopier.ts:createCopier`.
- The API returns deleted accounts with `status.name = "Deleted"` rather than erroring.

## Development

```bash
pnpm test                  # all backend tests
pnpm test metacopier.test.ts
pnpm check                 # type checking
```

Conventions: TypeScript strict mode (avoid `any`), Zod for all tRPC input validation, camelCase variables/functions, PascalCase components, Prettier (2-space indent, trailing commas). Tests live next to source in `server/` (`*.test.ts`).

## Security Notes

- API keys and wallet private keys are server-side only
- Passwords are bcrypt-hashed; sessions use secure HTTP-only cookies
- 2FA codes are short-lived and delivered out-of-band via Telegram
