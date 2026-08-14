"""mcp-tokens — tokens de servicio para el MCP server (paso 7).

Solo se guarda el hash del token (nunca el token); el token se imprime UNA vez
al crearlo. Scopes: read, queue.write, engagement, approve, publish, admin.

CLI:
  python -m phonefarm.mcp-tokens create --name agent-1 --scopes read,queue.write [--expires-days 30]
  python -m phonefarm.mcp-tokens list
  python -m phonefarm.mcp-tokens revoke --name agent-1
"""

from __future__ import annotations

import argparse
import hashlib
import secrets
import sys
import time
from pathlib import Path

from phonefarm import db as pdb

ALL_SCOPES = {"read", "queue.write", "engagement", "approve", "publish", "admin"}


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _resolve_db() -> Path:
    import os

    env = os.getenv("PHONEFARM_DB_PATH")
    if env:
        return Path(env)
    base = Path(os.getenv("PHONEFARM_DATA_DIR", str(Path(__file__).resolve().parent.parent)))
    return base / "data" / "phonefarm.db"


def find_token(conn, token_hash: str):
    return conn.execute(
        "SELECT * FROM service_tokens WHERE token_hash=? AND revoked=0", (token_hash,)
    ).fetchone()


def token_is_valid(token: str) -> dict | None:
    """Valida un token: devuelve {id, principal, scopes} o None."""
    conn = pdb.open_migrated(_resolve_db())
    row = find_token(conn, hash_token(token))
    if row is None:
        return None
    if row["expires_at"] and row["expires_at"] < int(time.time()):
        return None
    return {"id": row["id"], "principal": row["principal"], "scopes": set(row["scopes"].split(","))}


def cmd_create(args: argparse.Namespace) -> int:
    scopes = {s.strip() for s in args.scopes.split(",") if s.strip()}
    unknown = scopes - ALL_SCOPES
    if unknown:
        sys.exit(f"[ERROR] scopes desconocidos: {sorted(unknown)} (válidos: {sorted(ALL_SCOPES)})")
    if not scopes:
        sys.exit("[ERROR] al menos un scope")
    conn = pdb.open_migrated(_resolve_db())
    token = f"pfmcp_{secrets.token_urlsafe(32)}"
    token_id = f"tok_{secrets.token_hex(4)}"
    expires_at = int(time.time()) + args.expires_days * 86400 if args.expires_days else None
    with conn:
        conn.execute(
            "INSERT INTO service_tokens (id, name, token_hash, principal, scopes, expires_at) "
            "VALUES (?,?,?,?,?,?)",
            (token_id, args.name, hash_token(token), args.principal, ",".join(sorted(scopes)), expires_at),
        )
    print(f"OK: token creado para '{args.name}' (principal={args.principal}, scopes={sorted(scopes)})")
    print(f"Token (se muestra UNA vez; solo se guarda su hash):\n{token}")
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    conn = pdb.open_migrated(_resolve_db())
    for row in conn.execute("SELECT name, principal, scopes, expires_at, revoked FROM service_tokens ORDER BY name"):
        exp = time.strftime("%Y-%m-%d", time.gmtime(row["expires_at"])) if row["expires_at"] else "never"
        print(f"{row['name']}\t{row['principal']}\t{row['scopes']}\texp={exp}\trevoked={row['revoked']}")
    return 0


def cmd_revoke(args: argparse.Namespace) -> int:
    conn = pdb.open_migrated(_resolve_db())
    with conn:
        cur = conn.execute("UPDATE service_tokens SET revoked=1 WHERE name=? AND revoked=0", (args.name,))
    if cur.rowcount == 0:
        sys.exit(f"[ERROR] token '{args.name}' no encontrado o ya revocado")
    print(f"OK: token '{args.name}' revocado")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Tokens de servicio MCP (solo hashes en BD)")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("create")
    p.add_argument("--name", required=True)
    p.add_argument("--principal", default="mcp")
    p.add_argument("--scopes", required=True, help="coma-separados: read,queue.write,engagement,approve,publish,admin")
    p.add_argument("--expires-days", type=int, default=None)
    p.set_defaults(fn=cmd_create)
    p = sub.add_parser("list")
    p.set_defaults(fn=cmd_list)
    p = sub.add_parser("revoke")
    p.add_argument("--name", required=True)
    p.set_defaults(fn=cmd_revoke)
    args = parser.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
