# Lock de terceros — MoneyPrinterTurbo y taktik-bot (2026-08-13)

Los checkouts de `platform/third_party/` se fijan a commits verificados
(fichero máquina: `platform/third_party.lock`). Un despliegue (Docker,
`deploy.ps1`, `setup-new-machine.ps1`) debe clonar **estos commits** y aplicar
los parches listados. Un cambio de upstream requiere actualizar este
documento + el lock + los parches, nunca silenciosamente.

## MoneyPrinterTurbo

| Campo | Valor |
|---|---|
| Versión declarada | 1.3.3 |
| Commit fijado | `254cd02` |
| Remote | https://github.com/harry0703/MoneyPrinterTurbo.git |
| Parche local | `platform/patches/mpt-verify-token.patch` |
| CVE | CVE-2025-7897 afecta versiones ≤1.2.6 — **no aplica a 1.3.3 declarada**; la falta de auth se cierra con el parche |

El parche `mpt-verify-token.patch` (aplicar con `platform/scripts/apply-mpt-patch.py`):

1. `app/controllers/base.py` — `verify_token` con comparación en **tiempo
   constante** (`hmac.compare_digest`) y **fail-closed**: sin `MPT_API_KEY`
   configurado responde 503 y no sirve nada.
2. `app/controllers/v1/video.py` y `app/controllers/v1/llm.py` — activa
   `new_router(dependencies=[Depends(base.verify_token)])` (estaba comentado).
3. `app/asgi.py` — middleware que autentica `/openapi.json`, `/docs` y
   `/redoc` con `x-api-key`. **Solo `/ping` queda público** (health check).

Claves: `generator.py` envía `x-api-key` (env `MPT_API_KEY`); `gen_mpt_config.py`
inyecta `api_key` en `[app]` del `mpt-config.toml`; el contenedor MPT recibe
solo variables explícitas (nunca `env_file` con todo el `.env`).

## taktik-bot

| Campo | Valor |
|---|---|
| Commit fijado | `c2b7489` |
| Remote | https://github.com/masterFuf/taktik-bot.git |
| Parche local | ninguno |

Fijado en `platform/requirements.txt` (`taktik-bot @ git+...@c2b7489...`).

## Verificación

- `python platform/scripts/apply-mpt-patch.py --check` → "PATCH APLICADO".
- Tras un reclonado: `python platform/scripts/apply-mpt-patch.py`.
- El CI valida el lock frente a los checkouts (paso 14).
