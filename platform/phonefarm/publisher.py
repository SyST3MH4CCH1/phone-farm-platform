"""publisher — Publicación de Reels en Instagram vía instagrapi.

Reglas de seguridad operativa:
    - NUNCA se hace login() repetidamente: se reutiliza la sesión persistente
      sessions/<account_id>.json (client.load_settings). El login inicial se
      hace UNA sola vez con login_once() (setup explícito).
    - Cada cuenta usa su proxy dedicado (aislamiento 1:1) y un fingerprint de
      dispositivo consistente (Galaxy A52 / SM-A525F).
    - Si Instagram lanza ChallengeRequired / PleaseWaitFewMinutes / LoginRequired,
      NO se reintenta en bucle: se copia el MP4 al teléfono (adb push) y se
      registra en logs/fallback_queue.json con estado awaiting_manual_upload
      para subida manual desde el Dashboard.
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from instagrapi import Client
from instagrapi.exceptions import (
    ChallengeRequired,
    ClientError,
    LoginRequired,
    PleaseWaitFewMinutes,
)

from phonefarm.proxy_manager import find_proxy, get_proxy_dict

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("PHONE_FARM_DATA_DIR", BASE_DIR))
SESSIONS_DIR = DATA_DIR / "sessions"
VIDEOS_DIR = DATA_DIR / "videos"
LOGS_DIR = DATA_DIR / "logs"
FALLBACK_QUEUE_FILE = LOGS_DIR / "fallback_queue.json"

LOGIN_RETRY_SECONDS = 300  # cooldown entre intentos de login manual
_last_login_attempt: dict[str, float] = {}

# Fingerprint consistente: Samsung Galaxy A52 5G (SM-A525F)
GALAXY_A52_DEVICE: dict[str, Any] = {
    "app_version": "297.0.0.27.106",
    "android_version": 12,
    "android_release": "5.1.1",
    "manufacturer": "samsung",
    "model": "SM-A525F",
    "device": "a52q",
    "resolution": "1080x2400",
    "dpi": "420dpi",
    "cpu": "qcom",
    "version_code": "355654729",
}


# ---------------------------------------------------------------------------
# Persistencia de sesiones (paso 4: cifradas en SQLite, nunca en claro)
# ---------------------------------------------------------------------------

def _load_settings(account_id: str) -> dict[str, Any]:
    """Carga la sesión persistente cifrada. Lanza FileNotFoundError si no existe."""
    from phonefarm.crypto import decrypt_json
    from phonefarm.platform_data import _conn, _key

    row = _conn().execute(
        "SELECT enc_json FROM social_sessions WHERE account_id = ?", (account_id,)
    ).fetchone()
    if row is None:
        raise FileNotFoundError(
            f"No existe sesión para {account_id}. "
            "Ejecuta login_once() UNA vez para crearla (nunca se reloguea automáticamente)."
        )
    return decrypt_json(_key(), "social_sessions", account_id, row["enc_json"])


def _save_settings(account_id: str, settings: dict[str, Any]) -> None:
    from phonefarm.crypto import encrypt_json
    from phonefarm.platform_data import _conn, _key

    envelope = encrypt_json(_key(), "social_sessions", account_id, settings)
    with _conn():
        _conn().execute(
            "INSERT INTO social_sessions (account_id, enc_json, updated_at) VALUES (?,?,datetime('now')) "
            "ON CONFLICT(account_id) DO UPDATE SET enc_json=excluded.enc_json, updated_at=datetime('now')",
            (account_id, envelope),
        )


def _has_session(account_id: str) -> bool:
    from phonefarm.platform_data import _conn

    row = _conn().execute(
        "SELECT 1 FROM social_sessions WHERE account_id = ?", (account_id,)
    ).fetchone()
    return row is not None


# ---------------------------------------------------------------------------
# Cliente instagrapi
# ---------------------------------------------------------------------------

def _build_client(account_id: str, account: dict[str, Any]) -> Client:
    """Construye el Client con sesión, proxy y device spoofing configurados."""
    client = Client()
    client.set_device(GALAXY_A52_DEVICE)
    client.load_settings(_load_settings(account_id))

    # Proxy dedicado de la cuenta (aislamiento 1:1)
    proxy_id = account.get("proxy_id")
    if proxy_id:
        try:
            proxy_dict = get_proxy_dict(proxy_id)
            client.set_proxy(proxy_dict["https"])
        except ValueError as exc:
            logger.warning("Cuenta %s: %s (publicando sin proxy)", account_id, exc)

    client.set_timezone_offset(-18000)  # UTC-5 (zona horaria típica de farms)
    client.set_locale("es_ES")
    return client


def login_once(account_id: str, username: str, password: str) -> str:
    """Login inicial EXPLÍCITO para crear la sesión cifrada en social_sessions.

    Este es el ÚNICO login permitido: crea la sesión persistente que luego
    se reutiliza (cifrada AES-256-GCM en la tabla social_sessions, nunca en
    un fichero). Con cooldown de 5 minutos entre intentos por cuenta.
    """
    now = time.monotonic()
    if now - _last_login_attempt.get(account_id, 0) < LOGIN_RETRY_SECONDS:
        raise RuntimeError(
            f"Cooldown de login activo para {account_id} "
            f"(espera {int(LOGIN_RETRY_SECONDS - (now - _last_login_attempt.get(account_id, 0)))}s). "
            "Revisa la cuenta manualmente antes de reintentar."
        )
    _last_login_attempt[account_id] = now

    client = Client()
    client.set_device(GALAXY_A52_DEVICE)
    client.login(username, password)
    _save_settings(account_id, client.get_settings())
    logger.info("Sesión creada para %s (username=%s)", account_id, username)
    return account_id  # la sesión vive cifrada en BD (nunca se devuelve una ruta)


# ---------------------------------------------------------------------------
# Fallback manual (ADB push + fallback_queue)
# ---------------------------------------------------------------------------

def _register_manual_fallback(account_id: str, video_path: str, reason: str) -> None:
    """Copia el MP4 al dispositivo y lo registra como awaiting_manual_upload."""
    LOGS_DIR.mkdir(parents=True, exist_ok=True)

    # 1) adb push del vídeo al teléfono
    try:
        from phonefarm.proxy_manager import _is_placeholder_serial, adb_cmd_prefix

        account = _find_account(account_id)
        serial = account.get("device_serial", "") if account else ""
        if serial and not _is_placeholder_serial(serial):
            subprocess.run(
                [*adb_cmd_prefix(), "-s", serial, "push", video_path, "/sdcard/Download/"],
                capture_output=True, text=True, timeout=120, check=False,
            )
            logger.warning("Vídeo %s copiado a %s para subida manual", video_path, serial)
    except Exception as exc:  # noqa: BLE001 — el fallback nunca debe romper el flujo
        logger.error("adb push falló en fallback manual: %s", exc)

    # 2) Registro en fallback_queue.json
    entries: list[dict[str, Any]] = []
    if FALLBACK_QUEUE_FILE.exists():
        try:
            entries = json.loads(FALLBACK_QUEUE_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            entries = []
    entries.append({
        "account_id": account_id,
        "video_path": video_path,
        "reason": reason,
        "status": "awaiting_manual_upload",
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })
    # Paso 12: cola de fallback acotada (máx. 500 entradas).
    if len(entries) > 500:
        entries = entries[-500:]
    FALLBACK_QUEUE_FILE.write_text(
        json.dumps(entries, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    logger.warning("Subida manual registrada para %s (%s)", account_id, reason)


def _find_account(account_id: str) -> dict[str, Any] | None:
    """Busca la cuenta en accounts.json (import perezoso para evitar ciclos)."""
    from phonefarm.platform_data import load_accounts

    return next((a for a in load_accounts() if a.get("id") == account_id), None)


# ---------------------------------------------------------------------------
# API pública
# ---------------------------------------------------------------------------

def publish_video(account_id: str, video_path: str, caption: str) -> str:
    """Publica un Reel en Instagram y retorna el media_id.

    Raises:
        FileNotFoundError: sesión no creada (hacer login_once primero) —
            la plataforma lo registra como fallback manual en vez de dejar el job 'failed'.
        RuntimeError: la cuenta no existe en accounts.json.
        instagrapi.exceptions.*: error de Instagram (p.ej. ChallengeRequired) —
            en ese caso la plataforma registra el fallback manual automáticamente.
    """
    account = _find_account(account_id)
    if account is None:
        raise RuntimeError(f"Cuenta no existe: {account_id}")

    path = Path(video_path)
    if not path.exists():
        raise FileNotFoundError(f"Vídeo no encontrado: {video_path}")

    # Sin sesión persistente: NO se cae a 'failed' — se activa el fallback manual
    # (adb push del MP4 al teléfono + registro en logs/fallback_queue.json).
    if not _has_session(account_id):
        logger.warning(
            "No existe sesión para %s — registrando fallback manual (awaiting_manual_upload)",
            account_id,
        )
        _register_manual_fallback(account_id, str(path), "NoSession")
        raise FileNotFoundError(
            f"No existe sesión para {account_id}. "
            "Ejecuta login_once() UNA vez para crearla (nunca se reloguea automáticamente)."
        )

    client = _build_client(account_id, account)
    logger.info("Subiendo Reel %s para @%s...", path.name, account.get("username"))
    try:
        media = client.clip_upload(str(path), caption)
        media_id = str(media.pk)
        logger.info("Publicado OK: media_id=%s", media_id)
        return media_id
    except (ChallengeRequired, PleaseWaitFewMinutes, LoginRequired, ClientError) as exc:
        logger.error(
            "Instagram bloqueó la subida de %s (cuenta %s): %s — activando fallback manual",
            path.name, account_id, type(exc).__name__,
        )
        _register_manual_fallback(account_id, str(path), type(exc).__name__)
        raise
