#!/usr/bin/env bash
# Entrypoint del contenedor platform: prepara datos y arranca Flask + MCP.
set -e

mkdir -p /app/data/sessions /app/data/videos /app/data/logs

# Semillas de datos si el volumen está vacío
for f in accounts.json proxies.json queue.json content_profiles.json; do
  if [ ! -f "/app/data/$f" ]; then
    cp "/app/$f" "/app/data/$f" 2>/dev/null || true
    echo "[entrypoint] Semilla creada: /app/data/$f"
  fi
done

# Generar config segura de MoneyPrinterTurbo si no existe
if [ ! -f /app/mpt-config.toml ]; then
  python /app/scripts/gen_mpt_config.py || true
fi

exec python -m phonefarm.platform
