#!/usr/bin/env bash
# Entrypoint del contenedor platform: prepara directorios y arranca Flask + MCP.
# Paso 13: no se siembran JSON en claro (el almacén es SQLite cifrado; la
# migración de legado se hace con python -m phonefarm.migrate --commit).
set -e

mkdir -p /app/data/sessions /app/data/videos /app/data/logs /app/data/backups /app/tmp

# Generar config segura de MoneyPrinterTurbo si no existe
if [ ! -f /app/mpt-config.toml ]; then
  python /app/scripts/gen_mpt_config.py || true
fi

exec python -m phonefarm.platform
