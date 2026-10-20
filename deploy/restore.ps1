# Restaura un respaldo en una base NUEVA (metops_restore) para comprobarlo sin tocar la real.
# Uso:  pwsh deploy/restore.ps1 backups\metops_2026-10-20_2200.dump
param([Parameter(Mandatory)][string]$Archivo)
$ErrorActionPreference = 'Stop'
$compose = "$(Split-Path $PSScriptRoot -Parent)\deploy\docker-compose.dev.yml"
docker compose -f $compose cp $Archivo db:/tmp/restore.dump
docker compose -f $compose exec -T db dropdb -U metops --if-exists metops_restore
docker compose -f $compose exec -T db createdb -U metops metops_restore
docker compose -f $compose exec -T db pg_restore -U metops -d metops_restore --no-owner /tmp/restore.dump
docker compose -f $compose exec -T db psql -U metops -d metops_restore -c "SELECT count(*) AS tickets FROM tickets;"
