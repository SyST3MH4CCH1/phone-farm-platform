"""Conservative official-API publishing planner. No social API dispatch lives here.

All real dispatch remains disabled until official OAuth connectors and account
specific quotas are verified. This module persists decisions for operator review.
"""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import time
from pathlib import Path
from typing import Any

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "warmup.json"
STATES = {"NEW", "WARMING", "GRADUATED", "CAUTION", "PAUSED", "BLOCKED", "DISCONNECTED"}


class WarmupDenied(ValueError):
    pass


def load_config(path: Path = CONFIG_PATH) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _confirmed(item: dict[str, Any], name: str) -> int:
    value = item.get("value")
    if item.get("status") != "CONFIRMADO" or type(value) is not int or value < 0 or not item.get("source") or not item.get("checkedAt"):
        raise WarmupDenied(f"{name}: A_CONFIRMAR")
    return value


def effective_limit(platform: str, day: int, config: dict[str, Any]) -> int:
    """Minimum of phase, ceiling and official limit minus margin; fail closed."""
    try:
        policy = config["platforms"][platform]
        phase = next(p for p in policy["phases"] if p["day_start"] <= day <= p["day_end"])
        phase_limit = _confirmed(phase["daily_limit"], "fase")
        ceiling = _confirmed(policy["daily_ceiling"], "techo")
        official = _confirmed(policy["official_daily_publish_limit"], "límite oficial")
        margin = _confirmed(policy["safety_margin"], "margen")
    except (KeyError, StopIteration, TypeError) as exc:
        raise WarmupDenied("fase o plataforma sin política confirmada") from exc
    if official <= margin:
        raise WarmupDenied("margen igual o superior al límite oficial")
    return min(phase_limit, ceiling, official - margin)


def _audit(conn: sqlite3.Connection, account_id: str, event: str, detail: str, now: int) -> None:
    # Detail is a fixed reason; never include content, tokens, credentials or API bodies.
    conn.execute("INSERT INTO warmup_events(account_id,ts,event,detail) VALUES(?,?,?,?)", (account_id, now, event, detail))


def register(conn: sqlite3.Connection, account_id: str, platform: str, *, now: int | None = None) -> None:
    if platform not in ("instagram", "tiktok") or not account_id:
        raise WarmupDenied("plataforma o cuenta inválida")
    now = int(time.time() if now is None else now)
    with conn:
        conn.execute("INSERT OR IGNORE INTO warmup_accounts(account_id,platform,updated_at) VALUES(?,?,?)", (account_id, platform, now))
        _audit(conn, account_id, "register", "account_registered", now)


def set_emergency_stop(conn: sqlite3.Connection, account_id: str, stopped: bool, *, actor: str, now: int | None = None) -> None:
    if not actor.strip():
        raise WarmupDenied("actor requerido")
    now = int(time.time() if now is None else now)
    with conn:
        if conn.execute("UPDATE warmup_accounts SET emergency_stop=?,updated_at=? WHERE account_id=?", (int(stopped), now, account_id)).rowcount != 1:
            raise WarmupDenied("cuenta desconocida")
        _audit(conn, account_id, "emergency_stop", f"{actor}: {'on' if stopped else 'off'}", now)


def _fingerprint(content: str) -> str:
    tokens = re.findall(r"\w+", content.casefold())
    words = set(tokens)
    if not words:
        raise WarmupDenied("contenido vacío")
    weights = [0] * 64
    for word in words:
        digest = int.from_bytes(hashlib.sha256(word.encode()).digest()[:8], "big")
        for bit in range(64):
            weights[bit] += 1 if digest & (1 << bit) else -1
    return f"{sum((1 << bit) for bit, weight in enumerate(weights) if weight > 0):016x}"


def _near_duplicate(conn: sqlite3.Connection, fingerprint: str) -> bool:
    value = int(fingerprint, 16)
    for row in conn.execute("SELECT DISTINCT content_hash FROM warmup_actions WHERE content_hash IS NOT NULL AND status IN ('planned','success')"):
        if (value ^ int(row[0], 16)).bit_count() <= 3:
            return True
    return False


def plan(conn: sqlite3.Connection, account_id: str, content: str, idempotency_key: str,
         *, ai_generated: bool, now: int | None = None, config: dict[str, Any] | None = None) -> dict[str, Any]:
    """Persist a dry-run plan; never call an external platform."""
    now = int(time.time() if now is None else now)
    config = load_config() if config is None else config
    if not idempotency_key or len(idempotency_key) > 128:
        raise WarmupDenied("clave de idempotencia inválida")
    if not isinstance(ai_generated, bool):
        raise WarmupDenied("debe declararse si el contenido se generó con IA")
    fingerprint = _fingerprint(content)
    conn.execute("BEGIN IMMEDIATE")
    try:
        existing = conn.execute("SELECT account_id,status,scheduled_at FROM warmup_actions WHERE idempotency_key=?", (idempotency_key,)).fetchone()
        if existing:
            if existing["account_id"] != account_id:
                raise WarmupDenied("clave de idempotencia usada por otra cuenta")
            conn.commit()
            return {"status": existing["status"], "scheduled_at": existing["scheduled_at"], "idempotent": True}
        row = conn.execute("SELECT * FROM warmup_accounts WHERE account_id=?", (account_id,)).fetchone()
        if row is None:
            raise WarmupDenied("cuenta no registrada")
        if config.get("emergency_stop", True) or row["emergency_stop"]:
            raise WarmupDenied("interruptor de emergencia activo")
        if row["state"] in ("PAUSED", "BLOCKED", "DISCONNECTED"):
            raise WarmupDenied(f"cuenta en estado {row['state']}")
        if row["paused_until"] and row["paused_until"] > now:
            raise WarmupDenied("pausa temporal activa")
        if row["state"] == "CAUTION":
            conn.execute("UPDATE warmup_accounts SET state='WARMING',paused_until=NULL,updated_at=? WHERE account_id=?", (now, account_id))
            _audit(conn, account_id, "backoff_elapsed", "automatic_resume", now)
        policy = config["platforms"][row["platform"]]
        limit = effective_limit(row["platform"], row["phase_day"], config)
        gap = _confirmed(policy["min_gap_minutes"], "separación") * 60
        window = policy["window_utc"]
        if window.get("status") != "CONFIRMADO":
            raise WarmupDenied("ventana horaria: A_CONFIRMAR")
        if not config.get("dry_run", True):
            raise WarmupDenied("modo real sin conector OAuth oficial verificado")
        if ai_generated and not config.get("ai_label_reviewed", False):
            raise WarmupDenied("etiquetado IA pendiente de revisión")
        if _near_duplicate(conn, fingerprint):
            raise WarmupDenied("contenido igual o casi igual ya planificado")
        last = conn.execute("SELECT MAX(scheduled_at) FROM warmup_actions WHERE account_id=? AND status IN ('planned','success')", (account_id,)).fetchone()[0]
        earliest = max(now, int(last or 0) + gap)
        try:
            sh, sm = (int(part) for part in window["start"].split(":"))
            eh, em = (int(part) for part in window["end"].split(":"))
            start_seconds, end_seconds = sh * 3600 + sm * 60, eh * 3600 + em * 60
            if not (0 <= start_seconds < end_seconds <= 86400):
                raise ValueError()
        except (ValueError, KeyError) as exc:
            raise WarmupDenied("ventana horaria inválida") from exc
        scheduled = None
        for offset in range(31):
            day_start = (earliest - earliest % 86400) + offset * 86400
            candidate = max(earliest, day_start + start_seconds)
            if candidate >= day_start + end_seconds:
                continue
            count = conn.execute("SELECT COUNT(*) FROM warmup_actions WHERE account_id=? AND scheduled_at>=? AND scheduled_at<? AND status IN ('planned','success')", (account_id, day_start, day_start + 86400)).fetchone()[0]
            if count < limit:
                scheduled = candidate
                break
        if scheduled is None:
            raise WarmupDenied("sin hueco dentro del límite y ventana")
        conn.execute("INSERT INTO warmup_actions(idempotency_key,account_id,action,scheduled_at,status,content_hash,created_at) VALUES(?,?,?,?,?,?,?)", (idempotency_key, account_id, "publish", scheduled, "planned", fingerprint, now))
        _audit(conn, account_id, "plan", "dry_run", now)
        conn.commit()
        return {"status": "planned", "scheduled_at": scheduled, "dry_run": True, "idempotent": False}
    except WarmupDenied as exc:
        conn.rollback()
        with conn:
            _audit(conn, account_id, "plan_denied", str(exc)[:120], now)
        raise
    except Exception:
        conn.rollback()
        raise


def observe(conn: sqlite3.Connection, account_id: str, signal: str, *, now: int | None = None) -> str:
    """Map official API outcomes to a conservative persistent account state."""
    now = int(time.time() if now is None else now)
    row = conn.execute("SELECT * FROM warmup_accounts WHERE account_id=?", (account_id,)).fetchone()
    if row is None:
        raise WarmupDenied("cuenta desconocida")
    state = row["state"]
    incidents = row["incidents"]
    pause = None
    if signal == "success":
        state = "WARMING" if state == "NEW" else state
    elif signal in ("401", "access_token_invalid", "scope_not_authorized", "auth_removed"):
        state = "DISCONNECTED"
        incidents += 1
    elif signal in ("spam_risk_user_banned_from_posting", "blocked"):
        state = "BLOCKED"
        incidents += 1
    elif signal in ("429", "rate_limit_exceeded"):
        state = "CAUTION"
        incidents += 1
        pause = now + min(86400, 60 * (2 ** min(incidents, 10)))
    else:
        state = "PAUSED"
        incidents += 1
    with conn:
        conn.execute("UPDATE warmup_accounts SET state=?,successes=successes+?,incidents=?,paused_until=?,started_at=CASE WHEN ?='success' AND started_at IS NULL THEN ? ELSE started_at END,phase_day=CASE WHEN ?='GRADUATED' AND ?!='success' THEN 1 ELSE phase_day END,updated_at=? WHERE account_id=?", (state, int(signal == "success"), incidents, pause, signal, now, row["state"], signal, now, account_id))
        _audit(conn, account_id, "observe", "success" if signal == "success" else "risk_signal", now)
    return state


def advance(conn: sqlite3.Connection, account_id: str, *, now: int | None = None,
            config: dict[str, Any] | None = None) -> str:
    """Advance by elapsed time; graduate only with confirmed thresholds and no incidents."""
    now = int(time.time() if now is None else now)
    config = load_config() if config is None else config
    row = conn.execute("SELECT * FROM warmup_accounts WHERE account_id=?", (account_id,)).fetchone()
    if row is None:
        raise WarmupDenied("cuenta desconocida")
    if row["state"] != "WARMING" or row["started_at"] is None:
        raise WarmupDenied("cuenta no está en rampa activa")
    policy = config["platforms"][row["platform"]]
    days_required = _confirmed(policy["graduation_days"], "días para graduación")
    successes_required = _confirmed(policy["graduation_successes"], "éxitos para graduación")
    days_elapsed = max(0, (now - row["started_at"]) // 86400)
    phase_day = min(days_elapsed + 1, max(p["day_end"] for p in policy["phases"]))
    state = "GRADUATED" if days_elapsed >= days_required and row["successes"] >= successes_required and row["incidents"] == 0 else "WARMING"
    with conn:
        conn.execute("UPDATE warmup_accounts SET phase_day=?,state=?,updated_at=? WHERE account_id=?", (phase_day, state, now, account_id))
        _audit(conn, account_id, "advance", "graduated" if state == "GRADUATED" else "warming", now)
    return state


def resume(conn: sqlite3.Connection, account_id: str, *, actor: str, reason: str, now: int | None = None) -> None:
    if not actor.strip() or not reason.strip():
        raise WarmupDenied("actor y motivo requeridos")
    now = int(time.time() if now is None else now)
    with conn:
        if conn.execute("UPDATE warmup_accounts SET state='WARMING',paused_until=NULL,updated_at=? WHERE account_id=? AND state IN ('PAUSED','CAUTION','BLOCKED','DISCONNECTED')", (now, account_id)).rowcount != 1:
            raise WarmupDenied("cuenta no reanudable")
        reason_digest = hashlib.sha256(reason.encode("utf-8")).hexdigest()[:16]
        _audit(conn, account_id, "resume", f"actor={actor[:32]} reason_sha256={reason_digest}", now)


def checklist(state: str) -> list[str]:
    if state not in STATES:
        raise WarmupDenied("estado inválido")
    steps = ["Confirmar titularidad y autorización OAuth", "Completar perfil manualmente", "Revisar contenido y etiquetado IA"]
    if state in ("CAUTION", "PAUSED", "BLOCKED", "DISCONNECTED"):
        steps.append("Revisar la cuenta y registrar motivo antes de reanudar")
    return steps
