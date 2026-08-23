#!/bin/bash
# RFX Trader Dashboard — Backup Script
# MySQL dump to /mnt/rfxbackup/mysql
# Docker volumes to /mnt/rfxbackup/volumes

set -euo pipefail

BACKUP_ROOT="/mnt/rfxbackup"
MYSQL_DIR="$BACKUP_ROOT/mysql"
VOLUMES_DIR="$BACKUP_ROOT/volumes"
RETENTION_DAYS=30
DATE=$(date +%Y%m%d-%H%M%S)

# Load env vars for DB password
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
# Read only the value we need rather than `source`-ing .env. Some values contain
# characters that are a bash syntax error (e.g. parentheses in the MetaCopier
# key), which under `set -e` aborted this script before any backup ran.
if [ -f "$PROJECT_DIR/.env" ]; then
  MYSQL_PASSWORD="$(sed -n 's/^MYSQL_PASSWORD=//p' "$PROJECT_DIR/.env" | head -1)"
fi
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD not found in $PROJECT_DIR/.env}"

mkdir -p "$MYSQL_DIR" "$VOLUMES_DIR"

# --- MySQL Backup ---
echo "[$(date)] Starting MySQL backup..."
docker exec rfx-dash-db mysqldump -u rfx -p"${MYSQL_PASSWORD}" rfx_trader \
  | gzip > "$MYSQL_DIR/rfx_trader_${DATE}.sql.gz"
echo "[$(date)] MySQL backup saved: $MYSQL_DIR/rfx_trader_${DATE}.sql.gz"

# --- Docker Volume Backups ---
echo "[$(date)] Starting volume backups..."

# Caddy data (SSL certs) — owned by the shared edge Caddy (compose project "rfx")
docker run --rm \
  -v rfx_caddy_data:/data:ro \
  -v "$VOLUMES_DIR":/backup \
  alpine tar czf "/backup/caddy_data_${DATE}.tar.gz" -C /data .
echo "[$(date)] Caddy data backed up"

# Caddy config
docker run --rm \
  -v rfx_caddy_config:/data:ro \
  -v "$VOLUMES_DIR":/backup \
  alpine tar czf "/backup/caddy_config_${DATE}.tar.gz" -C /data .
echo "[$(date)] Caddy config backed up"

# --- Cleanup old backups ---
echo "[$(date)] Cleaning up backups older than ${RETENTION_DAYS} days..."
find "$MYSQL_DIR" -name "rfx_trader_*.sql.gz" -mtime +$RETENTION_DAYS -delete
find "$VOLUMES_DIR" -name "caddy_*.tar.gz" -mtime +$RETENTION_DAYS -delete

echo "[$(date)] Backup complete."
