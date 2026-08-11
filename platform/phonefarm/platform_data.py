"""platform_data — Capa de persistencia JSON compartida (accounts/proxies/queue).

Todos los módulos escriben A TRAVÉS de estas funciones para mantener
consistencia (indent=2, encoding utf-8) y un único punto de fallo.
"""

from __future__ import annotations

import json
import logging
import os
import threading
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_BASE_DIR = Path(__file__).resolve().parent.parent
# Carga .env antes de resolver DATA_DIR (PHONE_FARM_DATA_DIR puede venir del .env).
try:
    from dotenv import load_dotenv
    load_dotenv(_BASE_DIR / ".env")
except ImportError:  # dotenv no instalado: confiar en vars de entorno reales
    pass

DATA_DIR = Path(os.getenv("PHONE_FARM_DATA_DIR", str(_BASE_DIR)))

ACCOUNTS_FILE = DATA_DIR / "accounts.json"
PROXIES_FILE = DATA_DIR / "proxies.json"
QUEUE_FILE = DATA_DIR / "queue.json"

_lock = threading.RLock()


def _read(file: Path, default: Any) -> Any:
    with _lock:
        try:
            with open(file, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            return data if isinstance(data, list) else default
        except (FileNotFoundError, json.JSONDecodeError) as exc:
            logger.warning("No se pudo leer %s: %s", file.name, exc)
            return default


def _write(file: Path, data: Any) -> None:
    """Escritura ATÓMICA: tmp + os.replace para no corromper el JSON si el
    proceso muere a mitad de un json.dump (AUDIT: persistencia no atómica)."""
    with _lock:
        file.parent.mkdir(parents=True, exist_ok=True)
        tmp = file.with_suffix(file.suffix + ".tmp")
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, ensure_ascii=False)
        os.replace(tmp, file)


# --- accounts.json ---

def load_accounts() -> list[dict[str, Any]]:
    return _read(ACCOUNTS_FILE, [])


def save_accounts(accounts: list[dict[str, Any]]) -> None:
    _write(ACCOUNTS_FILE, accounts)


def find_account(account_id: str) -> dict[str, Any] | None:
    return next((a for a in load_accounts() if a.get("id") == account_id), None)


# --- proxies.json ---

def load_proxies() -> list[dict[str, Any]]:
    return _read(PROXIES_FILE, [])


def save_proxies(proxies: list[dict[str, Any]]) -> None:
    _write(PROXIES_FILE, proxies)


def find_proxy(proxy_id: str) -> dict[str, Any] | None:
    return next((p for p in load_proxies() if p.get("id") == proxy_id), None)


# --- queue.json ---

def load_queue() -> list[dict[str, Any]]:
    return _read(QUEUE_FILE, [])


def save_queue(queue: list[dict[str, Any]]) -> None:
    _write(QUEUE_FILE, queue)
