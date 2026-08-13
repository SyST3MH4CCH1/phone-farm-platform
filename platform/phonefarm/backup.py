"""backup — exportación/restauración cifrada .pfbackup (paso 10).

Envelope v1 autenticado: {format, kdf: "scrypt", salt, iv, tag, ciphertext}
clave derivada de una PASSphrase con scrypt (N=2^14, r=8, p=1). Sin datos
sensibles en cabeceras. El payload incluye accounts/proxies/queue/sessions/
settings/users (secretos descifrados solo en memoria).

CLI:
  python -m phonefarm.backup export --passphrase-env PF_BACKUP_PASS [--out PATH] [--include-videos]
  python -m phonefarm.backup restore --passphrase-env PF_BACKUP_PASS --in PATH
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import sys
import time
from pathlib import Path

from phonefarm.crypto import CryptoError, decrypt_blob_envelope, encrypt_blob_envelope

SCRYPT_N = 2 ** 14
SCRYPT_R = 8
SCRYPT_P = 1


def _passphrase_key(passphrase: str, salt: bytes) -> bytes:
    return hashlib.scrypt(passphrase.encode("utf-8"), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=32)


def encrypt_with_passphrase(passphrase: str, data: bytes) -> dict:
    """Envelope cifrado con clave derivada de la passphrase (scrypt).

    Campos: `pass_salt` (salt scrypt) y `salt` (salt HKDF interno) — no se
    sobrescriben entre sí para que el descifrado sea determinista.
    """
    pass_salt = os.urandom(16)
    key = _passphrase_key(passphrase, pass_salt)
    envelope = encrypt_blob_envelope(key, data, info="pfbackup-passphrase-v1")
    envelope["kdf"] = "scrypt"
    envelope["kdf_params"] = {"n": SCRYPT_N, "r": SCRYPT_R, "p": SCRYPT_P}
    envelope["pass_salt"] = base64.b64encode(pass_salt).decode("ascii")
    return envelope


def decrypt_with_passphrase(passphrase: str, envelope: dict) -> bytes:
    pass_salt = base64.b64decode(envelope["pass_salt"])
    key = _passphrase_key(passphrase, pass_salt)
    try:
        return decrypt_blob_envelope(key, envelope)
    except CryptoError as exc:
        raise CryptoError("passphrase incorrecta o backup alterado") from exc


def _collect_payload() -> dict:
    """Reúne los datos reales de la plataforma (secretos descifrados en memoria)."""
    from phonefarm import db as pdb
    from phonefarm.platform_data import _conn, load_accounts, load_proxies, load_queue

    conn = _conn()
    sessions = {}
    for row in conn.execute("SELECT account_id, enc_json FROM social_sessions"):
        from phonefarm.crypto import decrypt_json
        from phonefarm.platform_data import _key

        sessions[row["account_id"]] = decrypt_json(_key(), "social_sessions", row["account_id"], row["enc_json"])
    users = [dict(r) for r in conn.execute("SELECT id, username, role, password_hash, created_at FROM users")]
    settings = {r["key"]: r["value"] for r in conn.execute("SELECT key, value FROM settings")}
    return {
        "format": "phonefarm-backup-v1",
        "exported_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "accounts": load_accounts(),
        "proxies": load_proxies(),
        "queue": load_queue(),
        "sessions": sessions,
        "settings": settings,
        "users": users,
    }


def cmd_export(args: argparse.Namespace) -> int:
    passphrase = os.getenv(args.passphrase_env, "")
    if not passphrase:
        sys.exit(f"[ERROR] variable de entorno {args.passphrase_env} vacía (passphrase)")
    payload = _collect_payload()
    envelope = encrypt_with_passphrase(passphrase, json.dumps(payload, ensure_ascii=False).encode("utf-8"))
    out = Path(args.out) if args.out else Path(__file__).resolve().parent.parent / "data" / "backups" / f"backup-{time.strftime('%Y%m%d-%H%M%S')}.pfbackup"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(envelope, ensure_ascii=False), encoding="utf-8")
    print(f"OK: backup cifrado en {out} ({out.stat().st_size} bytes)")
    return 0


def cmd_restore(args: argparse.Namespace) -> int:
    passphrase = os.getenv(args.passphrase_env, "")
    if not passphrase:
        sys.exit(f"[ERROR] variable de entorno {args.passphrase_env} vacía (passphrase)")
    envelope = json.loads(Path(args.in_).read_text(encoding="utf-8"))
    payload = json.loads(decrypt_with_passphrase(passphrase, envelope).decode("utf-8"))
    if payload.get("format") != "phonefarm-backup-v1":
        sys.exit("[ERROR] formato de backup desconocido")

    from phonefarm import db as pdb
    from phonefarm.platform_data import _conn, save_accounts, save_proxies, save_queue

    conn = _conn()
    with conn:
        conn.execute("DELETE FROM accounts")
        conn.execute("DELETE FROM proxies")
        conn.execute("DELETE FROM jobs")
        conn.execute("DELETE FROM social_sessions")
        conn.execute("DELETE FROM settings")
        for u in payload.get("users", []):
            conn.execute(
                "INSERT OR IGNORE INTO users (id, username, role, password_hash, created_at) VALUES (?,?,?,?,?)",
                (u["id"], u["username"], u["role"], u["password_hash"], u.get("created_at")),
            )
    save_accounts(payload.get("accounts", []))
    save_proxies(payload.get("proxies", []))
    save_queue(payload.get("queue", []))
    from phonefarm.crypto import encrypt_json
    from phonefarm.platform_data import _key

    with conn:
        for account_id, settings in payload.get("sessions", {}).items():
            conn.execute(
                "INSERT INTO social_sessions (account_id, enc_json, updated_at) VALUES (?,?,datetime('now')) "
                "ON CONFLICT(account_id) DO UPDATE SET enc_json=excluded.enc_json, updated_at=datetime('now')",
                (account_id, encrypt_json(_key(), "social_sessions", account_id, settings)),
            )
        for k, v in payload.get("settings", {}).items():
            conn.execute(
                "INSERT INTO settings (key, value, updated_at) VALUES (?,?,datetime('now')) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')",
                (k, v),
            )
    print(f"OK: restaurados {len(payload.get('accounts', []))} cuentas, "
          f"{len(payload.get('proxies', []))} proxies, {len(payload.get('queue', []))} jobs, "
          f"{len(payload.get('sessions', {}))} sesiones")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Backup cifrado .pfbackup (passphrase scrypt)")
    sub = parser.add_subparsers(dest="cmd", required=True)
    pe = sub.add_parser("export")
    pe.add_argument("--passphrase-env", required=True, help="variable de entorno con la passphrase")
    pe.add_argument("--out", default=None, help="ruta destino (.pfbackup)")
    pe.set_defaults(fn=cmd_export)
    pr = sub.add_parser("restore")
    pr.add_argument("--passphrase-env", required=True)
    pr.add_argument("--in", dest="in_", required=True, help="ruta del .pfbackup")
    pr.set_defaults(fn=cmd_restore)
    args = parser.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
