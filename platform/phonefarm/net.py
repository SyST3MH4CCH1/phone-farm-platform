"""net — política central de egress/SSRF (paso 9).

- `guard_internal_url`: solo esquema http/https y host dentro de una allowlist
  explícita (MPT/Flask internos); rechaza redirects que cambien de host/esquema.
- `guard_external_url`: para destinos externos (LLM, Pexels): esquema http/https,
  sin credenciales en URL y las IPs resueltas NO pueden ser privadas/loopback/
  link-local/metadata (SSRF por DNS rebinding).

Toda salida HTTP de la plataforma debería pasar por aquí.
"""

from __future__ import annotations

import ipaddress
import logging
import socket
from urllib.parse import urlparse

import requests

logger = logging.getLogger(__name__)

# Hosts internos permitidos (MPT local/Docker; Flask loopback)
ALLOWED_INTERNAL_HOSTS = {"127.0.0.1", "localhost", "moneyprinter", "host.docker.internal"}

BLOCKED_IP_KINDS = ("is_private", "is_loopback", "is_link_local", "is_reserved", "is_multicast", "is_unspecified")


class EgressError(ValueError):
    """Destino no permitido por la política de egress."""


def _host_of(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower()
    except ValueError as exc:
        raise EgressError("URL mal formada") from exc


def _resolve(host: str) -> list[str]:
    try:
        return sorted({info[4][0] for info in socket.getaddrinfo(host, None, socket.AF_UNSPEC)})
    except socket.gaierror as exc:
        raise EgressError(f"no se pudo resolver {host}") from exc


def _ip_blocked(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return True
    return any(getattr(ip, kind, False) for kind in BLOCKED_IP_KINDS)


def guard_internal_url(url: str, allowed_hosts: set[str] | None = None) -> None:
    """Permite solo http/https hacia hosts internos de la allowlist."""
    allowed = allowed_hosts or ALLOWED_INTERNAL_HOSTS
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise EgressError(f"esquema no permitido: {parsed.scheme!r}")
    if parsed.username or parsed.password:
        raise EgressError("credenciales en URL no permitidas")
    host = parsed.hostname or ""
    if host.lower() not in allowed:
        raise EgressError(f"host interno no permitido: {host}")


def guard_external_url(url: str) -> None:
    """Permite http/https a destinos externos SIN IPs privadas/metadata."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise EgressError(f"esquema no permitido: {parsed.scheme!r}")
    if parsed.username or parsed.password:
        raise EgressError("credenciales en URL no permitidas")
    host = parsed.hostname or ""
    if not host:
        raise EgressError("URL sin host")
    for ip in _resolve(host):
        if _ip_blocked(ip):
            raise EgressError(f"IP bloqueada ({ip}) para {host}")


def safe_get(url: str, *, internal: bool = True, allowed_hosts: set[str] | None = None,
             headers: dict[str, str] | None = None, timeout: float = 10,
             allow_redirects: bool = False, stream: bool = False, **kwargs) -> requests.Response:
    """GET con política de egress + redirects restringidos al mismo host/esquema."""
    guard_internal_url(url, allowed_hosts) if internal else guard_external_url(url)
    resp = requests.get(url, headers=headers, timeout=timeout, stream=stream,
                        allow_redirects=False, **kwargs)
    if resp.is_redirect and not allow_redirects:
        location = resp.headers.get("Location", "")
        if not location.startswith(("http://", "https://")):
            raise EgressError("redirect relativo no permitido")
        if internal:
            guard_internal_url(location, allowed_hosts)
        else:
            guard_external_url(location)
    return resp


def safe_post(url: str, *, internal: bool = True, allowed_hosts: set[str] | None = None,
              json=None, headers: dict[str, str] | None = None, timeout: float = 15, **kwargs) -> requests.Response:
    guard_internal_url(url, allowed_hosts) if internal else guard_external_url(url)
    return requests.post(url, json=json, headers=headers, timeout=timeout, allow_redirects=False, **kwargs)
