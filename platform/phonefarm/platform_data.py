"""platform_data — capa de persistencia de Phone Farm (SQLite + cifrado, paso 4).

API pública idéntica a la versión JSON (load/save/find de accounts, proxies y
queue) para no tocar a los consumidores (platform.py, publisher.py,
engagement.py, mcp_server.py, proxy_manager.py).

Seguridad:
- Los passwords van cifrados (AES-256-GCM, AAD = tabla|id|campo) en las
  columnas enc_password; NUNCA en claro en disco.
- Las escrituras son transacciones SQLite (WAL) — sustituyen a la escritura
  atómica tmp+os.replace de la versión JSON.
- La clave maestra se resuelve una vez por proceso (keystore, DPAPI/file).
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from phonefarm import db as pdb
from phonefarm.crypto import CryptoError, decrypt_field, encrypt_field
from phonefarm.keystore import get_master_key

logger = logging.getLogger(__name__)

_DEFAULT_DB = Path(os.getenv("PHONEFARM_DB_PATH", str(Path(__file__).resolve().parent.parent / "data" / "phonefarm.db")))

_local = threading.local()
_master_key: bytes | None = None
_key_lock = threading.Lock()

# Columnas fijas de cada tabla; el resto de claves del dict viaja en `meta`.
ACCOUNT_COLS = {"id", "username", "proxy_id", "status", "created_at"}
PROXY_COLS = {"id", "host", "port", "protocol", "username", "status"}
JOB_COLS = {"id", "state", "payload", "version", "idempotency_key", "created_at", "updated_at"}


def db_path() -> Path:
    return Path(os.getenv("PHONEFARM_DB_PATH", str(_DEFAULT_DB)))


def _conn() -> sqlite3.Connection:
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = pdb.open_migrated(db_path())
        _local.conn = conn
    return conn


def _key() -> bytes:
    global _master_key
    if _master_key is None:
        with _key_lock:
            if _master_key is None:
                _master_key = get_master_key()
    return _master_key


def _enc(table: str, row_id: str, field: str, plaintext: str) -> str:
    return encrypt_field(_key(), table, row_id, field, plaintext)


def _dec(table: str, row_id: str, field: str, envelope: str) -> str:
    try:
        return decrypt_field(_key(), table, row_id, field, envelope)
    except CryptoError:
        logger.error("no se pudo descifrar %s|%s|%s (clave cambiada o datos alterados)", table, row_id, field)
        raise


# --- helpers de fila --------------------------------------------------------

def _account_to_row(acc: dict[str, Any]) -> dict[str, Any]:
    row = {
        "id": acc.get("id"),
        "username": acc.get("username"),
        "proxy_id": acc.get("proxy_id") or None,
        "status": acc.get("status", "active"),
        "created_at": acc.get("created_at") or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    pw = acc.get("password") or ""
    row["enc_password"] = _enc("accounts", acc["id"], "password", pw) if pw else None
    meta = {k: v for k, v in acc.items() if k not in ACCOUNT_COLS and k != "password"}
    row["meta"] = json.dumps(meta, ensure_ascii=False)
    return row


def _row_to_account(row: sqlite3.Row) -> dict[str, Any]:
    acc = dict(row)
    acc["password"] = _dec("accounts", acc["id"], "password", acc.pop("enc_password")) if acc.get("enc_password") else ""
    acc.update(json.loads(acc.pop("meta") or "{}"))
    return acc


def _proxy_to_row(proxy: dict[str, Any]) -> dict[str, Any]:
    row = {
        "id": proxy.get("id"),
        "host": proxy.get("host"),
        "port": int(proxy.get("port") or 0),
        "protocol": proxy.get("type") or proxy.get("protocol") or "http",
        "username": proxy.get("user") or proxy.get("username") or "",
        "status": proxy.get("status", "new"),
    }
    pw = proxy.get("pass") or proxy.get("password") or ""
    row["enc_password"] = _enc("proxies", proxy["id"], "password", pw) if pw else None
    meta = {k: v for k, v in proxy.items() if k not in PROXY_COLS and k not in ("user", "pass", "username", "password", "type")}
    row["meta"] = json.dumps(meta, ensure_ascii=False)
    return row


def _row_to_proxy(row: sqlite3.Row) -> dict[str, Any]:
    proxy = dict(row)
    proxy["pass"] = _dec("proxies", proxy["id"], "password", proxy.pop("enc_password")) if proxy.get("enc_password") else ""
    proxy["user"] = proxy.pop("username")
    proxy["type"] = proxy.pop("protocol")
    proxy.update(json.loads(proxy.pop("meta") or "{}"))
    return proxy


def _job_to_row(job: dict[str, Any]) -> dict[str, Any]:
    state = job.get("status") or job.get("state") or "pending"
    payload = {k: v for k, v in job.items() if k not in ("id", "state", "version", "idempotency_key", "created_at", "updated_at") and k != "status"}
    return {
        "id": job.get("id"),
        "state": state,
        "payload": json.dumps(payload, ensure_ascii=False),
        "version": int(job.get("version", 1)),
        "idempotency_key": job.get("idempotency_key") or None,
    }


def _row_to_job(row: sqlite3.Row) -> dict[str, Any]:
    job = json.loads(row["payload"] or "{}")
    job["id"] = row["id"]
    job["status"] = row["state"]
    job["version"] = row["version"]
    if row["idempotency_key"]:
        job["idempotency_key"] = row["idempotency_key"]
    return job


# --- accounts.json ----------------------------------------------------------

def load_accounts() -> list[dict[str, Any]]:
    rows = _conn().execute("SELECT * FROM accounts ORDER BY created_at, id").fetchall()
    return [_row_to_account(r) for r in rows]


def save_accounts(accounts: list[dict[str, Any]]) -> None:
    conn = _conn()
    # PY-03: BEGIN IMMEDIATE adquiere el lock de escritura ANTES del DELETE,
    # de modo que dos hilos no intercalen DELETE+INSERT y pierdan actualizaciones.
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute("DELETE FROM accounts")
        for acc in accounts:
            r = _account_to_row(acc)
            conn.execute(
                "INSERT INTO accounts (id, username, proxy_id, status, enc_password, meta, created_at) "
                "VALUES (:id, :username, :proxy_id, :status, :enc_password, :meta, :created_at)",
                r,
            )
    except Exception:
        conn.rollback()
        raise
    else:
        conn.commit()


def find_account(account_id: str) -> dict[str, Any] | None:
    row = _conn().execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
    return _row_to_account(row) if row else None


# --- proxies.json -----------------------------------------------------------

def load_proxies() -> list[dict[str, Any]]:
    rows = _conn().execute("SELECT * FROM proxies ORDER BY id").fetchall()
    return [_row_to_proxy(r) for r in rows]


def save_proxies(proxies: list[dict[str, Any]]) -> None:
    conn = _conn()
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute("DELETE FROM proxies")
        for proxy in proxies:
            r = _proxy_to_row(proxy)
            conn.execute(
                "INSERT INTO proxies (id, host, port, protocol, username, enc_password, status, meta) "
                "VALUES (:id, :host, :port, :protocol, :username, :enc_password, :status, :meta)",
                r,
            )
    except Exception:
        conn.rollback()
        raise
    else:
        conn.commit()


def find_proxy(proxy_id: str) -> dict[str, Any] | None:
    row = _conn().execute("SELECT * FROM proxies WHERE id = ?", (proxy_id,)).fetchone()
    return _row_to_proxy(row) if row else None


# --- queue.json -------------------------------------------------------------

def load_queue() -> list[dict[str, Any]]:
    rows = _conn().execute("SELECT * FROM jobs ORDER BY created_at, id").fetchall()
    return [_row_to_job(r) for r in rows]


def save_queue(queue: list[dict[str, Any]]) -> None:
    conn = _conn()
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute("DELETE FROM jobs")
        for job in queue:
            r = _job_to_row(job)
            conn.execute(
                "INSERT INTO jobs (id, state, payload, version, idempotency_key) "
                "VALUES (:id, :state, :payload, :version, :idempotency_key)",
                r,
            )
    except Exception:
        conn.rollback()
        raise
    else:
        conn.commit()
