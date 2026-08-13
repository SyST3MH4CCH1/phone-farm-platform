"""keystore — clave maestra AES-256 para cifrado de campos (paso 4+).

Providers:
  dpapi (Windows, por defecto): la clave de 32 bytes se envuelve con
    CryptProtectData(CurrentUser) y se persiste en PHONEFARM_MASTER_KEY_PATH.
    Solo la misma cuenta de Windows puede desempaquetarla (ctypes, sin pywin32).
  file (fallback / Docker secret): fichero con 64 chars hex, permisos 0600.

CLI:
  python -m phonefarm.keystore ensure          # crea la clave si falta (idempotente)
  python -m phonefarm.keystore path            # imprime la ruta del fichero (sin valor)
"""

from __future__ import annotations

import ctypes
import ctypes.wintypes
import logging
import os
import secrets
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

MASTER_KEY_LEN = 32  # AES-256


class MasterKeyError(Exception):
    pass


# --- DPAPI (Windows) vía ctypes ---

class _DATA_BLOB(ctypes.Structure):
    _fields_ = [("cbData", ctypes.wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]


def _dpapi_protect(data: bytes) -> bytes:
    if sys.platform != "win32":
        raise MasterKeyError("DPAPI solo está disponible en Windows")
    blob_in = _DATA_BLOB(len(data), ctypes.cast(ctypes.create_string_buffer(data), ctypes.POINTER(ctypes.c_byte)))
    blob_out = _DATA_BLOB()
    if not ctypes.windll.crypt32.CryptProtectData(
        ctypes.byref(blob_in), None, None, None, None, 0x01, ctypes.byref(blob_out)  # CRYPTPROTECT_UI_FORBIDDEN | CRYPTPROTECT_LOCAL_MACHINE=0
    ):
        raise MasterKeyError("CryptProtectData falló (código %d)" % ctypes.windll.kernel32.GetLastError())
    out = ctypes.string_at(blob_out.pbData, blob_out.cbData)
    ctypes.windll.kernel32.LocalFree(blob_out.pbData)
    return out


def _dpapi_unprotect(blob: bytes) -> bytes:
    if sys.platform != "win32":
        raise MasterKeyError("DPAPI solo está disponible en Windows")
    buf = ctypes.create_string_buffer(blob)
    blob_in = _DATA_BLOB(len(blob), ctypes.cast(buf, ctypes.POINTER(ctypes.c_byte)))
    blob_out = _DATA_BLOB()
    if not ctypes.windll.crypt32.CryptUnprotectData(
        ctypes.byref(blob_in), None, None, None, None, 0x01, ctypes.byref(blob_out)
    ):
        raise MasterKeyError("CryptUnprotectData falló (código %d)" % ctypes.windll.kernel32.GetLastError())
    out = ctypes.string_at(blob_out.pbData, blob_out.cbData)
    ctypes.windll.kernel32.LocalFree(blob_out.pbData)
    return out


# --- fichero ---

def _write_restrictive(path: Path, data: bytes) -> None:
    """Escribe con permisos restrictivos (0600 en POSIX; DACL mínima en Windows).
    Escritura completa + fsync: un corte a mitad (antivirus/FS) corrompería el
    blob DPAPI y dejaría la clave inutilizable."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as fh:
        written = fh.write(data)
        if written != len(data):
            raise MasterKeyError(f"escritura parcial de {path}: {written}/{len(data)} bytes")
        fh.flush()
        os.fsync(fh.fileno())
    if sys.platform == "win32":
        # ACL: solo usuario actual + SYSTEM (best-effort con icacls)
        try:
            import subprocess
            who = os.environ.get("USERNAME", "")
            subprocess.run(
                ["icacls", str(path), "/inheritance:r", "/grant:r", f"{who}:(F)", "SYSTEM:(F)"],
                check=False, capture_output=True,
            )
        except Exception:  # pragma: no cover
            logger.warning("no se pudo aplicar ACL a %s", path)


def _default_key_path() -> Path:
    base = Path(os.getenv("PHONE_FARM_DATA_DIR", str(Path(__file__).resolve().parent.parent)))
    return base / "data" / "master.key"


def ensure_master_key(provider: str | None = None, path: str | None = None) -> bytes:
    """Crea la clave maestra si no existe y devuelve sus 32 bytes."""
    provider = provider or os.getenv("PHONEFARM_KEY_PROVIDER", "dpapi" if sys.platform == "win32" else "file")
    key_path = Path(path) if path else Path(os.getenv("PHONEFARM_MASTER_KEY_PATH", str(_default_key_path())))

    if key_path.exists():
        return get_master_key(provider, str(key_path))

    if provider == "dpapi":
        raw = secrets.token_bytes(MASTER_KEY_LEN)
        _write_restrictive(key_path, _dpapi_protect(raw))
    elif provider == "file":
        raw = secrets.token_bytes(MASTER_KEY_LEN)
        _write_restrictive(key_path, raw.hex().encode("ascii"))
    else:
        raise MasterKeyError(f"PHONEFARM_KEY_PROVIDER desconocido: {provider!r} (dpapi|file)")
    logger.info("clave maestra creada: %s (%s)", key_path, provider)
    return raw


def get_master_key(provider: str | None = None, path: str | None = None) -> bytes:
    """Devuelve la clave maestra (32 bytes). Falla si no existe (fail-closed)."""
    provider = provider or os.getenv("PHONEFARM_KEY_PROVIDER", "dpapi" if sys.platform == "win32" else "file")
    key_path = Path(path) if path else Path(os.getenv("PHONEFARM_MASTER_KEY_PATH", str(_default_key_path())))
    if not key_path.exists():
        raise MasterKeyError(
            f"Clave maestra no encontrada en {key_path}. Ejecuta: python -m phonefarm.keystore ensure"
        )

    if provider == "dpapi":
        try:
            return _dpapi_unprotect(key_path.read_bytes())
        except Exception as exc:
            raise MasterKeyError(f"No se pudo desempaquetar la clave DPAPI ({exc})") from exc
    elif provider == "file":
        try:
            raw = key_path.read_text(encoding="ascii").strip()
            key = bytes.fromhex(raw)
        except (ValueError, UnicodeDecodeError) as exc:
            raise MasterKeyError(f"Clave maestra en {key_path} no es hex válido") from exc
        if len(key) != MASTER_KEY_LEN:
            raise MasterKeyError(f"Clave maestra debe tener {MASTER_KEY_LEN} bytes")
        return key
    raise MasterKeyError(f"PHONEFARM_KEY_PROVIDER desconocido: {provider!r} (dpapi|file)")


def main() -> int:
    import argparse
    parser = argparse.ArgumentParser(description="Keystore de Phone Farm (clave maestra AES-256)")
    sub = parser.add_subparsers(dest="cmd")
    sub.add_parser("ensure", help="crea la clave maestra si falta (idempotente)")
    sub.add_parser("path", help="imprime la ruta del fichero de clave (sin valor)")
    args = parser.parse_args()
    if args.cmd == "ensure":
        ensure_master_key()
        print("OK: clave maestra disponible")
        return 0
    if args.cmd == "path":
        print(_default_key_path())
        return 0
    parser.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
