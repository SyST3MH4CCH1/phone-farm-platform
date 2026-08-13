"""audit — registro de auditoría encadenado con HMAC (paso 6).

Cada evento se inserta con `hash = HMAC(clave_audit, prev_hash|ts|actor|role|action|object|meta|request_id)`
en la misma transacción SQLite. `verify_chain()` detecta cualquier modificación,
borrado o inserción fuera de orden (tamper-evident).

La clave de la cadena deriva de la clave maestra (keystore) con HKDF y un salt
FIJO (la cadena debe sobrevivir reinicios). SOLO Python escribe en audit_log
(un solo writer: Express notifica vía /internal/audit y Flask registra).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import sqlite3
from datetime import datetime, timezone
from typing import Any, Optional

from phonefarm.crypto import derive_key
from phonefarm.keystore import get_master_key

logger = logging.getLogger(__name__)

_CHAIN_SALT = b"phonefarm-audit-v1"
_hmac_key_cache: bytes | None = None


def _hmac_key() -> bytes:
    global _hmac_key_cache
    if _hmac_key_cache is None:
        _hmac_key_cache = derive_key(get_master_key(), _CHAIN_SALT, "audit-chain")
    return _hmac_key_cache


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def _last_hash(conn: sqlite3.Connection) -> Optional[str]:
    row = conn.execute("SELECT hash FROM audit_log ORDER BY seq DESC LIMIT 1").fetchone()
    return row["hash"] if row else None


def log_action(
    conn: sqlite3.Connection,
    *,
    actor: str,
    role: str = "system",
    action: str,
    object: Optional[str] = None,
    meta: Optional[dict[str, Any]] = None,
    request_id: Optional[str] = None,
) -> None:
    """Inserta un evento encadenado (transacción atómica)."""
    prev_hash = _last_hash(conn)
    ts = _now()
    meta_json = json.dumps(meta or {}, ensure_ascii=False, default=str)
    payload = "|".join([str(x) for x in (prev_hash, ts, actor, role, action, object, meta_json, request_id)])
    digest = hmac.new(_hmac_key(), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    with conn:
        conn.execute(
            "INSERT INTO audit_log (ts, actor, role, action, object, meta, request_id, prev_hash, hash) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (ts, actor, role, action, object, meta_json, request_id, prev_hash, digest),
        )


def verify_chain(conn: sqlite3.Connection) -> list[str]:
    """Verifica la cadena completa; devuelve la lista de violaciones (vacía = íntegra)."""
    violations: list[str] = []
    expected_prev: Optional[str] = None
    rows = conn.execute("SELECT seq, ts, actor, role, action, object, meta, request_id, prev_hash, hash "
                        "FROM audit_log ORDER BY seq").fetchall()
    for row in rows:
        if row["prev_hash"] != expected_prev:
            violations.append(f"seq {row['seq']}: prev_hash roto (esperado {expected_prev}, hay {row['prev_hash']})")
        payload = "|".join([str(x) for x in (
            row["prev_hash"], row["ts"], row["actor"], row["role"], row["action"],
            row["object"], row["meta"], row["request_id"],
        )])
        digest = hmac.new(_hmac_key(), payload.encode("utf-8"), hashlib.sha256).hexdigest()
        if digest != row["hash"]:
            violations.append(f"seq {row['seq']}: hash inválido (tamper)")
        expected_prev = row["hash"]
    return violations
