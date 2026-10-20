#!/usr/bin/env bash
# Respaldo diario en el SERVIDOR LINUX (cron). Guarda en /var/backups/metops y conserva 14 días.
# Cron (como el usuario de despliegue):  0 2 * * *  /opt/metops/deploy/server/backup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DEST=/var/backups/metops
mkdir -p "$DEST"
docker compose exec -T db pg_dump -U metops -Fc metops > "$DEST/metops_$(date +%F).dump"
docker run --rm -v metops_evidencias:/data:ro -v "$DEST":/out alpine \
  tar czf "/out/evidencias_$(date +%F).tgz" -C /data .
find "$DEST" -type f -mtime +14 -delete
# IMPORTANTE: copia /var/backups/metops a OTRO equipo (rsync, rclone, ...). Un respaldo en el mismo servidor no es un respaldo.
