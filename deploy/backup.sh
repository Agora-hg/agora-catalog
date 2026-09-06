#!/usr/bin/env bash
# Ежедневный дамп базы каталога. Крон:
#   15 4 * * * /opt/agora-catalog/deploy/backup.sh >> /var/log/agora-catalog/backup.log 2>&1
#
# Держим 14 дней. Сервер общий и места 41 ГБ, дамп каталога на 5-10к компаний —
# единицы мегабайт, так что 14 копий ничего не стоят.
set -euo pipefail
DIR=/var/backups/agora-catalog
mkdir -p "$DIR"
STAMP=$(date +%Y%m%d-%H%M)
CREDS=/opt/agora-catalog/.env.dbcreds
if [ -f "$CREDS" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$CREDS"
  set +a
fi
if [ -n "${DATABASE_URL:-}" ]; then
  pg_dump "$DATABASE_URL" | gzip -9 > "$DIR/agora_catalog-$STAMP.sql.gz"
else
  pg_dump -U agora_catalog -h 127.0.0.1 agora_catalog | gzip -9 > "$DIR/agora_catalog-$STAMP.sql.gz"
fi
find "$DIR" -name 'agora_catalog-*.sql.gz' -mtime +14 -delete
echo "$(date -Is) дамп готов: $(du -h "$DIR/agora_catalog-$STAMP.sql.gz" | cut -f1)"
