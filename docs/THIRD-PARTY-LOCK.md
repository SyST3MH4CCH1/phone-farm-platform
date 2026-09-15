# Lock de terceros — MoneyPrinterTurbo y taktik-bot

**Proposito:** fijar los checkouts de `platform/third_party/` a commits concretos,
verificables en CI. Sin pin, el parche CVE-2025-7897 podria no aplicar
o aplicar a una version incorrecta. Este documento es la fuente de verdad;
`platform/third_party.lock` es la version machine-readable.

---

## Componentes fijados

| Componente | Repo | Pinned SHA | Verificar |
|---|---|---|---|
| MoneyPrinterTurbo | https://github.com/harry0703/MoneyPrinterTurbo.git | `254cd028906ee657eab844dc94087cdbea2a7aa8` (short: `254cd02`) | `git -C platform/third_party/MoneyPrinterTurbo rev-parse HEAD` |
| taktik-bot | https://github.com/masterFuf/taktik-bot.git | `c2b748967622c26cc478aa48ebbd2493ab2d1086` (short: `c2b7489`) | `git -C platform/third_party/taktik-bot rev-parse HEAD` |

**Patch CVE-2025-7897:** `platform/patches/mpt-verify-token.patch`
- Aplica con: `python platform/scripts/apply-mpt-patch.py`
- Verifica con: `python platform/scripts/apply-mpt-patch.py --check` → `PATCH APLICADO`

El parche activa `verify_token` con `hmac.compare_digest` (tiempo constante) en
todos los routers v1 de MPT, fail-closed sin `MPT_API_KEY`, y protege
`/openapi.json`/`/docs`/`/redoc` con `x-api-key`. Solo `/ping` queda publico.

**Omision intencional en pip-audit:** taktik-bot no es paquete PyPI; su unico
ancla de supply-chain es el commit SHA en `platform/requirements.txt`.

---

## Verificacion en CI

```bash
# Verificar lock file existe y tiene formato correcto
python -c "
import re, sys
lock = open('platform/third_party.lock').read()
expected = {'MoneyPrinterTurbo': '254cd02', 'taktik-bot': 'c2b7489'}
for comp, sha in expected.items():
    if not re.search(rf'^{comp}.*commit\s*=\s*[\"\']?{sha}', lock, re.M):
        print(f'LOCK MISMATCH: {comp} sha {sha} not found in platform/third_party.lock')
        sys.exit(1)
print('LOCK OK')
"
```

```bash
# Verificar SHA en disco (si third_party ya esta clonado)
for dir in platform/third_party/MoneyPrinterTurbo platform/third_party/taktik-bot; do
  if [ -d "$dir" ]; then
    sha=$(git -C "$dir" rev-parse HEAD)
    echo "$dir: $sha"
  fi
done
```

---

## Mismatch runbook

Si la verificacion falla:

1. `git fetch origin` en el checkout afectado
2. `git checkout <sha-pinned>` para volver al commit фиjado
3. Si el checkout no existe: `git clone <repo> platform/third_party/<name> --branch <tag> --depth 1` (usar tag si existe, si no el commit фиjado)
4. `python platform/scripts/apply-mpt-patch.py` para reaplicar parche MPT
5. Verificar con `python platform/scripts/apply-mpt-patch.py --check`

---

## Formato platform/third_party.lock

```ini
[MoneyPrinterTurbo]
version = "1.3.3"
commit = "254cd02"
remote = "https://github.com/harry0703/MoneyPrinterTurbo.git"
patch = "patches/mpt-verify-token.patch"

[taktik-bot]
version = "1.0.0"
commit = "c2b7489"
remote = "https://github.com/masterFuf/taktik-bot.git"
patch = ""
```
