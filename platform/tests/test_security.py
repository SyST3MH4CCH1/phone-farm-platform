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
