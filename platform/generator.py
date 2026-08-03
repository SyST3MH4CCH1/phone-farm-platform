"""generator — Wrapper sobre MoneyPrinterTurbo para generar Reels 9:16.

Integra contra la API FastAPI de MoneyPrinterTurbo (repositorio clonado en
third_party/MoneyPrinterTurbo):

    POST /videos                    -> crea tarea {data: {task_id}}
    GET  /tasks/{task_id}           -> estado {state, progress, videos, combined_videos, failed_stage}
    GET  /download/{file_path:path} -> descarga el MP4 resultante

Seguridad (CVE-2025-7897): MoneyPrinterTurbo expone ejecución remota de
comandos si su API queda enlazada a 0.0.0.0. Esta plataforma:
    - enlaza MPT SOLO a 127.0.0.1 (config.toml -> listen_host) o a la red
      interna de docker-compose (puerto nunca publicado al host),
    - nunca pasa claves API por argumentos de CLI visibles.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import requests

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent
VIDEOS_DIR = Path(os.getenv("PHONE_FARM_DATA_DIR", BASE_DIR)) / "videos"

MPT_API_URL = os.getenv("MPT_API_URL", "http://127.0.0.1:8080").rstrip("/")
VIDEO_ASPECT = os.getenv("MPT_VIDEO_ASPECT", "9:16")  # "9:16" | "16:9" | "1:1"
VOICE_NAME = os.getenv("MPT_VOICE_NAME", "es-ES-AlvaroNeural")
DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() == "true"
TASK_POLL_INTERVAL_S = 5
TASK_TIMEOUT_S = int(os.getenv("MPT_TASK_TIMEOUT_S", "1800"))


class GeneratorError(RuntimeError):
    """Error de generación de vídeo (MPT caído, tarea fallida, timeout...)."""


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def mpt_health() -> bool:
    """Comprueba si la API de MoneyPrinterTurbo responde (GET /docs o /openapi.json)."""
    try:
        response = requests.get(f"{MPT_API_URL}/openapi.json", timeout=3)
        return response.ok
    except requests.exceptions.RequestException:
        return False


def _submit_task(keyword: str, script: str = "") -> str:
    """Crea una tarea de vídeo en MPT y devuelve el task_id."""
    payload = {
        "video_subject": keyword,
        "video_script": script,
        "video_aspect": VIDEO_ASPECT,
        "video_count": 1,
        "video_concat_mode": "random",
        "voice_name": VOICE_NAME,
        "subtitle_enabled": True,
        "bgm_volume": 0.2,
    }
    try:
        response = requests.post(f"{MPT_API_URL}/videos", json=payload, timeout=15)
    except requests.exceptions.RequestException as exc:
        raise GeneratorError(f"MPT no responde en {MPT_API_URL}: {type(exc).__name__}") from exc
    if not response.ok:
        raise GeneratorError(f"MPT rechazó la tarea (HTTP {response.status_code}): {response.text[:300]}")
    data = response.json().get("data", {})
    task_id = data.get("task_id")
    if not task_id:
        raise GeneratorError(f"MPT no devolvió task_id: {response.text[:300]}")
    return task_id


def _poll_task(task_id: str) -> tuple[int, list[str], str | None]:
    """Espera a que la tarea termine. Retorna (progress, uris_video, failed_stage)."""
    deadline = time.monotonic() + TASK_TIMEOUT_S
    while time.monotonic() < deadline:
        try:
            response = requests.get(f"{MPT_API_URL}/tasks/{task_id}", timeout=10)
        except requests.exceptions.RequestException as exc:
            logger.warning("MPT poll error: %s", type(exc).__name__)
            time.sleep(TASK_POLL_INTERVAL_S)
            continue
        if not response.ok:
            logger.warning("MPT task %s -> HTTP %s", task_id, response.status_code)
            time.sleep(TASK_POLL_INTERVAL_S)
            continue

        data = response.json().get("data", {})
        failed_stage = data.get("failed_stage")
        progress = int(data.get("progress", 0))
        videos: list[str] = data.get("combined_videos") or data.get("videos") or []
        if failed_stage:
            return progress, [], failed_stage
        if videos:
            return 100, videos, None
        logger.info("MPT task %s: progreso %d%%", task_id, progress)
        time.sleep(TASK_POLL_INTERVAL_S)

    raise GeneratorError(f"Timeout esperando tarea MPT {task_id} ({TASK_TIMEOUT_S}s)")


def _download_video(uri: str, dest: Path) -> None:
    """Descarga el MP4 de MPT (URI tipo /download/<ruta>) hacia videos/<job_id>.mp4."""
    url = uri if uri.startswith("http") else f"{MPT_API_URL}{uri}"
    response = requests.get(url, timeout=120, stream=True)
    if not response.ok:
        raise GeneratorError(f"Descarga MPT falló (HTTP {response.status_code}): {url[:200]}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    with open(dest, "wb") as fh:
        shutil.copyfileobj(response.raw, fh)
    logger.info("Vídeo descargado: %s (%d bytes)", dest.name, dest.stat().st_size)


# ---------------------------------------------------------------------------
# Demo mode (sin MPT)
# ---------------------------------------------------------------------------

def _find_ffmpeg() -> str | None:
    """Localiza ffmpeg: env FFMPEG_PATH > PATH > paquete WinGet (Windows).

    El shim de WinGet (ffmpeg.exe en Links/) crashea sin sus DLLs, así que se
    busca el binario real dentro del paquete Gyan.FFmpeg.
    """
    if os.getenv("FFMPEG_PATH"):
        return os.getenv("FFMPEG_PATH")
    found = shutil.which("ffmpeg")
    if found and sys.platform != "win32":
        return found
    # Windows: el binario real vive en WinGet\Packages\*\ffmpeg-*-full_build\bin\
    for pattern in (
        str(Path.home() / "AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg*/*full_build/bin/ffmpeg.exe"),
        str(Path.home() / "AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg*/*essentials_build/bin/ffmpeg.exe"),
    ):
        for candidate in sorted(Path(pattern).glob("*.exe")):  # type: ignore[arg-type]
            return str(candidate)
    return found


_FONT_CANDIDATES = (
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
)


def _generate_demo_video(keyword: str, dest: Path) -> Path:
    """Genera un placeholder 9:16 con ffmpeg (solo DEMO_MODE, para E2E sin MPT)."""
    ffmpeg = _find_ffmpeg()
    if not ffmpeg:
        raise GeneratorError("DEMO_MODE requiere ffmpeg (FFMPEG_PATH o PATH)")
    font = next((f for f in _FONT_CANDIDATES if Path(f).exists()), None)
    dest.parent.mkdir(parents=True, exist_ok=True)
    safe_keyword = (keyword or "demo")[:40].replace("'", "")
    # Python 3.11: los f-strings no admiten backslash en la expresión
    escaped_font = font.replace(":", "\\:") if font else ""
    drawtext = f"drawtext=fontfile='{escaped_font}':" if font else "drawtext="
    drawtext += f"text='{safe_keyword}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2"
    cmd = [
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi",
        "-i", "color=c=0x0B1320:s=1080x1920:d=8",
        "-vf", drawtext,
        "-c:v", "libx264", "-pix_fmt", "yuv420p", str(dest),
    ]
    subprocess.run(cmd, capture_output=True, text=True, timeout=120, check=True)
    logger.warning("DEMO_MODE: vídeo placeholder generado en %s", dest)
    return dest


# ---------------------------------------------------------------------------
# API pública
# ---------------------------------------------------------------------------

def generate_reel(keyword: str, job_id: str, script: str = "") -> str:
    """Genera un Reel 9:16 con MoneyPrinterTurbo y retorna la ruta absoluta del MP4.

    Args:
        keyword: tema del vídeo (video_subject).
        job_id:  identificador del job de la cola (nombre del archivo de salida).
        script:  guión opcional (si vacío, MPT usa su LLM configurado).

    Returns:
        Ruta absoluta del MP4 en videos/<job_id>.mp4.

    Raises:
        GeneratorError: si MPT no responde, la tarea falla o el timeout se agota.
    """
    dest = VIDEOS_DIR / f"{job_id}.mp4"
    if dest.exists():
        logger.info("Vídeo %s ya existe; se reutiliza", dest)
        return str(dest)

    if DEMO_MODE and not mpt_health():
        return str(_generate_demo_video(keyword, dest))

    task_id = _submit_task(keyword, script)
    logger.info("Tarea MPT creada: %s (keyword=%r)", task_id, keyword)

    _progress, uris, failed_stage = _poll_task(task_id)
    if failed_stage:
        raise GeneratorError(f"Tarea MPT {task_id} falló en etapa: {failed_stage}")
    if not uris:
        raise GeneratorError(f"Tarea MPT {task_id} terminó sin vídeo")

    # Preferir el vídeo combinado final (última URI)
    uri = uris[-1]
    _download_video(uri, dest)
    return str(dest)
