"""Warm-up planner: isolated SQLite, fake clock, no social network calls."""

from copy import deepcopy

import pytest

from phonefarm.db import open_migrated
from phonefarm import warmup


@pytest.fixture
def conn(tmp_path):
    connection = open_migrated(tmp_path / "warmup.db")
    yield connection
    connection.close()


def confirmed(value):
    return {"value": value, "status": "CONFIRMADO", "source": "test fixture", "checkedAt": "2026-10-05"}


def policy():
    config = deepcopy(warmup.load_config())
    config["emergency_stop"] = False
    for platform in config["platforms"].values():
        platform["official_daily_publish_limit"] = confirmed(8)
        platform["daily_ceiling"] = confirmed(4)
        platform["safety_margin"] = confirmed(2)
        platform["min_gap_minutes"] = confirmed(60)
        platform["graduation_days"] = confirmed(7)
        platform["graduation_successes"] = confirmed(3)
        platform["window_utc"]["status"] = "CONFIRMADO"
        for phase in platform["phases"]:
            phase["daily_limit"] = confirmed(2)
    return config


def test_default_fails_closed(conn):
    warmup.register(conn, "account_a", "tiktok", now=100)
    with pytest.raises(warmup.WarmupDenied):
        warmup.plan(conn, "account_a", "original video", "action_1", ai_generated=False, now=36000)
    config = warmup.load_config()
    config["emergency_stop"] = False
    with pytest.raises(warmup.WarmupDenied, match="A_CONFIRMAR"):
        warmup.plan(conn, "account_a", "original video", "action_1", ai_generated=False, now=36000, config=config)
    assert conn.execute("SELECT COUNT(*) FROM warmup_actions").fetchone()[0] == 0


def test_effective_limit_never_exceeds_any_bound():
    for phase in range(1, 8):
        for ceiling in range(1, 8):
            for official in range(2, 10):
                config = policy()
                p = config["platforms"]["tiktok"]
                p["phases"][0]["daily_limit"] = confirmed(phase)
                p["daily_ceiling"] = confirmed(ceiling)
                p["official_daily_publish_limit"] = confirmed(official)
                p["safety_margin"] = confirmed(1)
                result = warmup.effective_limit("tiktok", 1, config)
                assert result <= phase and result <= ceiling and result <= official - 1


def test_dry_run_idempotency_gap_quota_and_duplicate(conn):
    warmup.register(conn, "account_a", "tiktok", now=100)
    config = policy()
    first = warmup.plan(conn, "account_a", "one distinct house video", "action_1", ai_generated=False, now=36000, config=config)
    assert first["dry_run"] and first["scheduled_at"] == 36000
    same = warmup.plan(conn, "account_a", "one distinct house video", "action_1", ai_generated=False, now=36000, config=config)
    assert same["idempotent"]
    with pytest.raises(warmup.WarmupDenied, match="casi igual"):
        warmup.plan(conn, "account_a", "one distinct house video", "action_2", ai_generated=False, now=36000, config=config)
    second = warmup.plan(conn, "account_a", "cooking recipe vegetables", "action_2", ai_generated=False, now=36000, config=config)
    assert second["scheduled_at"] >= first["scheduled_at"] + 3600
    third = warmup.plan(conn, "account_a", "travel forest mountains", "action_3", ai_generated=False, now=36000, config=config)
    assert third["scheduled_at"] >= 86400
    assert conn.execute("SELECT COUNT(*) FROM warmup_actions").fetchone()[0] == 3


def test_emergency_real_mode_and_ai_label_fail_closed(conn):
    warmup.register(conn, "account_a", "instagram", now=100)
    config = policy()
    warmup.set_emergency_stop(conn, "account_a", True, actor="operator", now=101)
    with pytest.raises(warmup.WarmupDenied, match="emergencia"):
        warmup.plan(conn, "account_a", "house design", "a", ai_generated=False, now=36000, config=config)
    warmup.set_emergency_stop(conn, "account_a", False, actor="operator", now=102)
    config["dry_run"] = False
    with pytest.raises(warmup.WarmupDenied, match="OAuth"):
        warmup.plan(conn, "account_a", "house design", "a", ai_generated=False, now=36000, config=config)
    config["dry_run"] = True
    with pytest.raises(warmup.WarmupDenied, match="etiquetado IA"):
        warmup.plan(conn, "account_a", "house design", "a", ai_generated=True, now=36000, config=config)


def test_health_state_backoff_and_human_resume(conn):
    warmup.register(conn, "account_a", "tiktok", now=100)
    assert warmup.observe(conn, "account_a", "success", now=200) == "WARMING"
    assert warmup.observe(conn, "account_a", "429", now=300) == "CAUTION"
    first_pause = conn.execute("SELECT paused_until FROM warmup_accounts WHERE account_id='account_a'").fetchone()[0]
    assert first_pause > 300
    assert warmup.observe(conn, "account_a", "429", now=400) == "CAUTION"
    second_pause = conn.execute("SELECT paused_until FROM warmup_accounts WHERE account_id='account_a'").fetchone()[0]
    assert second_pause - 400 > first_pause - 300
    assert warmup.observe(conn, "account_a", "access_token_invalid", now=500) == "DISCONNECTED"
    with pytest.raises(warmup.WarmupDenied):
        warmup.resume(conn, "account_a", actor="", reason="checked", now=600)
    warmup.resume(conn, "account_a", actor="operator", reason="new OAuth grant verified TOKEN_DO_NOT_LOG", now=600)
    assert conn.execute("SELECT state FROM warmup_accounts WHERE account_id='account_a'").fetchone()[0] == "WARMING"
    assert "TOKEN_DO_NOT_LOG" not in " ".join(row[0] for row in conn.execute("SELECT detail FROM warmup_events"))
    assert warmup.observe(conn, "account_a", "spam_risk_user_banned_from_posting", now=700) == "BLOCKED"
    assert len(warmup.checklist("BLOCKED")) == 4


def test_429_resumes_automatically_only_after_backoff(conn):
    warmup.register(conn, "account_a", "tiktok", now=100)
    config = policy()
    assert warmup.observe(conn, "account_a", "429", now=300) == "CAUTION"
    paused_until = conn.execute("SELECT paused_until FROM warmup_accounts WHERE account_id='account_a'").fetchone()[0]
    with pytest.raises(warmup.WarmupDenied, match="pausa temporal"):
        warmup.plan(conn, "account_a", "original kitchen video", "a", ai_generated=False, now=paused_until - 1, config=config)
    result = warmup.plan(conn, "account_a", "original kitchen video", "a", ai_generated=False, now=paused_until, config=config)
    assert result["status"] == "planned"
    assert conn.execute("SELECT state FROM warmup_accounts WHERE account_id='account_a'").fetchone()[0] == "WARMING"


def test_graduation_requires_time_success_and_no_incidents_then_rewinds(conn):
    warmup.register(conn, "account_a", "instagram", now=100)
    config = policy()
    for now in (200, 300, 400):
        warmup.observe(conn, "account_a", "success", now=now)
    assert warmup.advance(conn, "account_a", now=200 + 6 * 86400, config=config) == "WARMING"
    assert warmup.advance(conn, "account_a", now=200 + 7 * 86400, config=config) == "GRADUATED"
    assert warmup.observe(conn, "account_a", "429", now=200 + 8 * 86400) == "CAUTION"
    row = conn.execute("SELECT phase_day,incidents FROM warmup_accounts WHERE account_id='account_a'").fetchone()
    assert row["phase_day"] == 1 and row["incidents"] == 1
