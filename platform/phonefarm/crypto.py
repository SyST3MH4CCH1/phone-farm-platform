"""crypto — cifrado de campos y blobs con AES-256-GCM (paso 4).

Convenciones:
- envelope de campo:      "v1:<iv_b64>:<tag_b64>:<ciphertext_b64>"
- AAD = "<tabla>|<row_id>|<campo>"  (impide reutilizar ciphertext entre campos)
- envelope de backup:     dict {format, kdf, salt, iv, tag, ciphertext} (JSON),
                          clave derivada del master key con HKDF-SHA256.
- NUNCA se loguea contenido cifrado ni claves.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes

# cryptography ya es dependencia de instagrapi, así que no añade nada nuevo.

ENVELOPE_V1 = "v1"
GCM_NONCE_LEN = 12


class CryptoError(Exception):
    pass


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _unb64(s: str) -> bytes:
    return base64.b64decode(s)


# --- campos ---

def encrypt_field(master_key: bytes, table: str, row_id: str, field: str, plaintext: str) -> str:
    """Cifra un campo con AAD = table|row_id|field. Devuelve envelope v1."""
    aesgcm = AESGCM(master_key)
    nonce = os.urandom(GCM_NONCE_LEN)
    aad = f"{table}|{row_id}|{field}".encode("utf-8")
    ct = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), aad)
    return f"{ENVELOPE_V1}:{_b64(nonce)}:{_b64(ct[-16:])}:{_b64(ct[:-16])}"


def decrypt_field(master_key: bytes, table: str, row_id: str, field: str, envelope: str) -> str:
    """Descifra un envelope v1. Falla si el tag no coincide (tamper)."""
    parts = envelope.split(":")
    if len(parts) != 4 or parts[0] != ENVELOPE_V1:
        raise CryptoError("envelope desconocido")
    try:
        nonce = _unb64(parts[1])
        tag = _unb64(parts[2])
        ct = _unb64(parts[3])
    except Exception as exc:
        raise CryptoError("envelope mal formado") from exc
    if len(nonce) != GCM_NONCE_LEN:
        raise CryptoError("nonce inválido")
    aad = f"{table}|{row_id}|{field}".encode("utf-8")
    try:
        plain = AESGCM(master_key).decrypt(nonce, ct + tag, aad)
    except Exception as exc:
        raise CryptoError("descifrado falló (clave, AAD o ciphertext alterado)") from exc
    return plain.decode("utf-8")


# --- objetos (sesiones sociales, backups) ---

def encrypt_json(master_key: bytes, table: str, row_id: str, obj: Any) -> str:
    return encrypt_field(master_key, table, row_id, "json", json.dumps(obj, ensure_ascii=False))


def decrypt_json(master_key: bytes, table: str, row_id: str, envelope: str) -> Any:
    return json.loads(decrypt_field(master_key, table, row_id, "json", envelope))


# --- backup envelope (paso 4: rollback de migración; paso 10: backups) ---

def derive_key(master_key: bytes, salt: bytes, info: str) -> bytes:
    """HKDF-SHA256 sobre la clave maestra: claves hijas por uso."""
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=salt, info=info.encode("utf-8")).derive(master_key)


def encrypt_blob_envelope(master_key: bytes, data: bytes, info: str = "pfbackup-v1") -> dict[str, Any]:
    """Envuelve un blob en el envelope autenticado {format,kdf,salt,iv,tag,ciphertext}.

    Sin datos sensibles en cabeceras: todo el contenido va cifrado.
    """
    salt = os.urandom(16)
    key = derive_key(master_key, salt, info)
    nonce = os.urandom(GCM_NONCE_LEN)
    ct = AESGCM(key).encrypt(nonce, data, b"pfbackup-envelope-v1")
    return {
        "format": ENVELOPE_V1,
        "kdf": "hkdf-sha256",
        "info": info,
        "salt": _b64(salt),
        "iv": _b64(nonce),
        "tag": _b64(ct[-16:]),
        "ciphertext": _b64(ct[:-16]),
    }


def decrypt_blob_envelope(master_key: bytes, envelope: dict[str, Any]) -> bytes:
    try:
        salt = _unb64(envelope["salt"])
        nonce = _unb64(envelope["iv"])
        tag = _unb64(envelope["tag"])
        ct = _unb64(envelope["ciphertext"])
        key = derive_key(master_key, salt, envelope.get("info", "pfbackup-v1"))
    except Exception as exc:
        raise CryptoError("envelope de backup mal formado") from exc
    try:
        return AESGCM(key).decrypt(nonce, ct + tag, b"pfbackup-envelope-v1")
    except Exception as exc:
        raise CryptoError("backup alterado o clave incorrecta") from exc


def constant_time_equal(a: bytes, b: bytes) -> bool:
    return hmac.compare_digest(a, b)
