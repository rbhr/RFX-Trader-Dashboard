# Migration Plan: Manus to Claude Code + Docker Self-Hosted

## Overview

Migrate the RFX Trader Dashboard from the Manus cloud sandbox to a self-hosted
Docker environment on your own cloud server, with Claude Code as the development
tool.

---

## Phase 1: Clean Up Manus Artifacts

Remove all Manus-specific code and dependencies that are only needed for the
Manus sandbox environment.

### 1.1 vite.config.ts

- [ ] Remove the entire `vitePluginManusDebugCollector()` function (~75 lines)
- [ ] Remove `vitePluginManusRuntime()` from plugins array
- [ ] Remove `jsxLocPlugin()` from plugins array (Builder.io JSX location tracking — Manus tooling)
- [ ] Remove Manus domains from `allowedHosts` (`.manuspre.computer`, `.manus.computer`, `.manus-asia.computer`, `.manuscomputer.ai`, `.manusvm.computer`)
- [ ] Remove unused imports (`fs`, `Plugin`, `ViteDevServer`)

### 1.2 package.json

- [ ] Remove `vite-plugin-manus-runtime` from devDependencies
- [ ] Remove `@builder.io/vite-plugin-jsx-loc` from devDependencies
- [ ] Remove `"add": "^2.0.6"` from devDependencies (accidental install artifact)
- [ ] Audit unused Radix UI packages (hover-card, menubar, navigation-menu, etc.)

### 1.3 File Cleanup

- [ ] Delete `.manus-logs/` directory if it exists
- [ ] Delete any `.manus*` config files if present

---

## Phase 2: Docker Setup

### 2.1 Architecture

```
docker-compose.yml
├── rfx-app          Node.js (Express + Vite build + breach monitor + Telegram bot)
├── mysql             MySQL 8.0 database
├── caddy             Reverse proxy with automatic HTTPS (Let's Encrypt)
└── volumes
    ├── mysql_data    Persistent database storage
    └── caddy_data    SSL certificates
```

Single-process Node.js app is correct here — Express serves the API, the built
frontend, runs the breach monitor interval, and the Telegram polling. No need to
split into separate containers.

### 2.2 Files to Create

- `Dockerfile` — multi-stage build (install deps, build frontend, run production)
- `docker-compose.yml` — app + MySQL + Caddy
- `Caddyfile` — reverse proxy config with automatic HTTPS
- `.dockerignore` — exclude node_modules, .git, .env, etc.
- `.env.example` — template of all required environment variables

### 2.3 Environment Variables

Required for production (set in `.env` on the server):

```env
# App
NODE_ENV=production
PORT=3000

# Database (internal Docker network)
DATABASE_URL=mysql://rfx:STRONG_PASSWORD_HERE@mysql:3306/rfx_trader

# Auth
JWT_SECRET=generate-a-64-char-random-string
VITE_APP_ID=your-app-id
OAUTH_SERVER_URL=https://your-oauth-provider
OWNER_OPEN_ID=your-owner-open-id

# MetaCopier
METACOPIER_API_KEY=your-key
METACOPIER_ACCOUNT_ID=your-account-id

# Telegram
TELEGRAM_BOT_TOKEN=your-bot-token

# Domain (for Caddy HTTPS)
DOMAIN=dashboard.yourdomain.com
```

---

## Phase 3: Database Migration

### 3.1 Current State

- **Database**: MySQL (currently on TiDB Cloud or Manus-managed MySQL)
- **ORM**: Drizzle with 15 migration files (0000–0014)
- **Tables**: 7 tables (users, magic_numbers, trading_sessions, copier_templates,
  payments, notifications, risk_limit_breaches)

### 3.2 Migration Strategy

**Option A: Fresh schema + data import (Recommended)**

1. Start the new MySQL container (docker-compose up mysql)
2. Run `pnpm db:push` which executes `drizzle-kit generate && drizzle-kit migrate`
   — this applies all migrations to create the schema
3. Export data from current database:
   ```bash
   # On current server / Manus environment
   mysqldump -h CURRENT_HOST -u USER -p \
     --no-create-info --complete-insert \
     rfx_trader magic_numbers payments notifications \
     copier_templates risk_limit_breaches users \
     > data_export.sql
   ```
4. Import into new database:
   ```bash
   docker exec -i rfx-mysql mysql -u rfx -p rfx_trader < data_export.sql
   ```

**Option B: Full dump + restore (if schema matches exactly)**

1. Full dump from current DB:
   ```bash
   mysqldump -h CURRENT_HOST -u USER -p --databases rfx_trader > full_backup.sql
   ```
2. Restore into Docker MySQL:
   ```bash
   docker exec -i rfx-mysql mysql -u root -p < full_backup.sql
   ```

### 3.3 Tables to Migrate (by priority)

| Table | Records | Priority | Notes |
|-------|---------|----------|-------|
| magic_numbers | Active traders | Critical | Contains trader configs, profit tracking |
| users | Admin + OAuth users | Critical | Auth records |
| payments | Payment history | Critical | Financial records — do not lose |
| notifications | In-app messages | Medium | Can be recreated if lost |
| copier_templates | Config templates | Medium | Re-creatable from MetaCopier |
| risk_limit_breaches | Breach history | Medium | Historical audit data |
| trading_sessions | Active sessions | Low | Users will just re-login |

### 3.4 Data Validation Checklist

After migration, verify:

- [ ] `SELECT COUNT(*) FROM magic_numbers` matches source
- [ ] `SELECT COUNT(*) FROM payments` matches source
- [ ] `SELECT COUNT(*) FROM users` matches source
- [ ] Admin login works
- [ ] Trader login works (test with one magic number)
- [ ] MetaCopier API calls return data
- [ ] Telegram bot responds to /start
- [ ] Breach monitor starts and logs first check

---

## Phase 4: Claude Code Onboarding

### 4.1 Create CLAUDE.md

A project-level file that tells Claude Code about your project conventions,
commands, and architecture. Created as part of this migration.

### 4.2 Development Workflow (replaces Manus sandbox)

```
Local development:
  pnpm dev              → hot-reload dev server on localhost:3000
  pnpm test             → run backend tests
  pnpm check            → TypeScript type checking
  Claude Code           → edit code, run commands, iterate

Staging (optional):
  git push              → push to feature branch
  docker build + deploy → preview on staging server

Production:
  git push main         → trigger deploy (manual or CI)
  ssh server            → docker compose pull && docker compose up -d
```

### 4.3 Recommended: Add CI Later

Once stable, add a GitHub Actions workflow:
- On push to `main`: build Docker image, push to registry, SSH deploy
- On PR: run tests + type check

---

## Phase 5: Production Cutover

### 5.1 Pre-Cutover Checklist

- [ ] Docker Compose runs locally with all services healthy
- [ ] Database migrated and validated
- [ ] DNS record points to new server
- [ ] HTTPS working (Caddy auto-provisions Let's Encrypt cert)
- [ ] All env vars set in production `.env`
- [ ] Telegram bot token transferred (only one instance can poll)
- [ ] MetaCopier API key works from new server IP
- [ ] Backup strategy in place (see 5.3)

### 5.2 Cutover Steps

1. Stop the Manus deployment
2. Take a final database export from Manus
3. Import final data into Docker MySQL
4. Update DNS to point to new server
5. `docker compose up -d` on production server
6. Verify all functionality
7. Monitor logs: `docker compose logs -f rfx-app`

### 5.3 Backup Strategy

Add a cron job on the host server:

```bash
# /etc/cron.d/rfx-backup (runs daily at 2am)
0 2 * * * root docker exec rfx-mysql mysqldump -u rfx -p'PASSWORD' rfx_trader \
  | gzip > /backups/rfx_trader_$(date +\%Y\%m\%d).sql.gz

# Keep last 30 days
0 3 * * * root find /backups -name "rfx_trader_*.sql.gz" -mtime +30 -delete
```

---

## Summary Timeline

| Phase | What | Effort |
|-------|------|--------|
| Phase 1 | Clean Manus artifacts | Quick — removing code |
| Phase 2 | Docker setup | Create Dockerfile, compose, Caddy |
| Phase 3 | Database migration | Export from Manus, import to Docker MySQL |
| Phase 4 | Claude Code onboarding | Create CLAUDE.md, test workflow |
| Phase 5 | Production cutover | DNS switch, final data sync, go live |
