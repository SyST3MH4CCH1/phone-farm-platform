"""redact — redacción central de PII/secretos en logs y streams (paso 10).

Se aplica en el ring buffer (SSE/MCP) y como filtro de logging. Los valores
enmascarados se sustituyen por '<redacted>'. Nunca se registran passwords,
tokens, claves API, rutas de sesión ni seriales.
"""

from __future__ import annotations

import logging
import re

# Orden importa: primero los pares completos password/token, luego restos.
_PATTERNS: list[tuple[str, str]] = [
    # pares clave=valor / "clave": "valor" (valores hasta coma/espacio/comilla)
    (r"(?i)(password|passwd|pass|pwd|api[-_]?key|token|secret|authorization|set-cookie)\s*[=:]\s*[\"']?[^\"',\s;&]+",
     r"\1=<redacted>"),
    # Bearer tokens
    (r"(?i)(bearer\s+)[A-Za-z0-9._~+/=-]+", r"\1<redacted>"),
    # rutas de sesión
    (r"(?i)sessions?/[A-Za-z0-9._-]+\.json", "sessions/<redacted>"),
    # adbkey / claves privadas
    (r"(?i)adbkey(?:\.pub)?", "<redacted>"),
    # seriales de dispositivo (formato típico ADB)
    (r"\b[A-Za-z0-9]{8,}\tdevice\b", "<serial-redacted>\tdevice"),
]

_complex_re = [re.compile(p) for p, _ in _PATTERNS]


def redact_text(text: str) -> str:
    """Aplica todas las reglas de redacción a un texto."""
    out = text
    for pattern, replacement in _PATTERNS:
        out = re.sub(pattern, replacement, out)
    return out


class RedactFilter(logging.Filter):
    """Filtro de logging: redacta el mensaje formateado antes de escribirlo."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            if record.args:
                # Los args se interpolan DESPUÉS por el Formatter, así que el
                # filtro debe redactar el mensaje YA interpolado y vaciar args
                # (p.ej. logger.info("pass=%s", secret) → el secreto iba en claro).
                record.msg = redact_text(record.getMessage())
                record.args = None
            elif isinstance(record.msg, str):
                record.msg = redact_text(record.msg)
        except Exception:  # noqa: BLE001 — la redacción nunca rompe el log
            pass
        return True
