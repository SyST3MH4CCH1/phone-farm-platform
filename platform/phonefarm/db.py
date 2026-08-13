"""db — Conexión SQLite de Phone Farm (WAL, migraciones versionadas).

Python (sqlite3 estándar) es el DUEÑO de las migraciones; Express abre el mismo
fichero con better-sqlite3 y respeta `PRAGMA user_version`.

Todas las conexiones aplican:
  PRAGMA journal_mode=WAL      (lectura/escritura multiproceso)
  PRAGMA foreign_keys=ON
  PRAGMA busy_timeout=5000
"""

from __future__ import annotations

import logging
import sqlite3
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

def _ensure_column(conn: sqlite3.Connection, table: str, column: str, ddl: str) -> None:
    cols = [r["name"] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()]
    if column not in cols:
        conn.execute(ddl)

# Migraciones versionadas: el índice es user_version destino.
# Una entrada puede ser SQL (executescript) o callable(conn) para cambios
# condicionales (p.ej. ADD COLUMN en BDs existentes).
MIGRATIONS: list[Any] = [
    # --- v1: esquema inicial (pasos 3-7) ---
    """
    CREATE TABLE users (
        id            TEXT PRIMARY KEY,
        username      TEXT NOT NULL UNIQUE,
        role          TEXT NOT NULL CHECK (role IN ('admin','operator')),
        password_hash TEXT NOT NULL,           -- scrypt: $scrypt$N$r$p$salt_hex$hash_hex
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT
    );

    CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,           -- sha256(token); nunca el token en claro
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        revoked    INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE rate_limits (
        key          TEXT PRIMARY KEY,         -- 'login:user:ip' | 'login:ip' | 'mcp:<token_id>'
        count        INTEGER NOT NULL,
        window_start INTEGER NOT NULL
    );

    CREATE TABLE accounts (
        id           TEXT PRIMARY KEY,
        username     TEXT NOT NULL,
        proxy_id     TEXT,
        status       TEXT NOT NULL DEFAULT 'active',
        enc_password TEXT,                     -- envelope AES-256-GCM v1 (paso 4)
        meta         TEXT,                     -- json sin datos sensibles
        created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE proxies (
        id           TEXT PRIMARY KEY,
        host         TEXT NOT NULL,
        port         INTEGER NOT NULL,
        protocol     TEXT NOT NULL DEFAULT 'http',
        username     TEXT,
        enc_password TEXT,
        status       TEXT NOT NULL DEFAULT 'new',
        meta         TEXT,                     -- json sin datos sensibles
        created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE jobs (
        id              TEXT PRIMARY KEY,
        state           TEXT NOT NULL,
        payload         TEXT NOT NULL,         -- json
        version         INTEGER NOT NULL DEFAULT 1,
        idempotency_key TEXT UNIQUE,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT
    );

    CREATE TABLE social_sessions (
        account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
        enc_json   TEXT NOT NULL,              -- sesión instagrapi cifrada (paso 4)
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE service_tokens (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,       -- sha256(token)
        principal  TEXT NOT NULL,
        scopes     TEXT NOT NULL,              -- coma-separados: read,queue.write,...
        expires_at INTEGER,
        revoked    INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE audit_log (
        seq        INTEGER PRIMARY KEY AUTOINCREMENT,
        ts         TEXT NOT NULL DEFAULT (datetime('now')),
        actor      TEXT,
        role       TEXT,
        action     TEXT NOT NULL,
        object     TEXT,
        meta       TEXT,
        request_id TEXT,
        prev_hash  TEXT,
        hash       TEXT                       -- HMAC encadenado (paso 6)
    );

    CREATE TABLE backup_meta (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        kind       TEXT NOT NULL,
        info       TEXT
    );
    """,
    # --- v2: columna meta en proxies (solo si falta — compatibilidad v1) ---
    lambda conn: _ensure_column(conn, "proxies", "meta", "ALTER TABLE proxies ADD COLUMN meta TEXT"),
]


def connect(db_path: str | Path) -> sqlite3.Connection:
    """Abre una conexión con WAL + foreign keys + busy timeout."""
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), timeout=5)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def current_version(conn: sqlite3.Connection) -> int:
    row = conn.execute("PRAGMA user_version").fetchone()
    return int(row[0])


def migrate(conn: sqlite3.Connection) -> int:
    """Aplica migraciones pendientes en transacciones; devuelve la versión final."""
    version = current_version(conn)
    for target, step in enumerate(MIGRATIONS, start=1):
        if target <= version:
            continue
        with conn:  # transacción
            if callable(step):
                step(conn)
            else:
                conn.executescript(step)
            conn.execute(f"PRAGMA user_version={target}")
        logger.info("migración aplicada: user_version %d -> %d", version, target)
        version = target
    return version


def open_migrated(db_path: str | Path) -> sqlite3.Connection:
    """Abre (o crea) la BD y aplica migraciones. Uso habitual al arrancar."""
    conn = connect(db_path)
    migrate(conn)
    return conn


# --- helpers de usuario (paso 3) ---

def find_user(conn: sqlite3.Connection, username: str) -> Optional[sqlite3.Row]:
    return conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()


def count_admins(conn: sqlite3.Connection) -> int:
    row = conn.execute("SELECT COUNT(*) AS n FROM users WHERE role='admin'").fetchone()
    return int(row["n"])


def create_user(conn: sqlite3.Connection, user_id: str, username: str, role: str, password_hash: str) -> None:
    with conn:
        conn.execute(
            "INSERT INTO users (id, username, role, password_hash) VALUES (?,?,?,?)",
            (user_id, username, role, password_hash),
        )


def update_password(conn: sqlite3.Connection, user_id: str, password_hash: str) -> None:
    with conn:
        conn.execute(
            "UPDATE users SET password_hash=?, updated_at=datetime('now') WHERE id=?",
            (password_hash, user_id),
        )


def _row_to_dict(row: Optional[sqlite3.Row]) -> Optional[dict[str, Any]]:
    return dict(row) if row else None
