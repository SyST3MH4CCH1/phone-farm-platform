"""Tests para los endpoints nuevos del dashboard:

- GET /api/events/recent?limit=N — tail del ring buffer en memoria
- PATCH /api/accounts/<id>       — status/enabled, validado con zod
- /api/stats.disk_percent        — añadido al payload

Estos endpoints son lectura/mutación benigna: el caller ya pasó por
requireAuth/requireRole('admin') en el proxy de Express. Aquí cubrimos
la capa Flask directamente con TestClient con el token interno de pruebas.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest


# ---------------------------------------------------------------------------
# Fixtures (mismos criterios que test_security.py para mantener paridad).
# ---------------------------------------------------------------------------

@pytest.fixture
def crypto_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Entorno aislado: BD + clave maestra (provider file) en tmp_path."""
    monkeypatch.setenv("PHONEFARM_DB_PATH", str(tmp_path / "phonefarm.db"))
    monkeypatch.setenv("PHONEFARM_MASTER_KEY_PATH", str(tmp_path / "master.key"))
    monkeypatch.setenv("PHONEFARM_KEY_PROVIDER", "file")
    from phonefarm.keystore import ensure_master_key

    ensure_master_key(provider="file")
    import phonefarm.platform_data as pd
    import phonefarm.mcp_tokens as mcp_tokens

    pd._master_key = None
    if hasattr(pd._local, "conn"):
        try:
            pd._local.conn.close()
        except Exception:
            pass
        del pd._local.conn
    if hasattr(mcp_tokens._local, "conn"):
        try:
            mcp_tokens._local.conn.close()
        except Exception:
            pass
        del mcp_tokens._local.conn
    return tmp_path


@pytest.fixture
def flask_client(crypto_env, monkeypatch: pytest.MonkeyPatch):
    """Cliente de prueba de la app Flask con token interno + X-Role=admin."""
    import phonefarm.platform as pf

    monkeypatch.setenv("INTERNAL_TOKEN", "test-internal-token")
    pf.INTERNAL_TOKEN = "test-internal-token"
    pf.app.config.update(TESTING=True)
    return pf.app.test_client()


def _hdr(role: str = "admin") -> dict[str, str]:
    return {"X-Internal-Auth": "test-internal-token", "X-Role": role}


# ---------------------------------------------------------------------------
# /api/stats — disk_percent añadido al payload
# ---------------------------------------------------------------------------

def test_api_stats_incluye_disk_percent(flask_client):
    """El payload de /api/stats debe incluir disk_percent (float o None).

    En Windows sin shutil.disk_usage válido, debe devolver None (no tirar
    500). El campo debe estar presente aunque sea None — la UI del Dashboard
    distingue '—' (sin dato) de un porcentaje real.
    """
    resp = flask_client.get("/api/stats", headers=_hdr())
    assert resp.status_code == 200, resp.get_data(as_text=True)
    body = resp.get_json()
    assert "disk_percent" in body, f"disk_percent ausente en /api/stats: {body}"
    assert body["disk_percent"] is None or isinstance(body["disk_percent"], (int, float))
    # Otros campos contractuales:
    for key in ("cpu_percent", "ram_percent", "errores", "videos_subidos"):
        assert key in body, f"{key} ausente en /api/stats"


# ---------------------------------------------------------------------------
# /api/events/recent — tail del ring buffer en memoria
# ---------------------------------------------------------------------------

def test_api_events_recent_devuelve_lista(flask_client):
    """GET /api/events/recent devuelve {events: [...], count: N}."""
    resp = flask_client.get("/api/events/recent?limit=10", headers=_hdr())
    assert resp.status_code == 200
    body = resp.get_json()
    assert "events" in body
    assert "count" in body
    assert body["count"] == len(body["events"])
    assert body["count"] <= 10
    for ev in body["events"]:
        assert isinstance(ev, str)


def test_api_events_recent_limit_excesivo_se_clampa(flask_client):
    """Si limit > 500 debe clamparse (defensa contra DoS por respuesta enorme)."""
    resp = flask_client.get("/api/events/recent?limit=10000", headers=_hdr())
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["count"] <= 500


def test_api_events_recent_sin_limit_usa_default(flask_client):
    """Sin limit explícito usa 50 por defecto (no 500, no 0)."""
    resp = flask_client.get("/api/events/recent", headers=_hdr())
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["count"] <= 50


# ---------------------------------------------------------------------------
# PATCH /api/accounts/<id> — status/enabled (admin-only)
# ---------------------------------------------------------------------------

def test_api_patch_account_status_valido_persiste(flask_client, crypto_env):
    """PATCH /api/accounts/<id> cambia status a 'paused' y persiste."""
    import phonefarm.platform_data as pd

    pd.save_accounts([
        {"id": "acc_p1", "username": "u1", "password": "p", "status": "active", "device_serial": "S1"},
        {"id": "acc_p2", "username": "u2", "password": "p", "status": "active", "device_serial": "S2"},
    ])

    resp = flask_client.patch("/api/accounts/acc_p1", json={"status": "paused"}, headers=_hdr())
    assert resp.status_code == 200, resp.get_data(as_text=True)
    body = resp.get_json()
    assert body["id"] == "acc_p1"
    assert body["status"] == "paused"

    # Persistencia: releer y comprobar
    resp2 = flask_client.get("/api/accounts", headers=_hdr())
    assert resp2.status_code == 200
    accs = resp2.get_json()
    by_id = {a["id"]: a for a in accs}
    assert by_id["acc_p1"]["status"] == "paused"
    assert by_id["acc_p2"]["status"] == "active"


def test_api_patch_account_status_invalido(flask_client, crypto_env):
    """PATCH con status fuera del enum debe rechazarse (4xx)."""
    import phonefarm.platform_data as pd

    pd.save_accounts([
        {"id": "acc_p3", "username": "u", "password": "p", "status": "active", "device_serial": "S"},
    ])

    resp = flask_client.patch("/api/accounts/acc_p3", json={"status": "hacker"}, headers=_hdr())
    assert resp.status_code == 400, f"esperaba 400, obtuve {resp.status_code}: {resp.get_data(as_text=True)}"


def test_api_patch_account_status_warmup(flask_client, crypto_env):
    """El status 'warmup' lo acepta Flask (UPDATE directo en SQLite)."""
    import phonefarm.platform_data as pd

    pd.save_accounts([
        {"id": "acc_p_w", "username": "u", "password": "p", "status": "active", "device_serial": "S"},
    ])
    resp = flask_client.patch("/api/accounts/acc_p_w", json={"status": "warmup"}, headers=_hdr())
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "warmup"


def test_api_patch_account_enabled_false(flask_client, crypto_env):
    """PATCH con enabled=False persiste el flag mapeado a status='paused'."""
    import phonefarm.platform_data as pd

    pd.save_accounts([
        {"id": "acc_p4", "username": "u", "password": "p", "status": "active", "device_serial": "S"},
    ])

    resp = flask_client.patch("/api/accounts/acc_p4", json={"enabled": False}, headers=_hdr())
    assert resp.status_code == 200
    body = resp.get_json()
    # Flask mapea enabled=False → status='paused'
    assert body["status"] == "paused"


def test_api_patch_account_id_inexistente(flask_client, crypto_env):
    """PATCH a id inexistente debe devolver 404 (no 200 silencioso)."""
    import phonefarm.platform_data as pd

    pd.save_accounts([])
    resp = flask_client.patch("/api/accounts/acc_nope", json={"status": "paused"}, headers=_hdr())
    assert resp.status_code == 404


def test_api_patch_account_body_vacio_rechaza(flask_client, crypto_env):
    """PATCH con {} debe rechazarse — Flask exige status o enabled."""
    import phonefarm.platform_data as pd

    pd.save_accounts([
        {"id": "acc_pe", "username": "u", "password": "p", "status": "active", "device_serial": "S"},
    ])
    resp = flask_client.patch("/api/accounts/acc_pe", json={}, headers=_hdr())
    assert resp.status_code == 400


def test_api_patch_account_sin_token_interno_rechaza(flask_client, crypto_env):
    """Sin X-Internal-Auth → 401 (no bypassea el auth interno)."""
    import phonefarm.platform_data as pd

    pd.save_accounts([
        {"id": "acc_noauth", "username": "u", "password": "p", "status": "active", "device_serial": "S"},
    ])
    resp = flask_client.patch("/api/accounts/acc_noauth", json={"status": "paused"})
    # Flask before_request rechaza con 401 cuando no hay INTERNAL_TOKEN
    assert resp.status_code in (401, 403), f"esperaba 401/403, obtuve {resp.status_code}"