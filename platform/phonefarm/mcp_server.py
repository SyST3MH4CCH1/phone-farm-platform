"""mcp_server — Servidor MCP (Streamable HTTP) de la Phone Farm REAL.

Seguridad (paso 7):
- Autenticación Bearer obligatoria: `Authorization: Bearer <token>` (tokens de
  servicio en `service_tokens`, solo hash; ver phonefarm/mcp_tokens.py).
- Scopes por tool (read | queue.write | engagement | approve | publish | admin).
- Rate limit por token (tabla rate_limits).
- Auditoría de cada tool call (actor = mcp:<principal>, cadena HMAC).
- MCP_ENABLED por defecto desactivado en platform.py.

Se sirve con uvicorn en el puerto 5001 (ruta /mcp) como hilo de platform.py.
"""

from __future__ import annotations

import contextvars
import json
import logging
import os
import threading
import time
from typing import Any

from mcp.server.fastmcp import FastMCP

from phonefarm import content, engagement, platform_data
from phonefarm.mcp_tokens import hash_token, token_is_valid

logger = logging.getLogger(__name__)

# --- scopes por tool ---------------------------------------------------------

TOOL_SCOPES: dict[str, str] = {
    # contenido
    "create_content_job": "queue.write",
    "list_jobs": "read",
    "get_drafts": "read",
    "approve_job": "approve",
    "publish_job": "publish",
    "reject_job": "queue.write",
    "generate_script_preview": "queue.write",   # consume LLM
    "list_content_profiles": "read",
    "create_content_profile": "queue.write",
    # granja
    "get_stats": "read",
    "list_accounts": "read",
    "start_bot": "engagement",
    "stop_bot": "engagement",
    "list_proxies": "read",
    "get_logs": "read",
}

# contexto con el token autenticado por el middleware ASGI
_current_principal: contextvars.ContextVar[dict | None] = contextvars.ContextVar("mcp_principal", default=None)

# --- rate limit por token ----------------------------------------------------

_RATE_WINDOW_S = 60
_RATE_MAX = 60  # llamadas/minuto por token


def _rate_limit(token_id: str) -> bool:
    """True si la llamada está permitida; registra la llamada."""
    from phonefarm.platform_data import _conn

    conn = _conn()
    now = int(time.time())
    key = f"mcp:{token_id}"
    row = conn.execute("SELECT count, window_start FROM rate_limits WHERE key=?", (key,)).fetchone()
    if row is None or row["window_start"] + _RATE_WINDOW_S <= now:
        with conn:
            conn.execute(
                "INSERT INTO rate_limits (key, count, window_start) VALUES (?,1,?) "
                "ON CONFLICT(key) DO UPDATE SET count=1, window_start=excluded.window_start",
                (key, now),
            )
        return True
    if row["count"] >= _RATE_MAX:
        return False
    with conn:
        conn.execute("UPDATE rate_limits SET count=count+1 WHERE key=?", (key,))
    return True


class AuthedFastMCP(FastMCP):
    """FastMCP con scope check y auditoría por tool call."""

    async def call_tool(self, name: str, arguments: dict[str, Any]):
        principal = _current_principal.get()
        if principal is None:
            raise PermissionError("no autenticado")
        # Fail-closed (PY-09): una tool no declarada en TOOL_SCOPES NO se
        # ejecuta (antes `if required` dejaba pasar tools no mapeadas).
        if name not in TOOL_SCOPES:
            raise PermissionError(f"tool '{name}' no declarada en TOOL_SCOPES — no autorizada")
        required = TOOL_SCOPES.get(name)
        if required and required not in principal["scopes"]:
            raise PermissionError(
                f"scope '{required}' requerido para {name} (token tiene: {sorted(principal['scopes'])})"
            )
        from phonefarm.audit import log_action
        from phonefarm.platform_data import _conn

        try:
            result = await super().call_tool(name, arguments)
            log_action(
                _conn(), actor=f"mcp:{principal['principal']}", role="system",
                action=f"mcp.{name}", object=None,
                meta={"args": {k: v for k, v in arguments.items() if k not in ("password", "script", "caption")}},
            )
            return result
        except Exception as exc:  # noqa: BLE001 — se audita el fallo y se propaga
            log_action(
                _conn(), actor=f"mcp:{principal['principal']}", role="system",
                action=f"mcp.{name}.failed", meta={"error": type(exc).__name__},
            )
            raise


mcp = AuthedFastMCP("phone-farm")


def _job_payload(job: dict[str, Any]) -> dict[str, Any]:
    """Job limpio para el agente (sin campos internos pesados)."""
    return {k: v for k, v in job.items() if k not in ("script", "caption")}


# ---------------------------------------------------------------------------
# Contenido
# ---------------------------------------------------------------------------

@mcp.tool()
def create_content_job(
    keyword: str,
    target_account: str = "",
    niche_id: str = "general",
    scheduled_time: str = "",
    script: str = "",
) -> dict[str, Any]:
    """Encola un trabajo de creación de contenido (keyword -> guión -> vídeo).

    TODO job pasa por revisión humana: queda en awaiting_approval hasta que un
    admin apruebe (approve_job) y la publicación requiere estado
    ready_for_publish (publish_job) + aprobación registrada.
    """
    from phonefarm import platform as pf
    from phonefarm.validate import _no_controls

    # Validación de entrada (PY-04): mismas reglas que el endpoint HTTP
    # (sin caracteres de control, longitudes máx, sin secretos en keyword/script).
    keyword = keyword or ""
    if not keyword or len(keyword) > 200:
        raise ValueError("keyword inválida (1..200 chars)")
    try:
        _no_controls(keyword)  # lanza ValueError si hay caracteres de control
    except ValueError:
        raise ValueError("keyword con caracteres de control no permitidos") from None
    script = script or ""
    if len(script) > 4000:
        raise ValueError("script inválido (0..4000 chars)")
    if script:
        try:
            _no_controls(script)
        except ValueError:
            raise ValueError("script con caracteres de control no permitidos") from None

    queue = platform_data.load_queue()
    job = {
        "id": pf._next_numeric_id(queue),
        "keyword": keyword,
        "target_account": target_account or (platform_data.load_accounts()[0]["id"] if platform_data.load_accounts() else ""),
        "niche_id": niche_id,
        "status": "pending",
        "video_path": None,
        "created_at": __import__("time").strftime("%Y-%m-%dT%H:%M:%SZ", __import__("time").gmtime()),
        "progress": 0,
        "script": script,
        "version": 1,
        "scheduled_ts": pf._parse_schedule(scheduled_time),
    }
    queue.append(job)
    platform_data.save_queue(queue)
    logger.info("[MCP] Job encolado: %s (%s)", job["id"], keyword)
    return _job_payload(job)


@mcp.tool()
def list_jobs(status: str = "") -> list[dict[str, Any]]:
    """Lista los jobs de la cola (filtra por status: pending, awaiting_approval, ...)."""
    jobs = platform_data.load_queue()
    if status:
        jobs = [j for j in jobs if j.get("status") == status]
    return [_job_payload(j) for j in jobs]


@mcp.tool()
def get_drafts() -> list[dict[str, Any]]:
    """Drafts pendientes de aprobación: script + caption + hashtags listos."""
    return [j for j in platform_data.load_queue() if j.get("status") == "awaiting_approval"]


@mcp.tool()
def approve_job(job_id: str) -> dict[str, Any]:
    """Aprueba el guión de un draft (scope approve): genera el vídeo con MPT."""
    from phonefarm import platform as pf

    queue = platform_data.load_queue()
    job = next((j for j in queue if j.get("id") == job_id), None)
    if job is None:
        raise ValueError(f"Job no existe: {job_id}")
    if job.get("status") != "awaiting_approval":
        raise ValueError(f"Job {job_id} en estado {job.get('status')}")
    # Pipeline de 3 etapas: approve -> generación (queda en awaiting_preview);
    # la publicación final exige ready_for_publish + scope publish.
    if not pf._spawn(job_id, lambda j=job: pf._generate_video(j)):
        raise RuntimeError(f"Job {job_id} ya se está procesando")
    logger.info("[MCP] Guión aprobado: %s", job_id)
    return {"job_id": job_id, "status": "generating", "message": "Generando vídeo (luego awaiting_preview)..."}


@mcp.tool()
def publish_job(job_id: str) -> dict[str, Any]:
    """Publica un job (scope publish). Exige estado ready_for_publish (la
    aprobación de publicación queda registrada en auditoría)."""
    from phonefarm import platform as pf

    queue = platform_data.load_queue()
    job = next((j for j in queue if j.get("id") == job_id), None)
    if job is None:
        raise ValueError(f"Job no existe: {job_id}")
    if job.get("status") != "ready_for_publish":
        raise ValueError(f"Job {job_id} en estado {job.get('status')} (esperado: ready_for_publish)")
    if not pf._spawn(job_id, lambda j=job: pf._publish_job(j)):
        raise RuntimeError(f"Job {job_id} ya se está procesando")
    logger.info("[MCP] Publicación iniciada: %s", job_id)
    return {"job_id": job_id, "status": "publishing"}


@mcp.tool()
def reject_job(job_id: str) -> dict[str, Any]:
    """Rechaza el guión de un draft (status -> rejected)."""
    queue = platform_data.load_queue()
    for job in queue:
        if job.get("id") == job_id:
            if job.get("status") != "awaiting_approval":
                raise ValueError(f"Job {job_id} en estado {job.get('status')}")
            job["status"] = "rejected"
            platform_data.save_queue(queue)
            logger.info("[MCP] Guión rechazado: %s", job_id)
            return {"job_id": job_id, "status": "rejected"}
    raise ValueError(f"Job no existe: {job_id}")


@mcp.tool()
def generate_script_preview(keyword: str, niche_id: str = "general", script: str = "") -> dict[str, Any]:
    """Vista previa de guión + caption + hashtags SIN encolar nada (consume LLM)."""
    return content.preview(keyword, niche_id, script or None)


@mcp.tool()
def list_content_profiles() -> list[dict[str, Any]]:
    """Lista los perfiles de nicho configurados (hashtags, voz, tono...)."""
    return content.load_profiles()


@mcp.tool()
def create_content_profile(
    id: str, name: str, hashtags: list[str], caption_template: str,
    tone: str = "directo y con gancho", voice_name: str = "es-ES-AlvaroNeural",
    video_terms: list[str] | None = None,
) -> dict[str, Any]:
    """Crea un perfil de nicho para la generación de contenido."""
    from phonefarm.validate import _no_controls

    # Validación de entrada (PY-04): `tone` se interpola en el system prompt
    # del LLM (content.py) — un valor malicioso sería prompt injection.
    for label, value in (("id", id), ("name", name), ("tone", tone), ("voice_name", voice_name)):
        if not isinstance(value, str) or not value or len(value) > 200:
            raise ValueError(f"{label} inválido (1..200 chars)")
        try:
            _no_controls(value)
        except ValueError:
            raise ValueError(f"{label} con caracteres de control no permitidos") from None
    if not isinstance(caption_template, str) or len(caption_template) > 1000:
        raise ValueError("caption_template inválido (0..1000 chars)")
    try:
        _no_controls(caption_template)
    except ValueError:
        raise ValueError("caption_template con caracteres de control no permitidos") from None
    if not isinstance(hashtags, list) or len(hashtags) > 60:
        raise ValueError("hashtags inválido (lista de máx. 60)")
    for h in hashtags:
        if not isinstance(h, str) or len(h) > 100:
            raise ValueError("hashtag inválido (máx. 100 chars)")
    if video_terms is not None and (not isinstance(video_terms, list) or len(video_terms) > 60):
        raise ValueError("video_terms inválido (lista de máx. 60)")

    profile_id = id.strip().lower().replace(" ", "_")
    profiles = content.load_profiles()
    if any(p.get("id") == profile_id for p in profiles):
        raise ValueError(f"El niché ya existe: {profile_id}")
    profile = {
        "id": profile_id, "name": name, "keywords": [],
        "hashtags": hashtags,
        "caption_template": caption_template,
        "tone": tone, "voice_name": voice_name, "video_aspect": "9:16",
        "video_terms": video_terms or [], "cta": "",
    }
    profiles.append(profile)
    content.save_profiles(profiles)
    logger.info("[MCP] Perfil creado: %s", profile_id)
    return profile


# ---------------------------------------------------------------------------
# Granja
# ---------------------------------------------------------------------------

@mcp.tool()
def get_stats() -> dict[str, Any]:
    """Métricas globales de la granja (videos, acciones, bots, proxies, cpu)."""
    queue = platform_data.load_queue()
    accounts = platform_data.load_accounts()
    proxies = platform_data.load_proxies()
    return {
        "videos_subidos": sum(1 for j in queue if j.get("status") == "published"),
        "borradores": sum(1 for j in queue if j.get("status") == "awaiting_approval"),
        "errores": sum(1 for j in queue if j.get("status") == "failed"),
        "acciones_hoy": sum(
            int(a.get("likes_today", 0)) + int(a.get("follows_today", 0)) + int(a.get("comments_today", 0))
            for a in accounts
        ),
        "active_bots": engagement.active_bots_count(),
        "active_proxies": sum(1 for p in proxies if p.get("status") == "online"),
    }


@mcp.tool()
def list_accounts() -> list[dict[str, Any]]:
    """Lista las cuentas de la granja (sin contraseñas)."""
    return [{k: v for k, v in a.items() if k != "password"} for a in platform_data.load_accounts()]


@mcp.tool()
def start_bot(account_id: str) -> dict[str, Any]:
    """Inicia el bot de engagement (taktik-bot) en la cuenta indicada (scope engagement)."""
    return engagement.start_bot(account_id)


@mcp.tool()
def stop_bot(account_id: str) -> dict[str, Any]:
    """Detiene el bot de engagement de la cuenta (scope engagement)."""
    return engagement.stop_bot(account_id)


@mcp.tool()
def list_proxies() -> list[dict[str, Any]]:
    """Lista los proxies configurados (sin credenciales)."""
    return [{k: v for k, v in p.items() if k != "pass"} for p in platform_data.load_proxies()]


@mcp.tool()
def get_logs(limit: int = 50) -> list[str]:
    """Últimos logs del sistema (máx. `limit`)."""
    from phonefarm import platform as pf

    return pf.log_buffer.tail(max(1, min(int(limit), 200)))


# ---------------------------------------------------------------------------
# ASGI middleware: Bearer auth + rate limit (envuelve streamable_http_app)
# ---------------------------------------------------------------------------

class BearerAuthMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in (scope.get("headers") or [])}
        auth = headers.get("authorization", "")
        token = auth[7:].strip() if auth.lower().startswith("bearer ") else ""

        if not token:
            return await self._reject(send, 401, "token Bearer requerido")
        principal = token_is_valid(token)
        if principal is None:
            return await self._reject(send, 401, "token inválido, expirado o revocado")
        if not _rate_limit(principal["id"]):
            return await self._reject(send, 429, "rate limit excedido (60 llamadas/min por token)")

        _current_principal.set(principal)
        return await self.app(scope, receive, send)

    @staticmethod
    async def _reject(send, status: int, message: str):
        body = json.dumps({"error": message}).encode("utf-8")
        await send({
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
            ],
        })
        await send({"type": "http.response.body", "body": body})


def start_mcp_server(port: int = 5001) -> None:
    """Arranca el MCP server (Streamable HTTP autenticado) en un hilo uvicorn."""
    import uvicorn

    app = BearerAuthMiddleware(mcp.streamable_http_app())
    # En Docker escucha 0.0.0.0 (el loopback lo garantiza el bind del compose
    # "127.0.0.1:5001:5001"); local: solo 127.0.0.1.
    bind_host = "0.0.0.0" if os.getenv("IN_DOCKER", "0") == "1" else "127.0.0.1"

    def run() -> None:
        logger.info("MCP server (Streamable HTTP, Bearer auth) en http://%s:%d/mcp", bind_host, port)
        uvicorn.run(app, host=bind_host, port=port, log_level="warning")

    threading.Thread(target=run, daemon=True, name="mcp-server").start()
