"""proxy_manager — Gestión de proxies SOCKS5 (DataImpulse) de la Phone Farm.

Funciones principales:
    get_proxy_dict(proxy_id)        -> dict de proxies para requests (http/https)
    configure_phone_proxy(serial)   -> inyecta el proxy global en el dispositivo vía ADB
    verify_proxy(proxy_id)          -> verifica conectividad real (IP pública + latencia)

Seguridad operativa:
    - Credenciales de proxy NUNCA se loguean en claro (se enmascaran).
    - Cada cuenta IG usa 1 proxy dedicado (aislamiento 1:1).
"""

from __future__ import annotations

import logging
import os
import subprocess
import time
from pathlib import Path
from typing import Any

import requests

from platform_data import find_proxy, save_proxies

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.getenv("PHONE_FARM_DATA_DIR", BASE_DIR))
PROXIES_FILE = DATA_DIR / "proxies.json"

# Variables de entorno para credenciales DataImpulse (fallback si proxies.json no trae user/pass)
DI_USER = os.getenv("DATAIMPULSE_USER", "")
DI_PASS = os.getenv("DATAIMPULSE_PASS", "")


# ---------------------------------------------------------------------------
# Persistencia (delegada en platform_data; helpers de compatibilidad)
# ---------------------------------------------------------------------------

def load_proxies() -> list[dict[str, Any]]:
    """Lee proxies.json. Devuelve lista vacía si el archivo no existe o está corrupto."""
    from platform_data import load_proxies as _load

    return _load()


def _mask(value: str) -> str:
    """Enmascara una credencial para logs (nunca loguear pass en claro)."""
    if not value:
        return ""
    return f"{value[:3]}***{value[-2:]}" if len(value) > 6 else "***"


# ---------------------------------------------------------------------------
# Proxy dict para requests
# ---------------------------------------------------------------------------

def get_proxy_dict(proxy_id: str) -> dict[str, str]:
    """Retorna {"http": "socks5://user:pass@host:port", "https": ...} para el proxy dado.

    Si el proxy no tiene user/pass en proxies.json, usa DATAIMPULSE_USER/PASS del .env.
    Lanza ValueError si el proxy no existe.
    """
    proxy = find_proxy(proxy_id)
    if proxy is None:
        raise ValueError(f"Proxy no existe: {proxy_id}")

    host = proxy.get("host", "")
    port = int(proxy.get("port", 0) or 0)
    user = proxy.get("user") or DI_USER
    passwd = proxy.get("pass") or DI_PASS
    scheme = proxy.get("type", "socks5")  # socks5 | http

    if not host or not port:
        raise ValueError(f"Proxy {proxy_id} sin host/port configurados")

    if user and passwd:
        auth = f"{user}:{passwd}@"
    else:
        auth = ""
    url = f"{scheme}://{auth}{host}:{port}"
    return {"http": url, "https": url}


# ---------------------------------------------------------------------------
# ADB
# ---------------------------------------------------------------------------

def adb_cmd_prefix() -> list[str]:
    """Prefijo del comando adb, incluyendo host/puerto del ADB server si se configuró."""
    host = os.getenv("ADB_HOST", "127.0.0.1")
    port = os.getenv("ADB_PORT", "5037")
    if host and host not in ("127.0.0.1", "localhost") or port != "5037":
        return ["adb", "-H", host, "-P", port]
    return ["adb"]


def _run_adb(device_serial: str, args: list[str], timeout: int = 20) -> str:
    """Ejecuta un comando adb contra un dispositivo. Lanza RuntimeError si falla."""
    cmd = [*adb_cmd_prefix(), "-s", device_serial, *args]
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout, check=False
        )
    except FileNotFoundError as exc:
        raise RuntimeError("Binario 'adb' no encontrado en PATH") from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"adb timeout para {device_serial}") from exc
    if result.returncode != 0:
        raise RuntimeError(
            f"adb {args[0]} falló en {device_serial}: {result.stderr.strip() or result.stdout.strip()}"
        )
    return result.stdout.strip()


def _is_placeholder_serial(device_serial: str) -> bool:
    """Detecta seriales de ejemplo (RFCW80XXXXX) para fallar con mensaje claro."""
    return "XXXXX" in device_serial or not device_serial


def configure_phone_proxy(device_serial: str, proxy_id: str) -> dict[str, str]:
    """Inyecta el proxy global en el dispositivo Android vía ADB.

    Usa `settings put global http_proxy` (funciona en Android >= 4.4 con
    emulador o teléfono rooteado/ADB). Para configuraciones avanzadas
    (SOCKS5 por app), se recomienda Postern/SuperProxy/OpenVPN-WireGuard
    hacia DataImpulse — esta función cubre el proxy HTTP(S) del sistema.

    Retorna {"device_serial", "proxy", "method"} o lanza RuntimeError.
    """
    if _is_placeholder_serial(device_serial):
        raise RuntimeError(
            f"Serial placeholder detectado ({device_serial!r}). "
            "Configura el serial real del dispositivo (adb devices)."
        )
    proxy = find_proxy(proxy_id)
    if proxy is None:
        raise ValueError(f"Proxy no existe: {proxy_id}")

    host = proxy.get("host", "")
    port = int(proxy.get("port", 0) or 0)
    target = f"{host}:{port}"

    # Global HTTP proxy del sistema (Android 4.4+)
    _run_adb(device_serial, ["shell", "settings", "put", "global", "http_proxy", target])
    _run_adb(device_serial, ["shell", "settings", "put", "global", "https_proxy", target])
    _run_adb(device_serial, ["shell", "settings", "put", "global", "global_http_proxy_host", host])
    _run_adb(device_serial, ["shell", "settings", "put", "global", "global_http_proxy_port", str(port)])

    logger.info("Proxy %s inyectado en %s (%s)", proxy_id, device_serial, target)
    return {"device_serial": device_serial, "proxy": proxy_id, "method": "settings_put_global"}


def clear_phone_proxy(device_serial: str) -> None:
    """Elimina el proxy global del dispositivo."""
    if _is_placeholder_serial(device_serial):
        raise RuntimeError(f"Serial placeholder detectado: {device_serial!r}")
    _run_adb(device_serial, ["shell", "settings", "put", "global", "http_proxy", ":0"])
    logger.info("Proxy eliminado de %s", device_serial)


# ---------------------------------------------------------------------------
# Verificación real
# ---------------------------------------------------------------------------

def verify_proxy(proxy_id: str, timeout: int = 8) -> dict[str, Any]:
    """Consulta api.ipify.org A TRAVÉS del proxy y retorna {ip, latency_ms, status}.

    Devuelve status "online" si la conexión tuvo éxito; "offline" en caso
    contrario, con el error enmascarado (nunca credenciales).
    """
    try:
        proxy_dict = get_proxy_dict(proxy_id)
    except ValueError as exc:
        return {"proxy_id": proxy_id, "ip": None, "latency_ms": None, "status": "offline", "error": str(exc)}

    start = time.monotonic()
    try:
        response = requests.get(
            "https://api.ipify.org?format=json",
            proxies=proxy_dict,
            timeout=timeout,
        )
        latency_ms = int((time.monotonic() - start) * 1000)
        if response.ok:
            ip = response.json().get("ip", "")
            logger.info("Proxy %s online — IP pública: %s (%d ms)", proxy_id, ip, latency_ms)
            return {"proxy_id": proxy_id, "ip": ip, "latency_ms": latency_ms, "status": "online"}
        logger.warning("Proxy %s respondió HTTP %s", proxy_id, response.status_code)
        return {"proxy_id": proxy_id, "ip": None, "latency_ms": latency_ms, "status": "offline",
                "error": f"HTTP {response.status_code}"}
    except requests.exceptions.RequestException as exc:
        latency_ms = int((time.monotonic() - start) * 1000)
        logger.warning("Proxy %s offline: %s", proxy_id, type(exc).__name__)
        return {"proxy_id": proxy_id, "ip": None, "latency_ms": latency_ms, "status": "offline",
                "error": type(exc).__name__}
