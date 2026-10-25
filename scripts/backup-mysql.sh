#!/usr/bin/env sh
set -eu

: "${MYSQL_DATABASE:?MYSQL_DATABASE is required}"
: "${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD is required}"

backup_dir="${BACKUP_DIR:-./backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"

docker compose -f docker-compose.prod.yml exec -T mysql \
  mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" \
  --single-transaction --routines --triggers "$MYSQL_DATABASE" \
  | gzip > "$backup_dir/booking_scheduler_$timestamp.sql.gz"

echo "Backup written to $backup_dir/booking_scheduler_$timestamp.sql.gz"
