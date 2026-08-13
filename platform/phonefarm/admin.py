"""admin — gestión de usuarios del panel (passwords con scrypt).

CLI:
  python -m phonefarm.admin create [--username admin] [--role admin|operator]
        [--password-env ADMIN_PASSWORD]     # leer password de una variable de entorno
        [--db PATH]                          # PHONEFARM_DB_PATH si no se indica
  python -m phonefarm.admin list [--db PATH]
  python -m phonefarm.admin reset-password --username X [--password-env VAR]

Sin --password-env, pide el password interactivamente (no se muestra).
Reglas de password: >=16 chars, sin valores conocidos (espejo de server/config.ts).
"""

from __future__ import annotations

import argparse
import getpass
import hashlib
import hmac
import os
import secrets
import sys
from pathlib import Path

from phonefarm import db as pdb

SCRYPT_N = 2 ** 14
SCRYPT_R = 8
SCRYPT_P = 1
PREFIX = "scrypt"

FORBIDDEN_PASSWORDS = {"admin123", "operator123", "password", "changeme", "12345678", "password123", "phonefarm", "admin"}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=32)
    return f"${PREFIX}${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, _prefix, n, r, p, salt_hex, hash_hex = stored.split("$")
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
        dk = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=int(n), r=int(r), p=int(p), dklen=len(expected))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(dk, expected)


def validate_password(password: str) -> str | None:
    """Devuelve un mensaje de error o None si el password es aceptable."""
    if not password or len(password) < 16:
        return "El password debe tener >=16 caracteres"
    if password.lower() in FORBIDDEN_PASSWORDS:
        return "El password es un valor conocido (prohibido)"
    return None


def resolve_db_path(arg: str | None) -> Path:
    if arg:
        return Path(arg)
    env = os.getenv("PHONEFARM_DB_PATH")
    if env:
        return Path(env)
    base = Path(os.getenv("PHONEFARM_DATA_DIR", str(Path(__file__).resolve().parent.parent)))
    return base / "data" / "phonefarm.db"


def _prompt_password(env_var: str | None) -> str:
    if env_var:
        pw = os.getenv(env_var, "")
        if not pw:
            sys.exit(f"[ERROR] variable de entorno {env_var} vacía")
        return pw
    pw = getpass.getpass("Password del usuario (>=16 chars, no se muestra): ")
    if not pw:
        sys.exit("[ERROR] password vacío")
    return pw


def cmd_create(args: argparse.Namespace) -> int:
    password = _prompt_password(args.password_env)
    err = validate_password(password)
    if err:
        sys.exit(f"[ERROR] {err}")
    conn = pdb.open_migrated(resolve_db_path(args.db))
    if pdb.find_user(conn, args.username):
        sys.exit(f"[ERROR] el usuario {args.username!r} ya existe")
    user_id = f"usr_{secrets.token_hex(4)}"
    pdb.create_user(conn, user_id, args.username, args.role, hash_password(password))
    print(f"OK: usuario {args.username!r} ({args.role}) creado — id {user_id}")
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    conn = pdb.open_migrated(resolve_db_path(args.db))
    for row in conn.execute("SELECT id, username, role, created_at FROM users ORDER BY username"):
        print(f"{row['username']}\t{row['role']}\t{row['id']}\t{row['created_at']}")
    return 0


def cmd_reset(args: argparse.Namespace) -> int:
    password = _prompt_password(args.password_env)
    err = validate_password(password)
    if err:
        sys.exit(f"[ERROR] {err}")
    conn = pdb.open_migrated(resolve_db_path(args.db))
    row = pdb.find_user(conn, args.username)
    if not row:
        sys.exit(f"[ERROR] usuario {args.username!r} no existe")
    pdb.update_password(conn, row["id"], hash_password(password))
    print(f"OK: password de {args.username!r} actualizado")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Usuarios del panel Phone Farm (scrypt)")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_create = sub.add_parser("create", help="crear usuario")
    p_create.add_argument("--username", default="admin")
    p_create.add_argument("--role", choices=["admin", "operator"], default="admin")
    p_create.add_argument("--password-env", default=None, help="variable de entorno con el password")
    p_create.add_argument("--db", default=None)
    p_create.set_defaults(fn=cmd_create)

    p_list = sub.add_parser("list", help="listar usuarios (sin hashes)")
    p_list.add_argument("--db", default=None)
    p_list.set_defaults(fn=cmd_list)

    p_reset = sub.add_parser("reset-password", help="cambiar password")
    p_reset.add_argument("--username", required=True)
    p_reset.add_argument("--password-env", default=None)
    p_reset.add_argument("--db", default=None)
    p_reset.set_defaults(fn=cmd_reset)

    args = parser.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
