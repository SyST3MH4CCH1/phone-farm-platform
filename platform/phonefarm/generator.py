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

BASE_DIR = Path(__file__).resolve().parent.parent
VIDEOS_DIR = Path(os.getenv("PHONE_FARM_DATA_DIR", BASE_DIR)) / "videos"

MPT_API_URL = os.getenv("MPT_API_URL", "http://127.0.0.1:8080").rstrip("/")
# Clave API propia (paso 8): MPT exige x-api-key en TODO (salvo /ping).
MPT_API_KEY = os.getenv("MPT_API_KEY", "")


def _mpt_headers() -> dict[str, str]:
    return {"X-API-Key": MPT_API_KEY}
# Prefix real de la API de MoneyPrinterTurbo (verificado contra su openapi.json)
MPT_API_PREFIX = "/api/v1"
# BGM: "random" (por defecto) o "" para desactivarlo. La mezcla de BGM con
# MoviePy puede deadlockear en Mini PCs — "" evita el paso por completo.
MPT_BGM_TYPE = os.getenv("MPT_BGM_TYPE", "random")
VIDEO_ASPECT = os.getenv("MPT_VIDEO_ASPECT", "9:16")  # "9:16" | "16:9" | "1:1"
VOICE_NAME = os.getenv("MPT_VOICE_NAME", "es-ES-AlvaroNeural")
DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() == "true"
TASK_POLL_INTERVAL_S = 5
MAX_VIDEO_BYTES = int(os.getenv("PHONEFARM_MAX_VIDEO_MB", "500")) * 1024 * 1024
MIN_FREE_BYTES = int(os.getenv("PHONEFARM_MIN_FREE_GB", "2")) * 1024 ** 3
# Mini PCs lentos: la composición de 11+ clips puede tardar 30-40 min.
TASK_TIMEOUT_S = int(os.getenv("MPT_TASK_TIMEOUT_S", "3600"))


class GeneratorError(RuntimeError):
    """Error de generación de vídeo (MPT caído, tarea fallida, timeout...)."""


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def mpt_health() -> bool:
    """Comprueba si la API de MoneyPrinterTurbo responde (GET /ping, el único
    endpoint público tras el parche mpt-verify-token)."""
    try:
        from phonefarm.net import safe_get

        response = safe_get(f"{MPT_API_URL}/ping", timeout=3)
        return response.ok
    except (requests.exceptions.RequestException, ValueError):
        return False


def _check_disk_quota() -> None:
    """Cuota de disco mínima antes de generar (paso 12)."""
    import shutil

    free = shutil.disk_usage(VIDEOS_DIR if VIDEOS_DIR.exists() else VIDEOS_DIR.parent).free
    if free < MIN_FREE_BYTES:
        raise GeneratorError(f"disco casi lleno: {free / 2**30:.1f} GB libres (mínimo {MIN_FREE_BYTES / 2**30:.0f} GB)")


def _submit_task(keyword: str, script: str = "", terms: list[str] | None = None) -> str:
    """Crea una tarea de vídeo en MPT y devuelve el task_id.

    Si se proveen script y/o terms, MPT NO necesita su LLM propio
    (evita depender de la api_key del config.toml de MPT).
    """
    _check_disk_quota()
    payload = {
        "video_subject": keyword,
        "video_script": script,
        "video_terms": terms or [],
        "video_aspect": VIDEO_ASPECT,
        "video_count": 1,
        "video_concat_mode": "random",
        "voice_name": VOICE_NAME,
        "subtitle_enabled": True,
        "bgm_type": MPT_BGM_TYPE,
        "bgm_volume": 0.2,
    }
    try:
        from phonefarm.net import safe_post

        response = safe_post(f"{MPT_API_URL}{MPT_API_PREFIX}/videos", json=payload, headers=_mpt_headers(), timeout=15)
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
    """Espera a que la tarea termine. Retorna (progress, uris_video, failed_stage).

    Workaround MPT v1.3.3: tras generar los vídeos, MoviePy a veces deadlockea
    y el estado nunca flipea a success. Desde los 3 min se comprueba además si
    final-1.mp4 ya es descargable (GET /download/<task_id>/final-1.mp4) y, si
    existe, se usa como resultado.
    """
    deadline = time.monotonic() + TASK_TIMEOUT_S
    started = time.monotonic()
    while time.monotonic() < deadline:
        try:
            from phonefarm.net import safe_get

            response = safe_get(f"{MPT_API_URL}{MPT_API_PREFIX}/tasks/{task_id}", headers=_mpt_headers(), timeout=10)
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

        # Workaround: ¿el vídeo final ya existe aunque el estado no flipeó?
        # Solo en la fase final (progress>=75); se exige tamaño ESTABLE entre
        # TRES muestras (20 s) porque ffmpeg puede pausar la escritura a mitad
        # del encode: 2 muestras no bastan (descargaba el MP4 a medio escribir).
        if time.monotonic() - started > 180 and progress >= 75:
            probe_url = f"{MPT_API_URL}{MPT_API_PREFIX}/download/{task_id}/final-1.mp4"
            size1 = _probe_file_size(probe_url)
            if size1 > 200_000:
                time.sleep(20)
                size2 = _probe_file_size(probe_url)
                time.sleep(20)
                size3 = _probe_file_size(probe_url)
                if size1 == size2 == size3:
                    logger.warning(
                        "MPT estado colgado post-generación; final-1.mp4 estable "
                        "(%d bytes) — usando detección por archivo", size3,
                    )
                    return 100, [f"/download/{task_id}/final-1.mp4"], None

        logger.info("MPT task %s: progreso %d%%", task_id, progress)
        time.sleep(TASK_POLL_INTERVAL_S)

    raise GeneratorError(f"Timeout esperando tarea MPT {task_id} ({TASK_TIMEOUT_S}s)")


def _probe_file_size(url: str) -> int:
    """HEAD/GET parcial para conocer el tamaño actual del archivo en MPT."""
    try:
        from phonefarm.net import safe_get

        probe = safe_get(url, headers=_mpt_headers(), timeout=10, stream=True)
        size = int(probe.headers.get("Content-Length", "0") or 0)
        probe.close()
        return size
    except requests.exceptions.RequestException:
        return 0


def _normalize_download_uri(uri: str) -> str:
    """Normaliza la URI de descarga que devuelve MPT (paso 9: SSRF).

    SOLO rutas relativas bajo el storage esperado: se rechaza cualquier
    esquema (http/https), host, usuario/credenciales o ruta absoluta externa.
    """
    from phonefarm.net import EgressError

    if not isinstance(uri, str) or not uri:
        raise EgressError("URI de descarga vacía")
    if "://" in uri or uri.startswith(("//", "\\")):
        raise EgressError("descargas MPT solo rutas relativas (sin esquema/host)")
    if uri.startswith("/"):
        uri = uri.lstrip("/")
    path = uri
    if path.startswith("tasks/"):
        path = path[len("tasks/"):]
    if not path.startswith("download/"):
        path = f"download/{path}"
    # sin '..' ni rutas absolutas fuera del storage
    if ".." in path.split("/"):
        raise EgressError("ruta de descarga con '..' no permitida")
    return f"{MPT_API_URL}{MPT_API_PREFIX}/{path}"


def _validate_mp4(path: Path, min_duration_s: float = 5.0) -> bool:
    """Valida un MP4 descargado con ffprobe (duración real > mínimo).

    La descarga puede truncarse si el archivo de MPT aún se estaba escribiendo
    (el tamaño estable no basta: ffmpeg escribe en ráfagas). Un MP4 truncado
    no tiene el atom moov y ffprobe lo detecta al instante.
    """
    ffprobe = _find_ffprobe()
    if not ffprobe:
        return path.stat().st_size > 1_000_000  # sin ffprobe: umbral de tamaño
    try:
        result = subprocess.run(
            [ffprobe, "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            return False
        duration = float(result.stdout.strip())
        return duration > min_duration_s
    except (ValueError, subprocess.TimeoutExpired):
        return False


def _find_ffprobe() -> str | None:
    """ffprobe del sistema (acompaña a ffmpeg)."""
    if os.getenv("FFPROBE_PATH"):
        return os.getenv("FFPROBE_PATH")
    found = shutil.which("ffprobe")
    if found:
        return found
    ffmpeg = _find_ffmpeg()
    if ffmpeg:
        sibling = Path(ffmpeg).with_name("ffprobe" + (".exe" if ffmpeg.endswith(".exe") else ""))
        if sibling.exists():
            return str(sibling)
    return None


def _download_video(uri: str, dest: Path) -> None:
    """Descarga el MP4 de MPT hacia videos/<job_id>.mp4 y lo valida con ffprobe.

    Si la descarga queda truncada (MP4 inválido), reintenta hasta 3 veces con
    espera — el archivo de MPT puede seguir escribiéndose.
    """
    from phonefarm.net import safe_get

    url = _normalize_download_uri(uri)
    for attempt in range(1, 5):
        dest.parent.mkdir(parents=True, exist_ok=True)
        response = safe_get(url, headers=_mpt_headers(), timeout=180, stream=True)
        if not response.ok:
            raise GeneratorError(f"Descarga MPT falló (HTTP {response.status_code}): {url[:200]}")
        # Paso 12: límite de tamaño de vídeo (evita agotar disco).
        declared = int(response.headers.get("Content-Length") or 0)
        if declared > MAX_VIDEO_BYTES:
            raise GeneratorError(f"vídeo declarado de {declared / 2**20:.0f} MB supera el límite ({MAX_VIDEO_BYTES / 2**20:.0f} MB)")
        written = 0
        with open(dest, "wb") as fh:
            for chunk in response.iter_content(chunk_size=1024 * 256):
                written += len(chunk)
                if written > MAX_VIDEO_BYTES:
                    fh.close()
                    dest.unlink(missing_ok=True)
                    raise GeneratorError(f"vídeo supera el límite de {MAX_VIDEO_BYTES / 2**20:.0f} MB")
                fh.write(chunk)

        if _validate_mp4(dest):
            logger.info("Vídeo descargado y VALIDADO: %s (%d bytes)", dest.name, dest.stat().st_size)
            return

        logger.warning(
            "Descarga %s inválida/truncada (intento %d/4, %d bytes) — reintentando",
            dest.name, attempt, dest.stat().st_size,
        )
        dest.unlink(missing_ok=True)
        # ffmpeg puede tardar minutos en terminar el encode final; esperar
        # más cada intento en vez de volver a descargar un archivo a medias.
        time.sleep(30 * attempt)

    raise GeneratorError(f"MP4 truncado tras 4 intentos: {dest.name}")


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

def generate_reel(keyword: str, job_id: str, script: str = "", terms: list[str] | None = None) -> str:
    """Genera un Reel 9:16 con MoneyPrinterTurbo y retorna la ruta absoluta del MP4.

    Args:
        keyword: tema del vídeo (video_subject).
        job_id:  identificador del job de la cola (nombre del archivo de salida).
        script:  guión opcional (si vacío, MPT usa su LLM configurado).
        terms:   términos de materiales (si se proveen, MPT omite su generación).

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

    task_id = _submit_task(keyword, script, terms)
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
