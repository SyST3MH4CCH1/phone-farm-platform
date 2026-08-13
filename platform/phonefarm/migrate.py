"""migrate — migración de datos en claro (JSON) a SQLite con campos cifrados.

CLI:
  python -m phonefarm.migrate --dry-run     # valida y cuenta SIN escribir nada
  python -m phonefarm.migrate --commit      # backup cifrado -> importa -> verifica -> borra originales

Datos migrados:
  accounts.json  -> tabla accounts (password -> enc_password AES-GCM)
  proxies.json   -> tabla proxies  (pass     -> enc_password AES-GCM)
  queue.json     -> tabla jobs     (payload json)
  sessions/*.json-> tabla social_sessions (json completo cifrado)

Garantías:
  - --dry-run NO escribe absolutamente nada.
  - --commit genera PRIMERO un .pfbackup cifrado (rollback) y solo después
    importa en una transacción; verifica recuentos y recién entonces elimina
    los originales en claro.
  - Si la BD ya tiene datos y no quedan JSON, se reporta "ya migrado".
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from phonefarm import db as pdb
from phonefarm.crypto import encrypt_blob_envelope
from phonefarm.keystore import get_master_key
from phonefarm.platform_data import (
    _conn,
    _key,
    db_path,
)

import logging

logger = logging.getLogger("phonefarm.migrate")


def _data_dir() -> Path:
    return db_path().parent


def _legacy_files(data_dir: Path) -> dict[str, Path]:
    return {
        "accounts": data_dir / "accounts.json",
        "proxies": data_dir / "proxies.json",
        "queue": data_dir / "queue.json",
        "sessions": data_dir / "sessions",
    }


def _load_legacy(data_dir: Path) -> dict[str, object]:
    files = _legacy_files(data_dir)
    out: dict[str, object] = {}
    for name, path in files.items():
        if name == "sessions":
            sessions = {}
            if path.is_dir():
                for f in sorted(path.glob("*.json")):
                    try:
                        sessions[f.stem] = json.loads(f.read_text(encoding="utf-8"))
                    except json.JSONDecodeError as exc:
                        raise SystemExit(f"[ERROR] sesión corrupta {f}: {exc}") from exc
            out[name] = sessions
        elif path.exists():
            try:
                out[name] = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                raise SystemExit(f"[ERROR] JSON corrupto {path}: {exc}") from exc
        else:
            out[name] = [] if name != "queue" else []
    return out


def _counts(legacy: dict[str, object]) -> dict[str, int]:
    sessions = legacy.get("sessions", {})
    return {
        "accounts": len(legacy.get("accounts", [])),
        "proxies": len(legacy.get("proxies", [])),
        "queue": len(legacy.get("queue", [])),
        "sessions": len(sessions) if isinstance(sessions, dict) else 0,
    }


def dry_run(data_dir: Path | None = None) -> int:
    data_dir = data_dir or _data_dir()
    legacy = _load_legacy(data_dir)
    counts = _counts(legacy)
    print(f"dry-run — directorio {data_dir}")
    print(f"  accounts.json : {counts['accounts']} registros")
    print(f"  proxies.json  : {counts['proxies']} registros")
    print(f"  queue.json    : {counts['queue']} trabajos")
    print(f"  sessions/*.json: {counts['sessions']} sesiones")
    if sum(counts.values()) == 0:
        print("  (nada que migrar)")
    return 0


def _write_backup(legacy: dict[str, object], data_dir: Path) -> Path:
    """Backup cifrado .pfbackup con la clave maestra (rollback de migración)."""
    backups_dir = data_dir / "backups"
    backups_dir.mkdir(parents=True, exist_ok=True)
    ts = time.strftime("%Y%m%d-%H%M%S")
    out = backups_dir / f"migration-{ts}.pfbackup"
    payload = json.dumps(legacy, ensure_ascii=False, default=str).encode("utf-8")
    envelope = encrypt_blob_envelope(_key(), payload, info="pfmigration-v1")
    out.write_text(json.dumps(envelope, ensure_ascii=False), encoding="utf-8")
    print(f"  backup cifrado: {out} ({len(payload)} bytes cifrados)")
    return out


def commit(data_dir: Path | None = None, skip_backup: bool = False) -> int:
    data_dir = data_dir or _data_dir()
    legacy = _load_legacy(data_dir)
    counts = _counts(legacy)

    conn = _conn()
    existing = conn.execute("SELECT COUNT(*) FROM accounts").fetchone()[0]
    if existing > 0 and sum(counts.values()) == 0:
        print("ya migrado: la BD tiene datos y no quedan JSON en claro.")
        return 0

    # 1) backup cifrado ANTES de tocar nada
    backup_path = None if skip_backup else _write_backup(legacy, data_dir)

    # 2) importación en UNA transacción
    with conn:
        conn.execute("DELETE FROM accounts")
        conn.execute("DELETE FROM proxies")
        conn.execute("DELETE FROM jobs")
        conn.execute("DELETE FROM social_sessions")
        for acc in legacy.get("accounts", []):
            if not isinstance(acc, dict) or not acc.get("id"):
                raise SystemExit("[ERROR] registro de cuenta inválido (sin id)")
            _insert_account(conn, acc)
        for proxy in legacy.get("proxies", []):
            if not isinstance(proxy, dict) or not proxy.get("id"):
                raise SystemExit("[ERROR] registro de proxy inválido (sin id)")
            _insert_proxy(conn, proxy)
        for job in legacy.get("queue", []):
            if not isinstance(job, dict) or not job.get("id"):
                raise SystemExit("[ERROR] trabajo inválido (sin id)")
            _insert_job(conn, job)
        sessions = legacy.get("sessions", {})
        if isinstance(sessions, dict):
            for account_id, settings in sessions.items():
                _insert_session(conn, str(account_id), settings)

    # 3) verificación de recuentos
    actual = {
        "accounts": conn.execute("SELECT COUNT(*) FROM accounts").fetchone()[0],
        "proxies": conn.execute("SELECT COUNT(*) FROM proxies").fetchone()[0],
        "queue": conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0],
        "sessions": conn.execute("SELECT COUNT(*) FROM social_sessions").fetchone()[0],
    }
    for name, expected in counts.items():
        if actual[name] != expected:
            raise SystemExit(
                f"[ERROR] verificación fallida en {name}: esperado {expected}, real {actual[name]}. "
                f"Rollback disponible en {backup_path}"
            )
    print(f"  verificación OK: {actual}")

    # 4) eliminar originales en claro (el rollback es el .pfbackup cifrado)
    files = _legacy_files(data_dir)
    removed: list[str] = []
    for name, path in files.items():
        if name == "sessions":
            if path.is_dir():
                for f in path.glob("*.json"):
                    f.unlink()
                try:
                    path.rmdir()
                except OSError:
                    pass
                removed.append(str(path))
        elif path.exists():
            path.unlink()
            removed.append(str(path))
    print(f"  originales en claro eliminados: {len(removed)}")

    # registro en backup_meta
    with conn:
        conn.execute(
            "INSERT INTO backup_meta (kind, info) VALUES (?,?)",
            ("migration", json.dumps({"counts": counts, "backup": str(backup_path)}, ensure_ascii=False)),
        )
    print("migración completada.")
    return 0


def _insert_account(conn, acc: dict) -> None:
    from phonefarm.platform_data import _account_to_row

    r = _account_to_row(acc)
    conn.execute(
        "INSERT INTO accounts (id, username, proxy_id, status, enc_password, meta, created_at) "
        "VALUES (:id,:username,:proxy_id,:status,:enc_password,:meta,:created_at)",
        r,
    )


def _insert_proxy(conn, proxy: dict) -> None:
    from phonefarm.platform_data import _proxy_to_row

    r = _proxy_to_row(proxy)
    conn.execute(
        "INSERT INTO proxies (id, host, port, protocol, username, enc_password, status, meta) "
        "VALUES (:id,:host,:port,:protocol,:username,:enc_password,:status,:meta)",
        r,
    )


def _insert_job(conn, job: dict) -> None:
    from phonefarm.platform_data import _job_to_row

    r = _job_to_row(job)
    conn.execute(
        "INSERT INTO jobs (id, state, payload, version, idempotency_key) "
        "VALUES (:id,:state,:payload,:version,:idempotency_key)",
        r,
    )


def _insert_session(conn, account_id: str, settings: object) -> None:
    from phonefarm.crypto import encrypt_json

    envelope = encrypt_json(_key(), "social_sessions", account_id, settings)
    conn.execute(
        "INSERT INTO social_sessions (account_id, enc_json, updated_at) VALUES (?,?,datetime('now'))",
        (account_id, envelope),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Migración JSON->SQLite cifrado (paso 4)")
    parser.add_argument("--dry-run", action="store_true", help="valida y cuenta sin escribir")
    parser.add_argument("--commit", action="store_true", help="migra con backup cifrado previo")
    parser.add_argument("--skip-backup", action="store_true", help=argparse.SUPPRESS)  # solo tests
    args = parser.parse_args()
    if args.dry_run:
        return dry_run()
    if args.commit:
        return commit(skip_backup=args.skip_backup)
    parser.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
