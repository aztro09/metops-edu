# Respaldo de la base de datos de DESARROLLO (PowerShell 7). Requiere Docker Desktop abierto.
# Uso:  pwsh deploy/backup.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$compose = "$root\deploy\docker-compose.dev.yml"
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
New-Item -ItemType Directory -Force "$root\backups" | Out-Null

# El volcado se hace DENTRO del contenedor (misma versión de pg_dump que el servidor)
# y se copia con `docker compose cp`. No uses `>` ni `|` con datos binarios en PowerShell: los corrompe.
docker compose -f $compose exec -T db pg_dump -U metops -Fc -f /tmp/metops.dump metops
if ($LASTEXITCODE -ne 0) { throw 'pg_dump falló' }
docker compose -f $compose cp db:/tmp/metops.dump "$root\backups\metops_$stamp.dump"
if ($LASTEXITCODE -ne 0) { throw 'no se pudo copiar el respaldo' }

# Conserva 14 días de respaldos.
Get-ChildItem "$root\backups\*.dump" | Where-Object LastWriteTime -lt (Get-Date).AddDays(-14) | Remove-Item
Write-Host "Respaldo creado: backups\metops_$stamp.dump"
