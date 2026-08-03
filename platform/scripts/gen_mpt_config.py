"""gen_mpt_config — Genera mpt-config.toml para MoneyPrinterTurbo desde .env.

Sustituye placeholders {{VAR}} con los valores del .env de la plataforma:
    LLM_PROVIDER   (kimi -> moonshot | openai)
    KIMI_API_KEY   -> moonshot_api_key
    OPENAI_API_KEY -> openai_api_key
    PEXELS_API_KEY -> pexels_api_keys (lista; varias keys separadas por coma)

Seguridad (CVE-2025-7897): en Docker, MPT escucha en 0.0.0.0 DENTRO del
contenedor pero su puerto 8080 SOLO se publica en 127.0.0.1 del host; en
ejecución local se fuerza listen_host = "127.0.0.1".
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
MPT_SOURCE = BASE_DIR / "third_party" / "MoneyPrinterTurbo" / "config.example.toml"
OUTPUT = BASE_DIR / "mpt-config.toml"
TEMPLATE = """# Auto-generado por scripts/gen_mpt_config.py (no editar a mano).
# Configuración segura: en ejecución local el API escucha SOLO en 127.0.0.1.
log_level = "INFO"
listen_host = "{listen_host}"
listen_port = 8080

[app]
edge_tts_timeout = 30
tls_verify = true
video_source = "pexels"
pexels_api_keys = [{pexels_keys}]
pixabay_api_keys = []
{ffmpeg_line}
[llm]
llm_provider = "{llm_provider}"
{llm_keys}
"""


def _ffmpeg_line() -> str:
    """Ruta de ffmpeg según plataforma.

    Linux (Docker): el ffmpeg del sistema (apt) — el binario estático de
    imageio consume más memoria.
    Windows: el shim de WinGet (ffmpeg.exe en Links/) crashea (0xC0000005);
    se busca el binario REAL del paquete Gyan.FFmpeg. Si no se encuentra,
    se deja vacío y MPT usa su ffmpeg bundled (imageio).
    """
    import glob
    import sys

    if sys.platform == "win32":
        home = Path.home()
        for pattern in (
            str(home / "AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg*/*full_build/bin/ffmpeg.exe"),
            str(home / "AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg*/*essentials_build/bin/ffmpeg.exe"),
        ):
            for candidate in sorted(glob.glob(pattern)):
                # Barras / : las \ de Windows son escapes inválidos en TOML
                return f'ffmpeg_path = "{candidate.replace(chr(92), "/")}"'
        return ""
    return 'ffmpeg_path = "/usr/bin/ffmpeg"'


def _toml_string_list(value: str) -> str:
    """Convierte 'k1,k2' (env) en la lista toml: "k1", "k2"."""
    keys = [k.strip() for k in value.split(",") if k.strip()]
    return ", ".join(f'"{k}"' for k in keys)


def main() -> None:
    provider = os.getenv("LLM_PROVIDER", "kimi").lower()
    if provider == "openai":
        llm_provider = "openai"
        llm_keys = f'openai_api_key = "{os.getenv("OPENAI_API_KEY", "")}"\nopenai_base_url = ""\nopenai_model_name = ""'
    else:
        llm_provider = "moonshot"
        llm_keys = f'moonshot_api_key = "{os.getenv("KIMI_API_KEY", "")}"\nmoonshot_base_url = ""\nmoonshot_model_name = ""'

    pexels_keys = _toml_string_list(os.getenv("PEXELS_API_KEY", ""))
    listen_host = "0.0.0.0" if os.getenv("IN_DOCKER", "0") == "1" else "127.0.0.1"

    OUTPUT.write_text(
        TEMPLATE.format(
            listen_host=listen_host,
            llm_provider=llm_provider,
            llm_keys=llm_keys,
            pexels_keys=pexels_keys,
            ffmpeg_line=_ffmpeg_line(),
        ),
        encoding="utf-8",
    )
    print(f"[ok] Config MPT generada: {OUTPUT} (provider={llm_provider}, listen={listen_host}, pexels_keys={len(pexels_keys.split(',')) if pexels_keys else 0})")


if __name__ == "__main__":
    # Cargar .env si existe (misma lógica que platform.py)
    try:
        from dotenv import load_dotenv

        load_dotenv(BASE_DIR / ".env")
    except ImportError:
        pass
    main()
