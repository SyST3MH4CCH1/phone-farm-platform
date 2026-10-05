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


def test_warmup_account_controls_are_persistent_and_role_limited(flask_client):
    from phonefarm.platform_data import save_accounts

    save_accounts([{"id": "a-warmup", "username": "owner", "password": "test-secret", "device_serial": "device-1"}])
    path = "/api/warmup/accounts/a-warmup"
    assert flask_client.post(f"{path}/register", json={"platform": "instagram"}, headers=_hdr("operator")).status_code == 403
    assert flask_client.post(f"{path}/register", json={"platform": "both"}, headers=_hdr()).status_code == 400
    registered = flask_client.post(f"{path}/register", json={"platform": "instagram"}, headers=_hdr())
    assert registered.status_code == 200, registered.get_data(as_text=True)
    row = registered.get_json()["accounts"][0]
    assert row["registered"] and row["platform"] == "instagram"
    assert not row["completed_steps"]
    assert flask_client.post(f"{path}/register", json={"platform": "tiktok"}, headers=_hdr()).status_code == 409
    checked = flask_client.post(f"{path}/step", json={"step": "profile", "completed": True}, headers=_hdr())
    assert checked.status_code == 200
    assert checked.get_json()["accounts"][0]["completed_steps"] == ["profile"]
    stopped = flask_client.post(f"{path}/emergency-stop", json={"stopped": True}, headers=_hdr())
    assert stopped.status_code == 200
    assert stopped.get_json()["accounts"][0]["account_emergency_stop"] is True
    assert stopped.get_json()["real_enabled"] is False
    persisted = flask_client.get("/api/warmup/status", headers=_hdr()).get_json()["accounts"][0]
    assert persisted["completed_steps"] == ["profile"] and persisted["account_emergency_stop"]
    assert flask_client.post(f"{path}/step", json={"step": "profile", "completed": "yes"}, headers=_hdr()).status_code == 400


def test_queue_generation_options_are_validated_and_persisted(flask_client):
    payload = {
        "keyword": "organizar un escritorio pequeño",
        "custom_prompt": "Mostrar tres pasos prácticos",
        "voice_name": "es-ES-ElviraNeural",
        "video_aspect": "16:9",
    }
    created = flask_client.post("/api/queue", json=payload, headers=_hdr())
    assert created.status_code == 201, created.get_data(as_text=True)
    job = created.get_json()
    for field in ("custom_prompt", "voice_name", "video_aspect"):
        assert job[field] == payload[field]
    listed = flask_client.get("/api/queue", headers=_hdr())
    assert listed.status_code == 200
    saved = next(item for item in listed.get_json() if item["id"] == job["id"])
    assert saved["custom_prompt"] == payload["custom_prompt"]
    assert saved["voice_name"] == payload["voice_name"]
    assert saved["video_aspect"] == payload["video_aspect"]
    bad = flask_client.post("/api/queue", json={**payload, "video_aspect": "4:3"}, headers=_hdr())
    assert bad.status_code == 400


def test_mpt_request_receives_voice_and_aspect(monkeypatch):
    from phonefarm import generator, net

    captured = {}

    class Response:
        ok = True
        def json(self):
            return {"data": {"task_id": "test-task"}}

    def fake_post(url, *, json, headers, timeout):
        captured.update(json)
        return Response()

    monkeypatch.setattr(generator, "_check_disk_quota", lambda: None)
    monkeypatch.setattr(net, "safe_post", fake_post)
    result = generator._submit_task("habitación", "guión", ["decoración"], "es-ES-ElviraNeural", "16:9")
    assert result == "test-task"
    assert captured["voice_name"] == "es-ES-ElviraNeural"
    assert captured["video_aspect"] == "16:9"


def test_warmup_status_honest_and_without_credentials(flask_client):
    from phonefarm.platform_data import save_accounts

    save_accounts([{"id": "a1", "username": "operator-owned", "password": "secret-test-value", "device_serial": "test-device"}])
    response = flask_client.get("/api/warmup/status", headers=_hdr())
    assert response.status_code == 200
    body = response.get_json()
    assert body["dry_run"] is True and body["real_enabled"] is False
    assert body["accounts"][0]["state"] == "NOT_REGISTERED"
    assert body["accounts"][0]["remaining_today"] is None
    assert "secret-test-value" not in response.get_data(as_text=True)


# ---------------------------------------------------------------------------
# /api/stats — disk_percent añadido al payload
# ---------------------------------------------------------------------------

def test_api_stats_incluye_disk_percent(flask_client, monkeypatch):
    """El payload de /api/stats debe incluir disk_percent (float o None).

    En Windows sin shutil.disk_usage válido, debe devolver None (no tirar
    500). El campo debe estar presente aunque sea None — la UI del Dashboard
    distingue '—' (sin dato) de un porcentaje real.
    """
    from phonefarm import proxy_manager

    def missing_adb():
        raise RuntimeError("ADB unavailable")

    monkeypatch.setattr(proxy_manager, "adb_discover_devices", missing_adb)
    resp = flask_client.get("/api/stats", headers=_hdr())
    assert resp.status_code == 200, resp.get_data(as_text=True)
    body = resp.get_json()
    assert "disk_percent" in body, f"disk_percent ausente en /api/stats: {body}"
    assert body["disk_percent"] is None or isinstance(body["disk_percent"], (int, float))
    assert body["panda_grid_status"] == "Disconnected"
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
