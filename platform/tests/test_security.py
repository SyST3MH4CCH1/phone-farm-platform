"""Pruebas de seguridad de platform/ (paso 1: infraestructura; paso 3: BD/usuarios/clave; paso 4: cifrado).

Baseline: verifica comportamientos que la auditoría da por controlados y que
el paquete importa sin dependencias externas. Todas las pruebas de datos usan
entornos aislados (tmp_path + provider file de clave).
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest


def test_package_importable():
    import phonefarm.platform_data  # noqa: F401
    assert True


# ---------------------------------------------------------------------------
# Paso 3 — SQLite, usuarios (scrypt) y clave maestra
# ---------------------------------------------------------------------------

def test_migraciones_crean_tablas_y_son_idempotentes(tmp_path: Path):
    from phonefarm import db as pdb

    db_path = tmp_path / "phonefarm.db"
    conn = pdb.open_migrated(db_path)
    assert pdb.current_version(conn) == len(pdb.MIGRATIONS)
    tables = {r["name"] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    expected = {"users", "sessions", "rate_limits", "accounts", "proxies", "jobs",
                "social_sessions", "service_tokens", "settings", "audit_log", "backup_meta"}
    assert expected <= tables
    conn.close()
    # re-abrir no rompe (idempotente) y deja WAL activo
    conn2 = pdb.open_migrated(db_path)
    assert pdb.current_version(conn2) == len(pdb.MIGRATIONS)
    mode = conn2.execute("PRAGMA journal_mode").fetchone()[0]
    assert mode.lower() == "wal"
    conn2.close()


def test_scrypt_roundtrip_y_password_incorrecto():
    from phonefarm.admin import hash_password, verify_password

    h = hash_password("s3cr3t0-muy-largo-123456")
    assert h.startswith("$scrypt$")
    assert verify_password("s3cr3t0-muy-largo-123456", h)
    assert not verify_password("otra-cosa-123456", h)


def test_validate_password_reglas():
    from phonefarm.admin import validate_password

    assert validate_password("admin123") is not None          # conocido
    assert validate_password("corto") is not None             # <16
    assert validate_password("largo-suficiente-123456") is None


def test_cli_create_admin_e2e(tmp_path: Path):
    """python -m phonefarm.admin create --password-env → BD migrada con admin."""
    db_path = tmp_path / "phonefarm.db"
    env = dict(os.environ)
    env["ADMIN_TEST_PW"] = "s3cr3t0-muy-largo-123456"
    res = subprocess.run(
        [sys.executable, "-m", "phonefarm.admin", "create",
         "--username", "admin", "--role", "admin",
         "--password-env", "ADMIN_TEST_PW", "--db", str(db_path)],
        capture_output=True, text=True, env=env, cwd=str(Path(__file__).resolve().parent.parent),
    )
    assert res.returncode == 0, res.stderr
    from phonefarm import db as pdb
    from phonefarm.admin import verify_password

    conn = pdb.open_migrated(db_path)
    row = pdb.find_user(conn, "admin")
    assert row is not None and row["role"] == "admin"
    assert verify_password("s3cr3t0-muy-largo-123456", row["password_hash"])
    conn.close()


def test_keystore_provider_file_roundtrip(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    from phonefarm import keystore

    key_path = tmp_path / "master.key"
    monkeypatch.setenv("PHONEFARM_MASTER_KEY_PATH", str(key_path))
    key = keystore.ensure_master_key(provider="file")
    assert len(key) == 32
    key2 = keystore.get_master_key(provider="file")
    assert key2 == key
    assert key_path.exists()


def test_keystore_falla_sin_clave(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    from phonefarm.keystore import MasterKeyError, get_master_key

    monkeypatch.setenv("PHONEFARM_MASTER_KEY_PATH", str(tmp_path / "no-existe.key"))
    with pytest.raises(MasterKeyError):
        get_master_key(provider="file")


@pytest.mark.skipif(sys.platform != "win32", reason="DPAPI solo en Windows")
def test_keystore_dpapi_roundtrip(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """DPAPI CurrentUser: la clave en disco es un blob protegido (no hex claro)."""
    from phonefarm import keystore

    key_path = tmp_path / "master.key.dpapi"
    monkeypatch.setenv("PHONEFARM_MASTER_KEY_PATH", str(key_path))
    key = keystore.ensure_master_key(provider="dpapi")
    assert len(key) == 32
    blob = key_path.read_bytes()
    # el blob DPAPI no es la clave en claro ni su forma hex
    assert blob != key
    assert blob != key.hex().encode("ascii")
    assert keystore.get_master_key(provider="dpapi") == key


# ---------------------------------------------------------------------------
# Paso 4 — cifrado AES-GCM y migración
# ---------------------------------------------------------------------------

@pytest.fixture
def crypto_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Entorno aislado: BD + clave maestra (provider file) en tmp_path."""
    monkeypatch.setenv("PHONEFARM_DB_PATH", str(tmp_path / "phonefarm.db"))
    monkeypatch.setenv("PHONEFARM_MASTER_KEY_PATH", str(tmp_path / "master.key"))
    monkeypatch.setenv("PHONEFARM_KEY_PROVIDER", "file")
    from phonefarm.keystore import ensure_master_key

    ensure_master_key(provider="file")  # crea la clave del entorno de prueba
    import phonefarm.platform_data as pd

    # reiniciar estado del módulo (conexión por-thread y clave cacheada)
    pd._master_key = None
    if hasattr(pd._local, "conn"):
        try:
            pd._local.conn.close()
        except Exception:
            pass
        del pd._local.conn
    return tmp_path


def test_crypto_roundtrip_y_tamper(crypto_env):
    from phonefarm.crypto import CryptoError, decrypt_field, encrypt_field

    key = bytes(range(32))
    env = encrypt_field(key, "accounts", "acc_01", "password", "s3cr3to-123")
    assert decrypt_field(key, "accounts", "acc_01", "password", env) == "s3cr3to-123"
    # AAD distinto (otra fila u otro campo) → falla
    with pytest.raises(CryptoError):
        decrypt_field(key, "accounts", "acc_02", "password", env)
    # tamper del ciphertext → falla sin devolver plaintext
    parts = env.split(":")
    tampered = ":".join([parts[0], parts[1], parts[2], "AAAA" + parts[3][4:]])
    with pytest.raises(CryptoError):
        decrypt_field(key, "accounts", "acc_01", "password", tampered)


def test_platform_data_no_guarda_passwords_en_claro(crypto_env):
    import sqlite3

    import phonefarm.platform_data as pd

    pd.save_accounts([{
        "id": "acc_01", "username": "u1", "password": "pass-secreto-1",
        "status": "active", "device_serial": "SER123", "warmup_day": 2,
    }])
    pd.save_proxies([{
        "id": "proxy_01", "host": "1.2.3.4", "port": 8080, "type": "socks5",
        "user": "px", "pass": "pass-proxy-secreto",
    }])

    # el fichero SQLite en bruto NO contiene los secretos en claro
    raw = (crypto_env / "phonefarm.db").read_bytes()
    assert b"pass-secreto-1" not in raw
    assert b"pass-proxy-secreto" not in raw

    # roundtrip por la API pública del módulo
    accs = pd.load_accounts()
    assert accs[0]["password"] == "pass-secreto-1"
    assert accs[0]["device_serial"] == "SER123"
    proxies = pd.load_proxies()
    assert proxies[0]["pass"] == "pass-proxy-secreto"
    assert proxies[0]["type"] == "socks5"


def test_migrate_dry_run_no_escribe(crypto_env):
    import phonefarm.migrate as mig

    (crypto_env / "accounts.json").write_text(
        json.dumps([{"id": "acc_01", "username": "u1", "password": "p1", "status": "active"}], ensure_ascii=False),
        encoding="utf-8",
    )
    (crypto_env / "proxies.json").write_text("[]", encoding="utf-8")
    (crypto_env / "queue.json").write_text("[]", encoding="utf-8")

    mig.dry_run(crypto_env)

    # dry-run: no toca la BD ni borra los JSON
    import phonefarm.platform_data as pd

    assert pd.load_accounts() == []
    assert (crypto_env / "accounts.json").exists()
    assert not list((crypto_env / "backups").glob("*")) if (crypto_env / "backups").exists() else True


def test_migrate_commit_con_backup_y_verificacion(crypto_env):
    import phonefarm.migrate as mig
    import phonefarm.platform_data as pd

    (crypto_env / "accounts.json").write_text(json.dumps([
        {"id": "acc_01", "username": "u1", "password": "pass-a-1", "status": "active", "device_serial": "S1"},
        {"id": "acc_02", "username": "u2", "password": "pass-a-2", "status": "active"},
    ], ensure_ascii=False), encoding="utf-8")
    (crypto_env / "proxies.json").write_text(json.dumps([
        {"id": "proxy_01", "host": "1.2.3.4", "port": 8080, "type": "socks5", "user": "u", "pass": "pass-p-1"},
    ], ensure_ascii=False), encoding="utf-8")
    (crypto_env / "queue.json").write_text(json.dumps([
        {"id": "job_01", "status": "pending", "keyword": "test"},
    ], ensure_ascii=False), encoding="utf-8")
    (crypto_env / "sessions").mkdir()
    (crypto_env / "sessions" / "acc_01.json").write_text(
        json.dumps({"sessionid": "cookie-secreta-1"}), encoding="utf-8"
    )

    assert mig.commit(crypto_env) == 0

    # verificación: recuentos y datos descifrados
    accs = pd.load_accounts()
    assert len(accs) == 2
    assert accs[0]["password"] == "pass-a-1"
    proxies = pd.load_proxies()
    assert proxies[0]["pass"] == "pass-p-1"
    queue = pd.load_queue()
    assert queue[0]["status"] == "pending"
    assert queue[0]["keyword"] == "test"
    from phonefarm import publisher

    settings = publisher._load_settings("acc_01")
    assert settings == {"sessionid": "cookie-secreta-1"}

    # originales en claro eliminados
    assert not (crypto_env / "accounts.json").exists()
    assert not (crypto_env / "proxies.json").exists()
    assert not (crypto_env / "queue.json").exists()
    assert not (crypto_env / "sessions").exists()

    # backup cifrado existe y NO contiene secretos en claro
    backups = list((crypto_env / "backups").glob("migration-*.pfbackup"))
    assert len(backups) == 1
    raw = backups[0].read_bytes()
    assert b"pass-a-1" not in raw and b"cookie-secreta-1" not in raw

    # el backup es descifrable (rollback funcional)
    from phonefarm.crypto import decrypt_blob_envelope

    envelope = json.loads(backups[0].read_text(encoding="utf-8"))
    data = json.loads(decrypt_blob_envelope(pd._key(), envelope).decode("utf-8"))
    assert data["accounts"][0]["password"] == "pass-a-1"


def test_migrate_commit_es_idempotente(crypto_env):
    import phonefarm.migrate as mig
    import phonefarm.platform_data as pd

    (crypto_env / "accounts.json").write_text(json.dumps([
        {"id": "acc_01", "username": "u1", "password": "pass-a-1", "status": "active"},
    ], ensure_ascii=False), encoding="utf-8")
    (crypto_env / "proxies.json").write_text("[]", encoding="utf-8")
    (crypto_env / "queue.json").write_text("[]", encoding="utf-8")
    assert mig.commit(crypto_env) == 0
    # segunda ejecución sin JSON en claro → "ya migrado"
    assert mig.commit(crypto_env) == 0
    assert len(pd.load_accounts()) == 1


# ---------------------------------------------------------------------------
# Paso 5 — RBAC en Flask, fin de auto_approve, publicación con versión
# ---------------------------------------------------------------------------

@pytest.fixture
def flask_client(crypto_env, monkeypatch: pytest.MonkeyPatch):
    """Cliente de prueba de la app Flask con token interno y rol por defecto."""
    import phonefarm.platform as pf

    monkeypatch.setenv("INTERNAL_TOKEN", "test-internal-token")
    pf.INTERNAL_TOKEN = "test-internal-token"
    pf.app.config.update(TESTING=True)
    # aislar la cola en la BD de prueba
    return pf.app.test_client()


def _hdr(role: str = "admin") -> dict[str, str]:
    return {"X-Internal-Auth": "test-internal-token", "X-Role": role}


def test_queue_create_rechaza_auto_approve(flask_client):
    res = flask_client.post("/api/queue", json={"keyword": "x", "auto_approve": True}, headers=_hdr())
    assert res.status_code == 400
    assert "auto_approve" in res.get_json()["error"]


def test_require_role_en_publicacion(flask_client):
    # token interno válido pero SIN X-Role → 403 (Flask no confía en llamadas sin identidad)
    res = flask_client.post("/api/queue/job_1/publish",
                            json={"confirm": True, "expected_version": 1},
                            headers={"X-Internal-Auth": "test-internal-token"})
    assert res.status_code == 403


def test_publish_exige_estado_ready_version_y_confirmacion(flask_client, monkeypatch):
    import phonefarm.platform as pf

    monkeypatch.setattr(pf, "_spawn", lambda jid, target: True)  # no lanzar worker real

    created = flask_client.post("/api/queue", json={"keyword": "test"}, headers=_hdr()).get_json()
    job_id = created["id"]
    assert created["status"] == "pending"

    # publicar sin ready_for_publish → 409
    res = flask_client.post(f"/api/queue/{job_id}/publish",
                            json={"confirm": True, "expected_version": 1}, headers=_hdr())
    assert res.status_code == 409

    # marcar ready (awaiting_preview → ready_for_publish) y publicar
    res = flask_client.post(f"/api/queue/{job_id}/ready", json={}, headers=_hdr())
    assert res.status_code == 409  # aún no hay vídeo (awaiting_preview no alcanzado)
    # simular el estado real del pipeline
    from phonefarm.platform_data import load_queue, save_queue

    queue = load_queue()
    for j in queue:
        if j["id"] == job_id:
            j["status"] = "awaiting_preview"
            j["video_path"] = "/tmp/fake.mp4"
    save_queue(queue)

    res = flask_client.post(f"/api/queue/{job_id}/ready", json={}, headers=_hdr())
    assert res.status_code == 200
    assert res.get_json()["status"] == "ready_for_publish"

    # sin confirmación → 400; versión incorrecta → 409
    res = flask_client.post(f"/api/queue/{job_id}/publish", json={"expected_version": 1}, headers=_hdr())
    assert res.status_code == 400
    res = flask_client.post(f"/api/queue/{job_id}/publish",
                            json={"confirm": True, "expected_version": 999}, headers=_hdr())
    assert res.status_code == 409

    # flujo correcto → 202 y lanza el worker
    res = flask_client.post(f"/api/queue/{job_id}/publish",
                            json={"confirm": True, "expected_version": 2}, headers=_hdr())
    assert res.status_code == 202


def test_operator_no_puede_publicar_ni_aprobar(flask_client):
    op = _hdr(role="operator")
    res = flask_client.post("/api/queue/job_1/publish", json={"confirm": True, "expected_version": 1}, headers=op)
    assert res.status_code == 403
    res = flask_client.post("/api/queue/job_1/approve", json={}, headers=op)
    assert res.status_code == 403
    res = flask_client.post("/api/accounts/acc_1/instagram/login", json={"password": "x"}, headers=op)
    assert res.status_code == 403


def test_login_ig_admin_usa_username_almacenado(flask_client, monkeypatch):
    import phonefarm.platform_data as pd
    from phonefarm import publisher

    pd.save_accounts([{"id": "acc_01", "username": "real_user", "password": "x", "status": "active"}])
    calls: list[tuple] = []
    monkeypatch.setattr(publisher, "login_once", lambda aid, username, password: calls.append((aid, username, password)) or aid)
    res = flask_client.post("/api/accounts/acc_01/instagram/login",
                            json={"username": "otro_user", "password": "secreto"},
                            headers=_hdr("admin"))
    assert res.status_code == 200
    assert calls == [("acc_01", "real_user", "secreto")]  # identidad desde :id, no del body


# ---------------------------------------------------------------------------
# Paso 6 — identidad (loopback) y auditoría encadenada HMAC
# ---------------------------------------------------------------------------

def test_audit_chain_integra_y_detecta_tamper(crypto_env):
    import phonefarm.audit as audit
    import phonefarm.platform_data as pd

    conn = pd._conn()
    audit.log_action(conn, actor="admin", role="admin", action="test.one", object="obj_1", request_id="r1")
    audit.log_action(conn, actor="operator", role="operator", action="test.two", object="obj_2", request_id="r2")
    audit.log_action(conn, actor="system", role="system", action="test.three", request_id="r3")

    assert audit.verify_chain(conn) == []

    # tamper: modificar el meta del evento 2 invalida el hash de esa fila
    with conn:
        conn.execute("UPDATE audit_log SET meta='x' WHERE seq=2")
    violations = audit.verify_chain(conn)
    assert "seq 2: hash inválido (tamper)" in violations

    # borrar un evento intermedio rompe el encadenado de la fila siguiente
    with conn:
        conn.execute("DELETE FROM audit_log WHERE seq=1")
    violations = audit.verify_chain(conn)
    assert any("prev_hash roto" in v for v in violations)


def test_identity_headers_solo_loopback(flask_client):
    # desde un origen NO loopback, X-Actor/X-Role → 403 aunque el token valga
    res = flask_client.post("/api/queue", json={"keyword": "x"},
                            headers={**_hdr(), "X-Actor": "admin"},
                            environ_overrides={"REMOTE_ADDR": "10.0.0.5"})
    assert res.status_code == 403
    # desde loopback con token → OK
    res = flask_client.post("/api/queue", json={"keyword": "x"}, headers=_hdr())
    assert res.status_code == 201


def test_internal_audit_endpoint(flask_client, crypto_env):
    import phonefarm.platform_data as pd

    res = flask_client.post("/internal/audit", json={
        "actor": "admin", "role": "admin", "action": "auth.login",
        "meta": {"ip": "127.0.0.1"}, "request_id": "req-123",
    }, headers={"X-Internal-Auth": "test-internal-token"})
    assert res.status_code == 200
    row = pd._conn().execute("SELECT * FROM audit_log ORDER BY seq DESC LIMIT 1").fetchone()
    assert row["actor"] == "admin" and row["action"] == "auth.login"
    assert row["request_id"] == "req-123"
    assert row["hash"] and row["prev_hash"] is None  # primera entrada de la cadena


# ---------------------------------------------------------------------------
# Paso 7 — MCP: Bearer auth, scopes y rate limit
# ---------------------------------------------------------------------------

def _create_mcp_token(crypto_env, scopes: str, name: str = "agent-test") -> str:
    import subprocess

    res = subprocess.run(
        [sys.executable, "-m", "phonefarm.mcp_tokens", "create",
         "--name", name, "--scopes", scopes, "--expires-days", "7"],
        capture_output=True, text=True, cwd=str(Path(__file__).resolve().parent.parent),
    )
    assert res.returncode == 0, res.stderr
    token = [l for l in res.stdout.splitlines() if l.startswith("pfmcp_")][0]
    return token.strip()


def _stub_asgi_app(messages: list):
    """App ASGI stub que registra que fue alcanzada y responde 200."""
    async def app(scope, receive, send):
        messages.append(scope["type"])
        body = b'{"ok": true}'
        await send({"type": "http.response.start", "status": 200, "headers": [(b"content-type", b"application/json")]})
        await send({"type": "http.response.body", "body": body})
    return app


def test_mcp_sin_token_401(crypto_env):
    from starlette.testclient import TestClient

    from phonefarm.mcp_server import BearerAuthMiddleware

    reached: list = []
    client = TestClient(BearerAuthMiddleware(_stub_asgi_app(reached)))
    r = client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    assert r.status_code == 401
    r = client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
                    headers={"Authorization": "Bearer token-invalido"})
    assert r.status_code == 401
    assert reached == []  # la app aguas abajo nunca se alcanza sin token válido


def test_mcp_con_token_valido_pasa(crypto_env):
    from starlette.testclient import TestClient

    from phonefarm.mcp_server import BearerAuthMiddleware

    token = _create_mcp_token(crypto_env, "read")
    reached: list = []
    client = TestClient(BearerAuthMiddleware(_stub_asgi_app(reached)))
    r = client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert reached  # el request autenticado llegó a la app


def test_mcp_scope_denegado(crypto_env):
    """Token con scope read no puede publicar (scope publish)."""
    import asyncio

    from phonefarm.mcp_server import _current_principal, mcp

    token = _create_mcp_token(crypto_env, "read")
    from phonefarm.mcp_tokens import token_is_valid

    principal = token_is_valid(token)
    assert principal is not None

    async def run():
        _current_principal.set(principal)
        try:
            await mcp.call_tool("publish_job", {"job_id": "job_1"})
            return None
        except PermissionError as exc:
            return str(exc)

    err = asyncio.run(run())
    assert err and "publish" in err


def test_mcp_scope_permitido_audita(crypto_env):
    import asyncio

    from phonefarm.mcp_server import _current_principal, mcp
    from phonefarm.mcp_tokens import token_is_valid

    token = _create_mcp_token(crypto_env, "read")
    principal = token_is_valid(token)

    async def run():
        _current_principal.set(principal)
        return await mcp.call_tool("list_jobs", {"status": ""})

    result = asyncio.run(run())
    assert result is not None  # tools/list_jobs devuelve la cola (vacía o no)
    import phonefarm.platform_data as pd
    from phonefarm.audit import verify_chain

    assert verify_chain(pd._conn()) == []


def test_mcp_rate_limit_por_token(crypto_env, monkeypatch: pytest.MonkeyPatch):
    from phonefarm import mcp_server

    monkeypatch.setattr(mcp_server, "_RATE_MAX", 2)  # límite bajo para el test
    token = _create_mcp_token(crypto_env, "read")
    from phonefarm.mcp_tokens import token_is_valid

    principal = token_is_valid(token)
    assert principal is not None
    assert mcp_server._rate_limit(principal["id"]) is True
    assert mcp_server._rate_limit(principal["id"]) is True
    assert mcp_server._rate_limit(principal["id"]) is False  # excedido
