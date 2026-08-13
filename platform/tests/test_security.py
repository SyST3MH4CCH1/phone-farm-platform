"""Pruebas de seguridad de platform/ (paso 1: infraestructura; paso 3: BD/usuarios/clave).

Baseline: verifica comportamientos que la auditoría da por controlados
(escritura atómica) y que el paquete importa sin dependencias externas.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

import phonefarm.platform_data as pd


@pytest.fixture
def tmp_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Aísla DATA_DIR en un directorio temporal."""
    monkeypatch.setattr(pd, "DATA_DIR", tmp_path)
    monkeypatch.setattr(pd, "ACCOUNTS_FILE", tmp_path / "accounts.json")
    monkeypatch.setattr(pd, "PROXIES_FILE", tmp_path / "proxies.json")
    monkeypatch.setattr(pd, "QUEUE_FILE", tmp_path / "queue.json")
    return tmp_path


def test_package_importable():
    import phonefarm.platform_data  # noqa: F401
    assert True


def test_atomic_write_no_deja_tmp(tmp_data_dir: Path):
    """Escritura atómica: tras save no queda fichero .tmp y el JSON es válido."""
    pd.save_accounts([{"id": "acc_1", "username": "u1"}])
    assert not list(tmp_data_dir.glob("*.tmp"))
    data = json.loads((tmp_data_dir / "accounts.json").read_text(encoding="utf-8"))
    assert data == [{"id": "acc_1", "username": "u1"}]


def test_load_vacio_devuelve_lista(tmp_data_dir: Path):
    assert pd.load_proxies() == []
    assert pd.load_queue() == []


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
