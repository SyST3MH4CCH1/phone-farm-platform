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
import threading
import time
from pathlib import Path
from typing import Any

import requests

from phonefarm.platform_data import find_proxy, save_proxies

# Cache for ipify verification: cache_key -> (result, timestamp)
# In-flight coordination: cache_key -> threading.Event (set when result is ready)
# ponytail: 5-min TTL, stdlib dict+lock only
_verify_cache: dict[str, tuple[dict[str, Any], float]] = {}
_verify_cache_lock = threading.Lock()
_verify_inflight: dict[str, threading.Event] = {}

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
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
    from phonefarm.platform_data import load_proxies as _load

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

    Si el proxy no trae user/pass — o trae el placeholder literal (p.ej.
    "DATAIMPULSE_USER") — se leen las credenciales del .env
    (DATAIMPULSE_USER/DATAIMPULSE_PASS). Lanza ValueError si no hay credenciales.
    """
    proxy = find_proxy(proxy_id)
    if proxy is None:
        raise ValueError(f"Proxy no existe: {proxy_id}")

    host = proxy.get("host", "")
    port = int(proxy.get("port", 0) or 0)
    # Un user/pass "placeholder" no es una credencial real; se cae al .env.
    user = proxy.get("user") or ""
    passwd = proxy.get("pass") or ""
    if user in ("DATAIMPULSE_USER", "${DATAIMPULSE_USER}", "", None):
        user = DI_USER
    if passwd in ("DATAIMPULSE_PASS", "${DATAIMPULSE_PASS}", "", None):
        passwd = DI_PASS
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


def adb_discover_devices(timeout: int = 8) -> list[dict[str, Any]]:
    """Devices reales conectados via `adb devices -l` (sin la cabecera).

    Retorna: [{"serial": "ZY326WFTMQ", "status": "device", "product": ..., "model": ...}]
    Solo incluye estados "device" (autorizado) y "unauthorized" (pendiente de
    aceptar el diálogo en el teléfono). Un dispositivo desconectado no aparece.
    """
    try:
        result = subprocess.run(
            [*adb_cmd_prefix(), "devices", "-l"],
            capture_output=True, text=True, timeout=timeout, check=False,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("Binario 'adb' no encontrado en PATH") from exc
    devices: list[dict[str, Any]] = []
    for line in result.stdout.splitlines()[1:]:  # saltar "List of devices attached"
        parts = line.strip().split()
        if len(parts) < 2:
            continue
        serial, status = parts[0], parts[1]
        if status not in ("device", "unauthorized"):
            continue
        dev: dict[str, Any] = {"serial": serial, "status": status}
        for part in parts[2:]:
            if ":" in part:
                k, v = part.split(":", 1)
                dev[k] = v
        devices.append(dev)
    return devices


def is_device_authorized(serial: str) -> bool:
    """¿El serial dado está autorizado (status=device) en adb?"""
    try:
        return any(
            d.get("serial") == serial and d.get("status") == "device"
            for d in adb_discover_devices()
        )
    except RuntimeError:
        return False


def adb_device_details(serial: str) -> dict[str, Any]:
    """Datos REALES del dispositivo via ADB (batería, resolución, Android...).

    Cada campo se consulta con timeout corto; si un comando falla el campo
    queda en None (nunca se inventa un valor).
    """
    def shell(*args: str) -> str | None:
        try:
            return _run_adb(serial, ["shell", *args], timeout=6)
        except RuntimeError:
            return None

    details: dict[str, Any] = {"serial": serial}

    battery_raw = shell("dumpsys", "battery")
    if battery_raw:
        level = next((l.split(":", 1)[1].strip() for l in battery_raw.splitlines()
                      if l.strip().startswith("level:")), None)
        status = next((l.split(":", 1)[1].strip() for l in battery_raw.splitlines()
                       if l.strip().startswith("status:")), None)
        details["battery_pct"] = int(level) if level and level.isdigit() else None
        # status: 2=charging, 3=discharging, 4=not charging, 5=full
        details["charging"] = status in ("2", "5")

    size = shell("wm", "size")
    if size:
        w = next((l for l in size.splitlines() if "Physical size" in l), None)
        if w:
            details["resolution"] = w.split(":", 1)[1].strip()

    release = shell("getprop", "ro.build.version.release")
    if release:
        details["android_version"] = release.strip()

    model = shell("getprop", "ro.product.model")
    if model:
        details["model"] = model.strip()

    uptime = shell("uptime")
    if uptime:
        details["uptime"] = uptime.strip()[:60]

    return details


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

def _verify_cache_key(proxy_id: str) -> str | None:
    """Build a cache key from proxy credentials, or None if proxy not found."""
    proxy = find_proxy(proxy_id)
    if proxy is None:
        return None
    host = proxy.get("host", "")
    port = int(proxy.get("port", 0) or 0)
    user = proxy.get("user") or ""
    return f"{proxy_id}|{host}:{port}:{user}"


def verify_proxy(proxy_id: str, timeout: int = 8) -> dict[str, Any]:
    """Consulta api.ipify.org A TRAVÉS del proxy y retorna {ip, latency_ms, status}.

    Devuelve status "online" si la conexión tuvo éxito; "offline" en caso
    contrario, con el error enmascarado (nunca credenciales).

    Cacheo: 300 s TTL por proxy (clave = proxy_id|host:port:user). Si las
    credenciales cambian se genera una clave nueva y el cacheo se绕过.
    Llamadas simultáneas del mismo proxy comparten una única llamada real
    (coordination via threading.Event).
    """
    cache_key = _verify_cache_key(proxy_id)
    TTL = 300.0

    # Fast path: check cache under lock
    if cache_key is not None:
        with _verify_cache_lock:
            entry = _verify_cache.get(cache_key)
        if entry is not None:
            result, ts = entry
            if time.monotonic() - ts < TTL:
                return result

    # Coordination path: another thread is already fetching this key — wait for it
    if cache_key is not None:
        with _verify_cache_lock:
            event = _verify_inflight.get(cache_key)
        if event is not None:
            event.wait(timeout=timeout + 5)
            with _verify_cache_lock:
                entry = _verify_cache.get(cache_key)
            if entry is not None:
                return entry[0]
            # Fall through to fetch if event timed out (stale in-flight marker)

    # Slow path: I'm the fetcher
    try:
        proxy_dict = get_proxy_dict(proxy_id)
    except ValueError as exc:
        return {"proxy_id": proxy_id, "ip": None, "latency_ms": None, "status": "offline", "error": str(exc)}

    # Register in-flight marker
    if cache_key is not None:
        event = threading.Event()
        with _verify_cache_lock:
            existing = _verify_inflight.get(cache_key)
            if existing is not None:
                event = existing  # another thread raced ahead; reuse its event
            else:
                _verify_inflight[cache_key] = event

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
            result = {"proxy_id": proxy_id, "ip": ip, "latency_ms": latency_ms, "status": "online"}
        else:
            logger.warning("Proxy %s respondió HTTP %s", proxy_id, response.status_code)
            result = {"proxy_id": proxy_id, "ip": None, "latency_ms": latency_ms, "status": "offline",
                      "error": f"HTTP {response.status_code}"}
    except requests.exceptions.RequestException as exc:
        latency_ms = int((time.monotonic() - start) * 1000)
        logger.warning("Proxy %s offline: %s", proxy_id, type(exc).__name__)
        result = {"proxy_id": proxy_id, "ip": None, "latency_ms": latency_ms, "status": "offline",
                  "error": type(exc).__name__}

    # Store in cache and signal waiters
    if cache_key is not None:
        with _verify_cache_lock:
            _verify_cache[cache_key] = (result, time.monotonic())
            _verify_inflight.pop(cache_key, None)
        event.set()

    return result
