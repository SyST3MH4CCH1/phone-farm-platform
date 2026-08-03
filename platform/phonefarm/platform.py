from __future__ import annotations

"""platform — Servidor Flask de la Phone Farm (API REST + Dashboard + SSE).

Endpoints (11 obligatorios del plan maestro + extras de compatibilidad):
    GET  /api/accounts          Lista cuentas
    POST /api/accounts          Crea cuenta {username,password,device_serial,proxy_id}
    DELETE /api/accounts/<id>   Elimina cuenta
    GET  /api/proxies           Lista proxies con IP pública actual (cacheada)
    POST /api/proxies           Agrega credencial {host,port,user,pass}
    GET  /api/queue             Lista cola de generación
    POST /api/queue             Agrega job {keyword,target_account}
    POST /api/queue/next        Procesa siguiente job (genera + publica, en background)
    POST /engagement/start      Inicia taktik-bot {account_id}
    POST /engagement/stop       Detiene taktik-bot {account_id}
    GET  /api/stats             Métricas: videos_subidos, acciones_hoy, errores, cpu, ram
    GET  /                      templates/dashboard.html
    GET  /stream/logs           SSE tail de logs/platform.log
    (extras) /api/adb/config, /api/auth/me  -> compatibilidad con dashboard React

Seguridad: CORS abierto SOLO para orígenes loopback (127.0.0.1/localhost);
persistencia JSON tras cada modificación; logs rotados diariamente sin
contraseñas ni tokens en claro.

NOTA: este módulo vive en el paquete `phonefarm/` precisamente para que el
archivo platform.py NO sombree al stdlib `platform` (Flask/instagrapi/attrs
lo importan). Ejecutar con: python -m phonefarm.platform
"""

import logging
import logging.handlers
import os
import queue as queue_module
import threading
import time
from pathlib import Path
from typing import Any

import psutil
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request, send_from_directory

from phonefarm.platform_data import load_accounts, load_proxies, load_queue, save_accounts, save_proxies, save_queue

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("PHONE_FARM_DATA_DIR", BASE_DIR))
TEMPLATES_DIR = BASE_DIR / "templates"
LOGS_DIR = DATA_DIR / "logs"
SESSIONS_DIR = DATA_DIR / "sessions"

load_dotenv(BASE_DIR / ".env")

PORT = int(os.getenv("FLASK_PORT", "5000"))
ALLOWED_ORIGINS = {
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://127.0.0.1:5000,http://localhost:5000,"
        "http://127.0.0.1:3000,http://localhost:3000",
    ).split(",")
    if origin.strip()
}
PANDA_GRID_STATUS = os.getenv("PANDA_GRID_STATUS", "Connected")

# --- Logging estructurado: INFO -> archivo rotado, WARNING+ -> consola ------
def setup_logging() -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    root = logging.getLogger()
    if root.handlers:  # no duplicar handlers en recargas
        return
    root.setLevel(logging.INFO)

    file_handler = logging.handlers.TimedRotatingFileHandler(
        LOGS_DIR / "platform.log", when="midnight", backupCount=14, encoding="utf-8"
    )
    file_handler.setFormatter(
        logging.Formatter("%(asctime)s | %(levelname)-7s | %(name)s | %(message)s")
    )
    file_handler.setLevel(logging.INFO)

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(logging.Formatter("%(levelname)-7s | %(name)s | %(message)s"))
    console_handler.setLevel(logging.WARNING)

    root.addHandler(file_handler)
    root.addHandler(console_handler)


setup_logging()
logger = logging.getLogger("platform")


# --- Ring buffer de logs para SSE ------------------------------------------
class LogBuffer:
    """Buffer circular en memoria + cola por suscriptor SSE."""

    def __init__(self, maxlen: int = 500) -> None:
        self._lines: list[str] = []
        self._maxlen = maxlen
        self._subscribers: list[queue_module.Queue] = []

    def append(self, line: str) -> None:
        self._lines.append(line)
        if len(self._lines) > self._maxlen:
            self._lines.pop(0)
        for sub in list(self._subscribers):
            try:
                sub.put_nowait(line)
            except queue_module.Full:
                pass

    def tail(self, n: int = 50) -> list[str]:
        return self._lines[-n:]

    def subscribe(self) -> queue_module.Queue:
        sub: queue_module.Queue = queue_module.Queue(maxsize=200)
        for line in self._lines[-20:]:  # arranque con el historial reciente
            sub.put_nowait(line)
        self._subscribers.append(sub)
        return sub

    def unsubscribe(self, sub: queue_module.Queue) -> None:
        if sub in self._subscribers:
            self._subscribers.remove(sub)


log_buffer = LogBuffer()


class BufferHandler(logging.Handler):
    """Handler de logging que alimenta el ring buffer SSE."""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            message = self.format(record)
        except Exception:  # noqa: BLE001
            return
        log_buffer.append(message)


_buffer_handler = BufferHandler()
_buffer_handler.setFormatter(logging.Formatter("%(asctime)s | %(levelname)-7s | %(name)s | %(message)s"))
logging.getLogger().addHandler(_buffer_handler)


# --- Cola de trabajos: pipeline de contenido v2 -------------------------------
# Ciclo de vida del job:
#   pending -> scripting -> awaiting_approval -> [approve] -> generating
#           -> publishing -> published | awaiting_manual_upload | failed
#   awaiting_approval -> [reject] -> rejected
#   pending (scheduled_time <= now) -> lo procesa el scheduler
_queue_threads: dict[str, threading.Thread] = {}
_queue_lock = threading.RLock()

JOB_STATUSES = {
    "pending", "scripting", "awaiting_approval", "generating",
    "publishing", "published", "awaiting_manual_upload", "failed", "rejected",
}


def _sync_job(updated: dict[str, Any]) -> list[dict[str, Any]]:
    """Persiste el estado del job en queue.json (reescritura completa)."""
    queue = load_queue()
    for idx, item in enumerate(queue):
        if item.get("id") == updated["id"]:
            queue[idx] = updated
            break
    else:
        queue.append(updated)
    save_queue(queue)
    return queue


def _spawn(job_id: str, target) -> None:
    """Lanza un worker en background para el job (idempotente)."""
    with _queue_lock:
        existing = _queue_threads.get(job_id)
        if existing is not None and existing.is_alive():
            return False
        worker = threading.Thread(target=target, daemon=True, name=f"job-{job_id}")
        _queue_threads[job_id] = worker
        worker.start()
        return True


def _script_job(job: dict[str, Any]) -> None:
    """Etapa 1: guión + caption + terms (LLM o plantilla) -> awaiting_approval."""
    from phonefarm import content

    job_id = job["id"]
    try:
        job["status"] = "scripting"
        _sync_job(job)
        logger.info("[%s] Generando guión para keyword=%r (nicho=%s)",
                    job_id, job.get("keyword"), job.get("niche_id") or "general")
        profile = content.get_profile(job.get("niche_id"))
        script = content.build_script(job.get("keyword", ""), profile, job.get("script"))
        job["script"] = script
        job["caption"] = content.build_caption(job.get("keyword", ""), profile)
        job["hashtags"] = content.suggest_hashtags(job.get("keyword", ""), profile)
        job["terms"] = content.generate_terms(job.get("keyword", ""), profile)
        job["voice_name"] = profile.get("voice_name", "es-ES-AlvaroNeural")
        job["video_aspect"] = profile.get("video_aspect", "9:16")
        job["niche_id"] = profile.get("id", "general")
        _sync_job(job)

        if job.get("auto_approve"):
            logger.info("[%s] auto_approve activo — continuando a generación", job_id)
            _generate_and_publish(job)
        else:
            job["status"] = "awaiting_approval"
            _sync_job(job)
            logger.info("[%s] Guión listo para aprobación (caption de %d chars)",
                        job_id, len(job.get("caption", "")))
    except Exception as exc:  # noqa: BLE001
        logger.error("[%s] Fallo en scripting: %s", job_id, exc)
        job["status"] = "failed"
        job["error"] = str(exc)[:500]
        _sync_job(job)
    finally:
        _queue_threads.pop(job_id, None)


def _generate_and_publish(job: dict[str, Any]) -> None:
    """Etapa 2: generar vídeo con MPT (script+terms provistos) -> publicar."""
    from phonefarm import generator
    from phonefarm import publisher

    job_id = job["id"]
    try:
        job["status"] = "generating"
        _sync_job(job)
        logger.info("[%s] Generando reel con MPT (script %d chars, %d terms)...",
                    job_id, len(job.get("script", "")), len(job.get("terms", [])))

        video_path = generator.generate_reel(
            job.get("keyword", ""), job_id,
            script=job.get("script", ""),
            terms=job.get("terms"),
        )
        job["video_path"] = video_path
        job["progress"] = 50
        _sync_job(job)

        account_id = job.get("target_account", "")
        caption = job.get("caption") or f"{job.get('keyword', '')} #reels #viral"
        logger.info("[%s] Publicando en cuenta %s...", job_id, account_id)
        job["status"] = "publishing"
        _sync_job(job)

        media_id = publisher.publish_video(account_id, video_path, caption)
        job["media_id"] = media_id
        job["status"] = "published"
        job["progress"] = 100
        logger.info("[%s] Publicado OK (media_id=%s)", job_id, media_id)

    except Exception as exc:  # noqa: BLE001 — el error se persiste en el job
        logger.error("[%s] Fallo en pipeline: %s", job_id, exc)
        job["status"] = "awaiting_manual_upload" if _is_manual_fallback(exc) else "failed"
        job["error"] = str(exc)[:500]
        job["progress"] = job.get("progress", 0)
    finally:
        _sync_job(job)
        _queue_threads.pop(job_id, None)


def _is_manual_fallback(exc: Exception) -> bool:
    """¿El error es un bloqueo de IG (fallback manual) o un fallo técnico?"""
    name = type(exc).__name__
    return name in {"ChallengeRequired", "PleaseWaitFewMinutes", "LoginRequired"}


# --- Scheduler: jobs programados ----------------------------------------------

def scheduler_loop() -> None:
    """Cada 30 s procesa los jobs pending con scheduled_time vencido."""
    while True:
        try:
            now = time.time()
            for job in load_queue():
                if job.get("status") != "pending":
                    continue
                scheduled = job.get("scheduled_ts")
                if isinstance(scheduled, (int, float)) and scheduled <= now:
                    logger.info("[%s] Job programado vencido — iniciando scripting", job["id"])
                    _spawn(job["id"], lambda j=job: _script_job(j))
        except Exception as exc:  # noqa: BLE001
            logger.error("Scheduler: %s", exc)
        time.sleep(30)


def start_scheduler() -> None:
    threading.Thread(target=scheduler_loop, daemon=True, name="scheduler").start()


# --- Aplicación Flask --------------------------------------------------------
app = Flask(__name__, template_folder=str(TEMPLATES_DIR), static_folder=None)


@app.after_request
def cors_loopback_only(response: Response) -> Response:
    """CORS restringido a orígenes loopback (127.0.0.1 / localhost)."""
    origin = request.headers.get("Origin")
    if origin:
        if origin in ALLOWED_ORIGINS:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        else:
            logger.warning("CORS denegado para origen: %s", origin)
            blocked = jsonify({"error": "Origen no permitido"})
            blocked.status_code = 403
            return blocked
    if request.method == "OPTIONS":
        return response
    return response


# --- Accounts ----------------------------------------------------------------

@app.get("/api/accounts")
def api_accounts():
    # Nunca exponer contraseñas por API (quedan solo en accounts.json)
    return jsonify([{k: v for k, v in acc.items() if k != "password"} for acc in load_accounts()])


@app.post("/api/accounts")
def api_accounts_create():
    body = request.get_json(silent=True) or {}
    username = (body.get("username") or "").strip()
    password = (body.get("password") or "").strip()
    device_serial = (body.get("device_serial") or "").strip()
    proxy_id = (body.get("proxy_id") or "").strip()

    if not username or not password or not device_serial:
        return jsonify({"error": "username, password y device_serial son obligatorios"}), 400
    if "XXXXX" in device_serial:
        return jsonify({"error": "device_serial es un placeholder; usa el serial real (adb devices)"}), 400
    if proxy_id and not any(p.get("id") == proxy_id for p in load_proxies()):
        return jsonify({"error": f"proxy_id no existe: {proxy_id}"}), 400
    if any(a.get("username") == username for a in load_accounts()):
        return jsonify({"error": f"El username ya existe: {username}"}), 409

    accounts = load_accounts()
    account = {
        "id": f"acc_{len(accounts) + 1:02d}",
        "username": username,
        "password": password,
        "status": "active",
        "device_serial": device_serial,
        "proxy_id": proxy_id or (load_proxies()[0]["id"] if load_proxies() else ""),
        "session_file": f"sessions/{f'acc_{len(accounts) + 1:02d}'}.json",
        "warmup_day": int(body.get("warmup_day") or 1),
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "likes_today": 0,
        "follows_today": 0,
        "comments_today": 0,
        "bot_active": False,
    }
    accounts.append(account)
    save_accounts(accounts)
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("Cuenta creada: %s (@%s, ADB %s)", account["id"], username, device_serial)
    return jsonify(account), 201


@app.delete("/api/accounts/<account_id>")
def api_accounts_delete(account_id: str):
    from phonefarm import engagement

    try:
        engagement.stop_bot(account_id)
    except ValueError:
        pass  # sin bot corriendo: se elimina igual

    accounts = load_accounts()
    remaining = [a for a in accounts if a.get("id") != account_id]
    if len(remaining) == len(accounts):
        return jsonify({"error": f"Cuenta no existe: {account_id}"}), 404
    save_accounts(remaining)
    logger.info("Cuenta eliminada: %s", account_id)
    return jsonify({"success": True, "id": account_id})


# --- Proxies -----------------------------------------------------------------

# Cache de verificación (IP pública + latencia), 60 s de TTL
_proxy_cache: dict[str, dict[str, Any]] = {}
_proxy_cache_ts: dict[str, float] = {}


@app.get("/api/proxies")
def api_proxies():
    from phonefarm import proxy_manager

    proxies = load_proxies()
    now = time.monotonic()
    result = []
    for proxy in proxies:
        item = {k: v for k, v in proxy.items() if k != "pass"}  # nunca exponer credenciales
        cached = _proxy_cache.get(proxy["id"])
        if cached and now - _proxy_cache_ts.get(proxy["id"], 0) < 60:
            item.update({"ip": cached.get("ip"), "latency_ms": cached.get("latency_ms"), "status": cached.get("status")})
        else:
            verdict = proxy_manager.verify_proxy(proxy["id"])
            _proxy_cache[proxy["id"]] = verdict
            _proxy_cache_ts[proxy["id"]] = now
            item.update({"ip": verdict.get("ip"), "latency_ms": verdict.get("latency_ms"), "status": verdict.get("status")})
        result.append(item)
    return jsonify(result)


@app.post("/api/proxies")
def api_proxies_create():
    body = request.get_json(silent=True) or {}
    host = (body.get("host") or "").strip()
    port = int(body.get("port") or 0)
    if not host or not port:
        return jsonify({"error": "host y port son obligatorios"}), 400

    proxies = load_proxies()
    proxy = {
        "id": f"proxy_{len(proxies) + 1:02d}",
        "provider": body.get("provider") or "DataImpulse",
        "type": body.get("type") or "socks5",
        "host": host,
        "port": port,
        "user": body.get("user") or "",
        "pass": body.get("pass") or "",
        "assigned_account": body.get("assigned_account") or "",
        "status": "offline",
        "ip": None,
        "latency_ms": None,
    }
    proxies.append(proxy)
    save_proxies(proxies)
    logger.info("Proxy creado: %s (%s:%d)", proxy["id"], host, port)
    return jsonify(proxy), 201


@app.post("/api/proxies/verify")
def api_proxies_verify():
    """Verificación explícita de un proxy (endpoint adicional)."""
    from phonefarm import proxy_manager

    proxy_id = (request.get_json(silent=True) or {}).get("proxy_id")
    if not proxy_id:
        return jsonify({"error": "proxy_id requerido"}), 400
    verdict = proxy_manager.verify_proxy(proxy_id)
    proxies = load_proxies()
    for proxy in proxies:
        if proxy["id"] == proxy_id:
            proxy.update({k: verdict.get(k) for k in ("ip", "latency_ms", "status")})
    save_proxies(proxies)
    return jsonify(verdict)


# --- Queue (pipeline de contenido v2) -----------------------------------------

@app.get("/api/queue")
def api_queue():
    return jsonify(load_queue())


@app.get("/api/drafts")
def api_drafts():
    """Jobs en espera de aprobación (script + caption listos para revisar)."""
    drafts = [j for j in load_queue() if j.get("status") == "awaiting_approval"]
    return jsonify(drafts)


@app.post("/api/queue")
def api_queue_create():
    body = request.get_json(silent=True) or {}
    keyword = (body.get("keyword") or "").strip()
    target_account = (body.get("target_account") or "").strip()
    if not keyword:
        return jsonify({"error": "keyword es obligatoria"}), 400
    if target_account and not any(a.get("id") == target_account for a in load_accounts()):
        return jsonify({"error": f"Cuenta destino no existe: {target_account}"}), 400
    from phonefarm import content

    if body.get("niche_id") and not any(p.get("id") == body["niche_id"] for p in content.load_profiles()):
        return jsonify({"error": f"Niché no existe: {body['niche_id']}"}), 400

    queue = load_queue()
    job = {
        "id": f"job_{len(queue) + 101}",
        "keyword": keyword,
        "target_account": target_account or (load_accounts()[0]["id"] if load_accounts() else ""),
        "niche_id": body.get("niche_id") or "general",
        "status": "pending",
        "video_path": None,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "progress": 0,
        "script": body.get("script") or "",
        # auto_approve=true -> salta la revisión humana (script -> generar -> publicar)
        "auto_approve": bool(body.get("auto_approve")),
        # programación: "2026-08-03T12:00:00Z" o timestamp
        "scheduled_ts": _parse_schedule(body.get("scheduled_time")),
    }
    queue.append(job)
    save_queue(queue)
    logger.info("Job encolado: %s (keyword=%r, nicho=%s, auto=%s)",
                job["id"], keyword, job["niche_id"], job["auto_approve"])
    return jsonify(job), 201


def _parse_schedule(value: Any) -> float | None:
    """Convierte scheduled_time (ISO 8601 o timestamp) a epoch; None si vacío."""
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        from datetime import datetime, timezone

        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    except ValueError:
        logger.warning("scheduled_time inválido: %r", value)
        return None


@app.post("/api/queue/next")
def api_queue_next():
    """Etapa 1: genera guión del siguiente job pendiente -> awaiting_approval.

    Con auto_approve=true continúa directo a generación + publicación.
    """
    queue = load_queue()
    job = next((j for j in queue if j.get("status") == "pending"), None)
    if job is None:
        return jsonify({"message": "No hay trabajos pendientes en la cola."})

    if not _spawn(job["id"], lambda j=job: _script_job(j)):
        return jsonify({"error": f"El job {job['id']} ya se está procesando"}), 409

    return jsonify(job), 202


@app.post("/api/queue/<job_id>/approve")
def api_queue_approve(job_id: str):
    """Etapa 2: aprueba el guión -> genera vídeo con MPT -> publica."""
    queue = load_queue()
    job = next((j for j in queue if j.get("id") == job_id), None)
    if job is None:
        return jsonify({"error": f"Job no existe: {job_id}"}), 404
    if job.get("status") != "awaiting_approval":
        return jsonify({"error": f"El job {job_id} está en estado {job.get('status')}, no en aprobación"}), 409

    if not _spawn(job_id, lambda j=job: _generate_and_publish(j)):
        return jsonify({"error": f"El job {job_id} ya se está procesando"}), 409

    logger.info("[%s] Guión APROBADO — generando y publicando", job_id)
    return jsonify(job), 202


@app.post("/api/queue/<job_id>/reject")
def api_queue_reject(job_id: str):
    """Rechaza el guión del draft (status -> rejected)."""
    queue = load_queue()
    for job in queue:
        if job.get("id") == job_id:
            if job.get("status") != "awaiting_approval":
                return jsonify({"error": f"El job {job_id} está en estado {job.get('status')}"}), 409
            job["status"] = "rejected"
            save_queue(queue)
            logger.info("[%s] Guión RECHAZADO por el operador", job_id)
            return jsonify(job)
    return jsonify({"error": f"Job no existe: {job_id}"}), 404


# --- Perfiles de contenido (nichos) --------------------------------------------

@app.get("/api/content/profiles")
def api_content_profiles():
    from phonefarm import content

    return jsonify(content.load_profiles())


@app.post("/api/content/profiles")
def api_content_profiles_create():
    from phonefarm import content

    body = request.get_json(silent=True) or {}
    profile_id = (body.get("id") or "").strip().lower().replace(" ", "_")
    name = (body.get("name") or "").strip()
    if not profile_id or not name:
        return jsonify({"error": "id y name son obligatorios"}), 400

    profiles = content.load_profiles()
    if any(p.get("id") == profile_id for p in profiles):
        return jsonify({"error": f"El niché ya existe: {profile_id}"}), 409

    profile = {
        "id": profile_id,
        "name": name,
        "keywords": body.get("keywords") or [],
        "hashtags": body.get("hashtags") or [],
        "caption_template": body.get("caption_template") or "{keyword} 🔥",
        "tone": body.get("tone") or "directo y con gancho",
        "voice_name": body.get("voice_name") or "es-ES-AlvaroNeural",
        "video_aspect": body.get("video_aspect") or "9:16",
        "video_terms": body.get("video_terms") or [],
        "cta": body.get("cta") or "",
    }
    profiles.append(profile)
    content.save_profiles(profiles)
    logger.info("Perfil de contenido creado: %s (%s)", profile_id, name)
    return jsonify(profile), 201


@app.delete("/api/content/profiles/<profile_id>")
def api_content_profiles_delete(profile_id: str):
    from phonefarm import content

    profiles = content.load_profiles()
    remaining = [p for p in profiles if p.get("id") != profile_id]
    if len(remaining) == len(profiles):
        return jsonify({"error": f"Niché no existe: {profile_id}"}), 404
    content.save_profiles(remaining)
    logger.info("Perfil de contenido eliminado: %s", profile_id)
    return jsonify({"success": True, "id": profile_id})


@app.post("/api/content/preview")
def api_content_preview():
    """Vista previa de guión + caption + hashtags SIN encolar (para UI/MCP)."""
    from phonefarm import content

    body = request.get_json(silent=True) or {}
    keyword = (body.get("keyword") or "").strip()
    if not keyword:
        return jsonify({"error": "keyword es obligatoria"}), 400
    return jsonify(content.preview(keyword, body.get("niche_id"), body.get("script")))

    return jsonify(job), 202  # procesando en background


# --- Engagement --------------------------------------------------------------

@app.post("/engagement/start")
def api_engagement_start():
    from phonefarm import engagement

    body = request.get_json(silent=True) or {}
    account_id = body.get("account_id")
    if not account_id:
        return jsonify({"error": "account_id requerido"}), 400
    try:
        return jsonify(engagement.start_bot(account_id))
    except (ValueError, RuntimeError) as exc:
        return jsonify({"error": str(exc)}), 409


@app.post("/engagement/stop")
def api_engagement_stop():
    from phonefarm import engagement

    body = request.get_json(silent=True) or {}
    account_id = body.get("account_id")
    if not account_id:
        return jsonify({"error": "account_id requerido"}), 400
    try:
        return jsonify(engagement.stop_bot(account_id))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404


# --- Stats -------------------------------------------------------------------

@app.get("/api/stats")
def api_stats():
    from phonefarm import engagement

    queue = load_queue()
    accounts = load_accounts()
    proxies = load_proxies()
    cpu = psutil.cpu_percent(interval=0.1)  # intervalo corto para una lectura real
    ram = psutil.virtual_memory().percent
    return jsonify({
        "videos_subidos": sum(1 for j in queue if j.get("status") == "published"),
        "acciones_hoy": sum(
            int(a.get("likes_today", 0)) + int(a.get("follows_today", 0)) + int(a.get("comments_today", 0))
            for a in accounts
        ),
        "errores": sum(1 for j in queue if j.get("status") == "failed"),
        "cpu_percent": cpu,
        "ram_percent": ram,
        "active_bots": engagement.active_bots_count(),
        "active_proxies": sum(1 for p in proxies if p.get("status") == "online"),
        "panda_grid_status": PANDA_GRID_STATUS,
        "bridge_config": {
            "mini_pc_ip": "127.0.0.1",
            "mini_pc_port": PORT,
            "adb_host": os.getenv("ADB_HOST", "127.0.0.1"),
            "adb_port": int(os.getenv("ADB_PORT", "5037")),
            "use_real_flask": True,
            "status": "connected_remote_flask",
        },
    })


# --- Extras de compatibilidad (dashboard React) -------------------------------

@app.get("/api/adb/config")
def api_adb_config():
    return jsonify({
        "mini_pc_ip": "127.0.0.1",
        "mini_pc_port": PORT,
        "adb_host": os.getenv("ADB_HOST", "127.0.0.1"),
        "adb_port": int(os.getenv("ADB_PORT", "5037")),
        "use_real_flask": True,
        "status": "connected_remote_flask",
    })


@app.get("/api/auth/me")
def api_auth_me():
    # El backend Flask es de uso local; el dashboard React autentica en su
    # propio servidor. Aquí se reporta "local session" para compatibilidad.
    return jsonify({"authenticated": True, "user": {
        "id": "usr_local", "username": "local", "role": "admin",
        "email": "local@phonefarm.io", "token": "flask-local",
    }})


# --- SSE + Dashboard ----------------------------------------------------------

@app.get("/stream/logs")
def stream_logs():
    def generate():
        sub = log_buffer.subscribe()
        try:
            yield "data: {}\n\n"  # heartbeat inicial
            while True:
                try:
                    line = sub.get(timeout=10)
                    yield f"data: {line}\n\n"
                except queue_module.Empty:
                    yield ": keepalive\n\n"
        finally:
            log_buffer.unsubscribe(sub)

    return Response(generate(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/")
def index():
    return send_from_directory(TEMPLATES_DIR, "dashboard.html")


@app.get("/videos/<path:filename>")
def videos(filename: str):
    """Sirve los MP4 generados para el <video> del dashboard."""
    from flask import abort

    videos_dir = DATA_DIR / "videos"
    if not (videos_dir / filename).is_file():
        return abort(404)
    return send_from_directory(videos_dir, filename)


if __name__ == "__main__":
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    # En Docker, Flask escucha en 0.0.0.0 (el loopback lo garantiza el bind
    # "127.0.0.1:5000:5000" del compose). Local: solo 127.0.0.1.
    bind_host = "0.0.0.0" if os.getenv("IN_DOCKER") == "1" else "127.0.0.1"

    start_scheduler()
    if os.getenv("MCP_ENABLED", "1") == "1":
        from phonefarm.mcp_server import start_mcp_server

        start_mcp_server(int(os.getenv("MCP_PORT", "5001")))

    logger.info("Phone Farm Platform arrancando en http://%s:%d", bind_host, PORT)
    app.run(host=bind_host, port=PORT, threaded=True, debug=False, use_reloader=False)
