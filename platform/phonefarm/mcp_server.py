"""mcp_server — Servidor MCP (Streamable HTTP) de la Phone Farm REAL.

Expone el pipeline de creación de contenido (encolar, aprobar, rechazar,
vista previa, nichos) y las operaciones de la granja para que agentes
(Claude, Codex, ZCode, oh-my-codex, etc.) operen la plataforma real.

Se sirve con uvicorn en el puerto 5001 (ruta /mcp) como hilo de platform.py.
"""

from __future__ import annotations

import json
import logging
import threading
from typing import Any

from mcp.server.fastmcp import FastMCP

from phonefarm import content, engagement, platform_data

logger = logging.getLogger(__name__)

mcp = FastMCP("phone-farm")


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
    auto_approve: bool = False,
    script: str = "",
) -> dict[str, Any]:
    """Encola un trabajo de creación de contenido (keyword -> guión -> vídeo).

    Si auto_approve es true salta la revisión humana; si no, quedará en
    awaiting_approval esperando approve_job().
    """
    from phonefarm import platform as pf

    queue = platform_data.load_queue()
    job = {
        "id": f"job_{len(queue) + 101}",
        "keyword": keyword,
        "target_account": target_account or (platform_data.load_accounts()[0]["id"] if platform_data.load_accounts() else ""),
        "niche_id": niche_id,
        "status": "pending",
        "video_path": None,
        "created_at": __import__("time").strftime("%Y-%m-%dT%H:%M:%SZ", __import__("time").gmtime()),
        "progress": 0,
        "script": script,
        "auto_approve": auto_approve,
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
    """Aprueba el guión de un draft: genera el vídeo con MPT y lo publica."""
    from phonefarm import platform as pf

    queue = platform_data.load_queue()
    job = next((j for j in queue if j.get("id") == job_id), None)
    if job is None:
        raise ValueError(f"Job no existe: {job_id}")
    if job.get("status") != "awaiting_approval":
        raise ValueError(f"Job {job_id} en estado {job.get('status')}")
    if not pf._spawn(job_id, lambda j=job: pf._generate_and_publish(j)):
        raise RuntimeError(f"Job {job_id} ya se está procesando")
    logger.info("[MCP] Guión aprobado: %s", job_id)
    return {"job_id": job_id, "status": "generating", "message": "Generando y publicando..."}


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
    """Vista previa de guión + caption + hashtags SIN encolar nada."""
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
    """Inicia el bot de engagement (taktik-bot) en la cuenta indicada."""
    return engagement.start_bot(account_id)


@mcp.tool()
def stop_bot(account_id: str) -> dict[str, Any]:
    """Detiene el bot de engagement de la cuenta."""
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


def start_mcp_server(port: int = 5001) -> None:
    """Arranca el MCP server (Streamable HTTP) en un hilo con uvicorn."""
    import os
    import uvicorn

    app = mcp.streamable_http_app()
    # En Docker escucha 0.0.0.0 (el loopback lo garantiza el bind del compose
    # "127.0.0.1:5001:5001"); local: solo 127.0.0.1.
    bind_host = "0.0.0.0" if os.getenv("IN_DOCKER", "0") == "1" else "127.0.0.1"

    def run() -> None:
        logger.info("MCP server (Streamable HTTP) en http://%s:%d/mcp", bind_host, port)
        uvicorn.run(app, host=bind_host, port=port, log_level="warning")

    threading.Thread(target=run, daemon=True, name="mcp-server").start()
