"""content — Motor de creación de contenido: perfiles de nicho, guiones, captions.

Flujo de diseño:
    keyword + perfil(nicho) -> script (LLM o plantilla) + caption + hashtags + terms
    -> [aprobación humana] -> MPT (script+terms provistos, sin LLM propio) -> vídeo
    -> caption -> instagrapi -> publicado

El guión se genera AQUÍ (LLM directo Kimi/OpenAI) para que el operador pueda
APROBARLO antes de gastar generación de vídeo en MPT.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any

import requests

logger = logging.getLogger(__name__)

DATA_DIR = Path(os.getenv("PHONE_FARM_DATA_DIR", Path(__file__).resolve().parent.parent))
PROFILES_FILE = DATA_DIR / "content_profiles.json"

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "kimi").lower()  # kimi | openai
KIMI_API_KEY = os.getenv("KIMI_API_KEY", "")
KIMI_BASE_URL = os.getenv("KIMI_BASE_URL", "https://api.moonshot.cn/v1")
KIMI_MODEL = os.getenv("KIMI_MODEL", "moonshot-v1-8k")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

SCRIPT_TIMEOUT_S = 60

DEFAULT_PROFILE: dict[str, Any] = {
    "id": "general",
    "name": "General",
    "keywords": [],
    "hashtags": ["#reels", "#viral", "#fyp"],
    "caption_template": "{keyword} 🔥 Descubre más en mi perfil.",
    "tone": "directo y con gancho",
    "voice_name": "es-ES-AlvaroNeural",
    "video_aspect": "9:16",
    "video_terms": [],
    "cta": "Sígueme para más contenido",
}


# ---------------------------------------------------------------------------
# Perfiles de nicho
# ---------------------------------------------------------------------------

def load_profiles() -> list[dict[str, Any]]:
    """Lee content_profiles.json (con el perfil 'general' siempre presente)."""
    try:
        with open(PROFILES_FILE, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        profiles = data if isinstance(data, list) else []
    except (FileNotFoundError, json.JSONDecodeError):
        profiles = []
    if not any(p.get("id") == "general" for p in profiles):
        profiles.insert(0, dict(DEFAULT_PROFILE))
    return profiles


def save_profiles(profiles: list[dict[str, Any]]) -> None:
    PROFILES_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(PROFILES_FILE, "w", encoding="utf-8") as fh:
        json.dump(profiles, fh, indent=2, ensure_ascii=False)


def get_profile(profile_id: str | None) -> dict[str, Any]:
    """Perfil por id; devuelve 'general' si no existe o no se indica."""
    profiles = load_profiles()
    return next((p for p in profiles if p.get("id") == (profile_id or "general")), dict(DEFAULT_PROFILE))


def suggest_hashtags(keyword: str, profile: dict[str, Any], limit: int = 8) -> list[str]:
    """Hashtags del perfil + 2 derivados de la keyword (máx. `limit`)."""
    base = [h for h in profile.get("hashtags", []) if isinstance(h, str) and h.startswith("#")]
    derived = []
    for word in re.findall(r"[a-záéíóúñü0-9]+", keyword.lower())[:3]:
        tag = f"#{word}"
        if tag not in base and len(tag) <= 25:
            derived.append(tag)
    return (base + derived)[:limit]


def build_caption(keyword: str, profile: dict[str, Any], cta: bool = True) -> str:
    """Caption final: plantilla del nicho + hashtags (+ CTA opcional)."""
    template = profile.get("caption_template") or DEFAULT_PROFILE["caption_template"]
    caption = template.replace("{keyword}", keyword[:60])
    if cta and profile.get("cta"):
        caption = f"{caption}\n\n{profile['cta']}"
    hashtags = " ".join(suggest_hashtags(keyword, profile))
    return f"{caption}\n\n{hashtags}".strip()


def generate_terms(keyword: str, profile: dict[str, Any], limit: int = 5) -> list[str]:
    """Términos de búsqueda para los materiales de MPT (video_terms)."""
    terms = [t for t in profile.get("video_terms", []) if t]
    derived = [f"{keyword} aesthetic", keyword, *re.findall(r"[a-záéíóúñü]+ [a-záéíóúñü]+", keyword.lower())[:2]]
    for term in derived:
        if term not in terms:
            terms.append(term)
        if len(terms) >= limit:
            break
    return terms[:limit]


# ---------------------------------------------------------------------------
# LLM (Kimi/OpenAI) — guiones
# ---------------------------------------------------------------------------

def _llm_chat(system: str, prompt: str) -> str | None:
    """Chat completions directo (Kimi Moonshot u OpenAI). None si no hay key."""
    if LLM_PROVIDER == "openai" and OPENAI_API_KEY:
        url = "https://api.openai.com/v1/chat/completions"
        headers = {"Authorization": f"Bearer {OPENAI_API_KEY}"}
        model = OPENAI_MODEL
    elif KIMI_API_KEY:
        url = f"{KIMI_BASE_URL}/chat/completions"
        headers = {"Authorization": f"Bearer {KIMI_API_KEY}"}
        model = KIMI_MODEL
    else:
        return None

    try:
        response = requests.post(
            url,
            headers=headers,
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.9,
                "max_tokens": 500,
            },
            timeout=SCRIPT_TIMEOUT_S,
        )
        if not response.ok:
            logger.warning("LLM HTTP %s: %s", response.status_code, response.text[:200])
            return None
        return response.json()["choices"][0]["message"]["content"].strip()
    except (requests.exceptions.RequestException, KeyError, IndexError) as exc:
        logger.warning("LLM falló (%s): %s", LLM_PROVIDER, type(exc).__name__)
        return None


_SCRIPT_FALLBACK = (
    "✨ 3 Claves sobre {keyword} ✨\n\n"
    "1. El detalle que marca la diferencia.\n"
    "2. El error que casi todos cometen.\n"
    "3. La solución simple que funciona hoy.\n\n"
    "#reels #viral #{kw_tag}"
)


def build_script(keyword: str, profile: dict[str, Any], script_hint: str | None = None) -> str:
    """Guión del reel: hint del usuario > LLM (con tono del nicho) > plantilla."""
    if script_hint and script_hint.strip():
        return script_hint.strip()

    tone = profile.get("tone") or DEFAULT_PROFILE["tone"]
    system = (
        "Eres un creador de guiones para Instagram Reels y TikTok. "
        f"Estilo: {tone}. Responde SOLO con el guión (30-60 palabras), "
        "con gancho inicial y una llamada a la acción final."
    )
    llm_script = _llm_chat(system, f"Crea el guión de un reel viral sobre: {keyword}")
    if llm_script:
        return llm_script

    kw_tag = re.sub(r"[^a-z0-9]", "", keyword.lower())[:20]
    return _SCRIPT_FALLBACK.format(keyword=keyword[:60], kw_tag=kw_tag)


# ---------------------------------------------------------------------------
# Vista previa (para el dashboard / MCP sin encolar)
# ---------------------------------------------------------------------------

def preview(keyword: str, profile_id: str | None = None, script_hint: str | None = None) -> dict[str, Any]:
    """Genera guión + caption + terms SIN tocar la cola (vista previa)."""
    profile = get_profile(profile_id)
    script = build_script(keyword, profile, script_hint)
    return {
        "keyword": keyword,
        "niche_id": profile.get("id", "general"),
        "script": script,
        "caption": build_caption(keyword, profile),
        "hashtags": suggest_hashtags(keyword, profile),
        "terms": generate_terms(keyword, profile),
        "voice_name": profile.get("voice_name", "es-ES-AlvaroNeural"),
        "video_aspect": profile.get("video_aspect", "9:16"),
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
