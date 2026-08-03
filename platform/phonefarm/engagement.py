"""engagement — Orquestador de taktik-bot para automatización de engagement.

Lanza `python -m taktik automation workflow --device-id <serial> --config <wf.json>`
como subproceso por cuenta (taktik-bot clonado en third_party/taktik-bot).

Seguridad operativa:
    - Aislamiento 1:1: cada cuenta valida proxy dedicado + dispositivo único
      antes de arrancar (start_bot falla si falta cualquiera de los dos).
    - Warmup progresivo: warmup_day <= 7 -> 30 acciones/día; 8-14 -> 50; >14 -> 100.
    - Un solo bot por cuenta (409 si ya corre).
    - En Windows se detiene con taskkill /T (árbol de procesos).
"""

from __future__ import annotations

import json
import logging
import os
import re
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any

from phonefarm.platform_data import find_account, find_proxy, load_accounts, save_accounts

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("PHONE_FARM_DATA_DIR", BASE_DIR))
LOGS_DIR = DATA_DIR / "logs"
WORKFLOWS_DIR = LOGS_DIR / "workflows"

# Directorio del repo taktik-bot (relativo a BASE_DIR o absoluto por env)
TAKTIK_DIR = Path(os.getenv("TAKTIK_DIR", BASE_DIR / "third_party" / "taktik-bot"))
BOT_SESSION_MINUTES = int(os.getenv("BOT_SESSION_MINUTES", "60"))

running_bots: dict[str, subprocess.Popen] = {}
_bots_lock = threading.RLock()


# ---------------------------------------------------------------------------
# Política de warmup
# ---------------------------------------------------------------------------

def daily_limits(warmup_day: int) -> dict[str, int]:
    """Límites diarios de acciones según el día de warmup (regla de la farm).

    <= 7 días  -> 30 acciones/día
    8-14 días  -> 50 acciones/día
    > 14 días  -> 100 acciones/día
    """
    if warmup_day <= 7:
        cap = 30
    elif warmup_day <= 14:
        cap = 50
    else:
        cap = 100
    return {
        "max_actions_per_day": cap,
        "max_likes_per_day": int(cap * 0.6),
        "max_follows_per_day": int(cap * 0.2),
        "max_comments_per_day": int(cap * 0.1),
    }


def _workflow_config(account: dict[str, Any]) -> dict[str, Any]:
    """Genera el workflow JSON para taktik-bot a partir de la cuenta."""
    warmup_day = int(account.get("warmup_day", 1))
    limits = daily_limits(warmup_day)
    return {
        "session_settings": {
            "session_duration_minutes": BOT_SESSION_MINUTES,
            "total_interactions_limit": limits["max_actions_per_day"],
        },
        "warmup_policy": limits,
        # Workflows predeterminados: hashtag (nicho) + followers (crecimiento)
        "hashtag": {
            "max_interactions": limits["max_actions_per_day"],
            "interaction_delay_range": [20, 40],
            "like_percentage": 80,
            "follow_percentage": 15,
            "comment_percentage": 5,
        },
        "followers": {
            "max_interactions_per_session": limits["max_actions_per_day"],
            "interaction_delay_range": [10, 25],
            "like_probability": 0.8,
            "follow_probability": 0.2,
            "comment_probability": 0.05,
        },
    }


# ---------------------------------------------------------------------------
# Helpers de proceso
# ---------------------------------------------------------------------------

def _adb_prefix() -> list[str]:
    """Prefijo adb incluyendo host/puerto del server (ADB_HOST/ADB_PORT)."""
    host = os.getenv("ADB_HOST", "127.0.0.1")
    port = os.getenv("ADB_PORT", "5037")
    if (host and host not in ("127.0.0.1", "localhost")) or port != "5037":
        return ["adb", "-H", host, "-P", port]
    return ["adb"]


def _kill_tree(proc: subprocess.Popen) -> None:
    """Termina el proceso y su árbol (taskkill en Windows, SIGTERM en POSIX)."""
    if proc.poll() is not None:
        return
    if sys.platform == "win32":
        subprocess.run(
            ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
            capture_output=True, text=True, timeout=15, check=False,
        )
    else:
        try:
            proc.send_signal(signal.SIGTERM)
            proc.wait(timeout=15)
        except (subprocess.TimeoutExpired, ProcessLookupError):
            proc.kill()


# ---------------------------------------------------------------------------
# API pública
# ---------------------------------------------------------------------------

def start_bot(account_id: str) -> dict[str, Any]:
    """Arranca el bot de engagement para una cuenta. Valida aislamiento 1:1."""
    account = find_account(account_id)
    if account is None:
        raise ValueError(f"Cuenta no existe: {account_id}")

    # --- Validaciones de seguridad (aislamiento 1:1) ---
    device_serial = account.get("device_serial", "")
    if not device_serial or "XXXXX" in device_serial:
        raise ValueError(
            f"Cuenta {account_id} sin dispositivo válido (device_serial placeholder). "
            "Conecta el teléfono al hub USB y verifica con 'adb devices'."
        )
    proxy_id = account.get("proxy_id", "")
    if not proxy_id or find_proxy(proxy_id) is None:
        raise ValueError(
            f"Cuenta {account_id} sin proxy dedicado (proxy_id='{proxy_id}'). "
            "Aislamiento 1:1: cada cuenta necesita 1 proxy + 1 dispositivo."
        )

    with _bots_lock:
        existing = running_bots.get(account_id)
        if existing is not None and existing.poll() is None:
            raise RuntimeError(f"El bot de {account_id} ya está corriendo (PID {existing.pid})")
        if account.get("bot_active"):
            logger.info("Cuenta %s marcada activa; se reutiliza estado", account_id)

        # Workflow JSON específico de la cuenta (con límites de warmup)
        WORKFLOWS_DIR.mkdir(parents=True, exist_ok=True)
        wf_path = WORKFLOWS_DIR / f"{account_id}.json"
        wf_path.write_text(json.dumps(_workflow_config(account), indent=2), encoding="utf-8")

        # Comando real de taktik-bot (verificado contra su CLI)
        cmd = [
            sys.executable, "-m", "taktik",
            "automation", "workflow",
            "--device-id", device_serial,
            "--config", str(wf_path),
        ]
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        log_file = open(LOGS_DIR / f"taktik_{account_id}.log", "ab", buffering=0)

        try:
            proc = subprocess.Popen(
                cmd,
                cwd=str(TAKTIK_DIR),
                stdout=log_file,
                stderr=subprocess.STDOUT,
            )
        except FileNotFoundError as exc:
            log_file.close()
            raise RuntimeError(
                f"taktik-bot no encontrado en {TAKTIK_DIR}. "
                "Clónalo con scripts/deploy.ps1 o define TAKTIK_DIR."
            ) from exc

        running_bots[account_id] = proc
        logger.info("Bot iniciado para %s (PID %d, serial %s, límite %d acciones/día)",
                    account_id, proc.pid, device_serial,
                    daily_limits(int(account.get("warmup_day", 1)))["max_actions_per_day"])

    # Persistir bot_active
    accounts = load_accounts()
    for acc in accounts:
        if acc.get("id") == account_id:
            acc["bot_active"] = True
    save_accounts(accounts)

    return {"account_id": account_id, "pid": proc.pid, "bot_active": True}


def stop_bot(account_id: str) -> dict[str, Any]:
    """Detiene el bot de engagement de la cuenta (taskkill árbol en Windows)."""
    with _bots_lock:
        proc = running_bots.pop(account_id, None)
    if proc is None:
        # Sincronizar estado aunque el proceso ya no esté registrado
        accounts = load_accounts()
        for acc in accounts:
            if acc.get("id") == account_id:
                acc["bot_active"] = False
        save_accounts(accounts)
        raise ValueError(f"No hay bot corriendo para {account_id}")

    _kill_tree(proc)
    logger.info("Bot detenido para %s (PID %d)", account_id, proc.pid)

    accounts = load_accounts()
    for acc in accounts:
        if acc.get("id") == account_id:
            acc["bot_active"] = False
    save_accounts(accounts)
    return {"account_id": account_id, "bot_active": False}


def get_bot_status(account_id: str) -> dict[str, Any]:
    """Estado del bot: {active, likes_today, follows_today, comments_today, daily_limit}.

    Los contadores se parsean del log de taktik-bot (taktik_<id>.log).
    """
    account = find_account(account_id) or {}
    warmup_day = int(account.get("warmup_day", 1))
    limits = daily_limits(warmup_day)

    with _bots_lock:
        proc = running_bots.get(account_id)
        active = proc is not None and proc.poll() is None

    # Parseo tolerante de contadores desde el log (regex genéricas es/en)
    counts = {"likes_today": 0, "follows_today": 0, "comments_today": 0}
    log_path = LOGS_DIR / f"taktik_{account_id}.log"
    if log_path.exists():
        try:
            tail = log_path.read_text(encoding="utf-8", errors="ignore")[-20000:]
            patterns = {
                "likes_today": re.compile(r"(?:likes?|me gusta)[^\d]{0,20}(\d+)", re.I),
                "follows_today": re.compile(r"(?:follows?|seguidos?)[^\d]{0,20}(\d+)", re.I),
                "comments_today": re.compile(r"(?:comments?|comentarios?)[^\d]{0,20}(\d+)", re.I),
            }
            for key, pattern in patterns.items():
                match = pattern.findall(tail)
                if match:
                    counts[key] = int(match[-1])
        except OSError:
            pass

    return {
        "active": active,
        "pid": proc.pid if active and proc else None,
        "daily_limit": limits["max_actions_per_day"],
        **counts,
    }


def active_bots_count() -> int:
    """Número de bots con proceso vivo (para /api/stats)."""
    with _bots_lock:
        return sum(1 for p in running_bots.values() if p.poll() is None)
