"""validate — esquemas Pydantic de entrada (paso 9): tipos estrictos,
longitudes máximas, sin caracteres de control (CR/LF/NUL) ni `=` en config.
"""

from __future__ import annotations

import re
from typing import Any

from flask import jsonify, request
from pydantic import BaseModel, Field, StrictBool, field_validator

# Rechaza CR/LF/NUL y otros controles en cualquier campo de texto.
_CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]")

# Rechaza CR/LF/NUL y `=` en valores de CONFIGURACIÓN (evita inyección de
# claves estilo .env y líneas de configuración).
_CONFIG_FORBIDDEN = re.compile(r"[\x00-\x1f\x7f=]")


def _no_controls(v: str) -> str:
    if _CONTROL_RE.search(v):
        raise ValueError("caracteres de control no permitidos")
    return v


def _config_safe(v: str) -> str:
    if _CONFIG_FORBIDDEN.search(v):
        raise ValueError("caracteres prohibidos (= o controles) en configuración")
    return v


class QueueCreate(BaseModel):
    keyword: str = Field(min_length=1, max_length=200)
    target_account: str = Field(default="", max_length=64)
    niche_id: str = Field(default="general", max_length=64)
    scheduled_time: str = Field(default="", max_length=64)
    script: str = Field(default="", max_length=4000)
    # StrictBool: "false" como STRING se rechaza (nada de coerción silenciosa)
    auto_approve: StrictBool | None = None
    _controls = field_validator("keyword", "target_account", "niche_id", "scheduled_time", "script")(_no_controls)


class AccountCreate(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=512)
    device_serial: str = Field(min_length=1, max_length=128)
    proxy_id: str = Field(default="", max_length=64)
    warmup_day: int = Field(default=1, ge=1, le=365)
    _controls = field_validator("username", "password", "device_serial", "proxy_id")(_no_controls)


class ProxyCreate(BaseModel):
    host: str = Field(min_length=1, max_length=253)
    port: int = Field(ge=1, le=65535)
    provider: str = Field(default="DataImpulse", max_length=64)
    type: str = Field(default="socks5", max_length=16)
    user: str = Field(default="", max_length=128)
    pass_: str | None = Field(default=None, max_length=512, alias="pass")
    assigned_account: str = Field(default="", max_length=64)
    _controls = field_validator("host", "provider", "type", "user", "assigned_account")(_no_controls)


class MptSettings(BaseModel):
    """Config MPT editable vía HTTP (sin secretos): valores seguros, sin '=' ni controles."""
    mpt_api_url: str = Field(default="", max_length=200)
    llm_provider: str = Field(default="", max_length=16)
    voice_name: str = Field(default="", max_length=64)
    video_aspect: str = Field(default="", max_length=16)
    _cfg = field_validator("mpt_api_url", "llm_provider", "voice_name", "video_aspect")(_config_safe)

    @field_validator("mpt_api_url")
    @classmethod
    def _url_safe(cls, v: str) -> str:
        from phonefarm.net import guard_internal_url

        if v:
            guard_internal_url(v)  # solo hosts internos (loopback/moneyprinter)
        return v


def validate_body(model: type[BaseModel]) -> dict[str, Any] | None:
    """Valida request.get_json() contra el modelo; si falla responde 400.

    Devuelve el dict validado o una respuesta Flask (400) si ya se respondió.
    """
    body = request.get_json(silent=True) or {}
    try:
        return model.model_validate(body).model_dump(by_alias=True, exclude_none=True)
    except Exception as exc:  # pydantic.ValidationError
        errs = getattr(exc, "errors", lambda: [])()
        msgs = [f"{'.'.join(map(str, e.get('loc', '?')))}: {e.get('msg', '?')}" for e in errs]
        return jsonify({"error": "validación fallida", "detail": msgs[:8]}), 400
