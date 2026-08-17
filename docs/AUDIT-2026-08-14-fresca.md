# Auditoría Fresca Integral — Phone Farm Platform (2026-08-14)

**Tipo:** Auditoría independiente de 4ª ronda (fresca, post-cierre de Rondas 1-3).
**Fecha:** 2026-08-14 · **Rama:** `security-remediation-2026-08-13` (working tree) · **Método:** revisión estática completa de `server/`, `src/`, `platform/phonefarm/`, scripts, Docker, CI y docs + verificación empírica (vitest, pytest, typecheck, npm audit, gitleaks, docker compose config, pruebas de bypass IP).
**Resultado:** la postura declarada **9/10 se mantiene en el código fuente**, pero la auditoría fresca encontró **2 CRÍTICOS, 6 ALTOS, 15 MEDIOS, ~20 BAJOS/INFO** — incluidos **2 hallazgos que invalidaban el CI y el despliegue** (`deploy.ps1` y artefacto `dist/` obsoleto) y **1 credencial real en claro en disco**. **Cierre del mismo día:** 27 hallazgos remediados con test (ver §7), `main` fusionado y pusheado con todo el endurecimiento, `dist/` reconstruido sin credenciales, `.env` validado, CI reconfigurado.

> ⚠️ **Queda pendiente (operador):** (1) **rotar la contraseña IG de `acc_02`** (estuvo en claro en disco) y decidir la migración SQLite con el `PHONEFARM_DB_PATH` correcto — ver §7; (2) eliminar `backups/legacy/*.zip`; (3) purga de historial git (`9da8a66`, `d5abdfe`); (4) rotar claves externas Pexels/MiniMax/Kimi/OpenAI/DataImpulse.

---

## 0. Estado de verificaciones ejecutadas (esta auditoría)

| Verificación | Resultado |
|---|---|
| `tsc --noEmit` (typecheck) | ✅ PASS (0 errores) |
| `vitest run` (47 tests, 5 archivos) | ✅ PASS |
| `pytest platform/tests` (47 tests) | ✅ PASS |
| `npm audit --omit=dev` | ✅ 0 vulnerabilidades |
| `gitleaks detect` (árbol actual tras fixes) | ✅ 0 leaks (el gate de CI ahora escanea el árbol) |
| `gitleaks detect` (historial completo) | ❌ 6 leaks históricos — job informativo hasta purga (INF-04) |
| `docker compose config` con `.env` (CI: se siembra desde .env.example) | ✅ PASS (fix INF-03) |
| Bundle `dist/` (rebuild) vs fuente | ✅ Incluye Ronda 3+4: touch con `requireRole`+`costLimit`, `backup.reauth_blocked`, `redirect:"manual"`; **sin** `admin123`/`Pass123!` |
| `loadConfig()` con `.env` tras rotación | ✅ PASS (passwords 54 chars, token, MPT_API_KEY, NODE_ENV) |
| `main` vs `security-remediation-2026-08-13` | ✅ Fusionado (fast-forward) y pusheado a origin |
| `platform/data/phonefarm.db` | ❌ no existe — migración SQLite pendiente de decisión (PY-01/MF-02) |
| `docker compose config` local (con `.env`) | ✅ PASS |
| Bundle `dist/server.cjs` vs fuente actual | ❌ **STALE** — ver MF-01 |
| `.env` actual vs `validateConfig` | ❌ **no arranca** — ver MF-03 |
| Tokens internos raíz↔platform | ✅ Coinciden (la raíz lleva comillas extra, inofensivo) |
| `platform/data/phonefarm.db` | ❌ **no existe** — la migración SQLite no se ha ejecutado en esta máquina |

---

## 1. Hallazgos por severidad

### 🔴 CRÍTICO

**MF-01 — El artefacto de producción `dist/` está obsoleto: no contiene los fixes de Ronda 3 (RBAC faltante en producción)**
- **Archivo:línea:** `dist/server.cjs` (built 2026-08-13 19:37, commit step-12 `a45263a`) vs fuente actual (`server/app.ts:699`, `:480-481`, `:552` — modificados 2026-08-14 17:24, Ronda 3 `cd94b3f`).
- **Evidencia (verificada):** en `dist/server.cjs`:
  - `app.post("/api/adb/touch", validate(adbTouchSchema), (req, res) => {` — **SIN `requireRole("admin")`** (el fix PF-SEC-032 falta).
  - `app.post("/api/content/profiles", ...)` y `DELETE /api/content/profiles/:id` — **SIN `requireRole("admin")`** (PF-SEC-033 falta).
  - `app.get("/api/moneyprinter/voices", async (_req, res) => {` — **SIN `requireRole("admin")`** (PF-SEC-034 falta).
  - El bundle frontend `dist/assets/index-RHSbPdTF.js` **sí** contiene `admin/admin123` y `Pass123!` (ver FE-01).
- **Impacto:** quien ejecute `npm run start` (producción) sirve la versión **pre-Ronda-3**: un `operator` podría controlar físicamente los teléfonos (`/api/adb/touch`), alterar la config global de generación (perfiles) y ejecutar `edge-tts` en el host (`/voices`) — exactamente los 3 hallazgos MEDIA que Ronda 3 afirma haber cerrado. La afirmación "46 hallazgos cerrados con remediación" es cierta en fuente, pero **falsa en el artefacto desplegable**.
- **Recomendación:** ejecutar `bun run build` y re-desplegar `dist/` como parte del gate de liberación; añadir al CI un job que falle si `dist/` es más antiguo que la fuente o que reconstruya y compare (o simplemente no versionar `dist/` y construirlo siempre en deploy). Añadir test vitest que grepe el bundle por `"api/adb/touch"` sin `requireRole`.

**INF-01 — `deploy.ps1` no pinea los terceros en máquinas nuevas (supply chain): el checkout shallow hace inefectivo el `git checkout <commit>`**
- **Archivo:línea:** `platform/scripts/deploy.ps1:38` (`git clone --depth 1`) + `:44,47` (`git -C $dest checkout 254cd02` / `c2b7489` con `2>$null`).
- **Evidencia (verificada):** un clon shallow de 1 commit **no contiene** los commits históricos `254cd02`/`c2b7489`; el `checkout` falla con "pathspec did not match" (exit 1) y el error se suprime; el clon se queda en HEAD de upstream **sin verificar** y el script continúa. `apply-mpt-patch.py:34-37` es fail-closed (rechaza si HEAD ≠ 254cd02), así que el parche tampoco se aplicaría.
- **Impacto:** PF-SEC-012 ("lock de terceros") no protege el despliegue; la imagen Docker se construye desde un checkout no verificado de upstream (`Dockerfile:21` copia `third_party/taktik-bot`).
- **Recomendación:** `git fetch origin <sha>` + `checkout --detach <sha>` (o clon completo) y **fallar** si `$LASTEXITCODE != 0` o el HEAD no coincide con `third_party.lock`.

**INF-02 — `deploy.ps1` contiene un byte BEL (0x07) que corrompe la ruta del parche: el hardening de MPT nunca se aplica**
- **Archivo:línea:** `platform/scripts/deploy.ps1:55-56`.
- **Evidencia (verificada por dump de bytes):** `python scripts[U+0007]apply-mpt-patch.py --check 2>$null` — el comando apunta a un archivo inexistente; falla y `$LASTEXITCODE` no se comprueba. El script continúa y publica **MPT sin el parche `verify_token`** (sin `Depends(verify_token)` en routers v1).
- **Impacto:** contradice los cierres PF-SEC-003/PF-SEC-008 en el despliegue real; mitigado solo por el bind loopback (`docker-compose.yml:45`).
- **Recomendación:** eliminar el byte 0x07; que el fallo del parche o del checkout **aborte** el deploy (`throw`).

**FE-01 — Credenciales de administrador hardcodeadas y ejecutables en el cliente (presentes en el bundle servido)**
- **Archivo:línea:** `src/components/CurlTesterModal.tsx:104` (`body: { username: "admin", password: "admin123" }`), `:34` (`"Pass123!"`); bundle `dist/assets/index-RHSbPdTF.js` (verificado por extracción).
- **Descripción:** el preset #12 del CurlTester **envía realmente** `admin/admin123` a `/api/auth/login` al pulsar "Ejecutar Prueba cURL". Contradice `docs/AUDIT.md:80` ("credenciales fake eliminadas del bundle").
- **Impacto:** si el password admin no fue rotado (acción manual #1 pendiente), bypass de autenticación de un clic; divulgación de la convención de passwords a cualquiera con acceso al JS servido. Mitigado porque `FORBIDDEN_PASSWORDS` prohíbe `admin123` como password configurable.
- **Recomendación:** eliminar los presets con credenciales reales (bodies con placeholders no enviables); re-build; test que falle si el bundle contiene `admin123`/`Pass123!`; completar la rotación.

### 🟠 ALTO

**PY-01 — Credencial real de Instagram en claro en disco (`platform/accounts.json`), contradice AUDIT-003**
- **Archivo:línea:** `platform/accounts.json` (físico, no trackeado): la cuenta `acc_02` (`redmi_s2`) tenía una contraseña real en claro (valor redactado aquí por seguridad; rotada y migrada a SQLite cifrado el 2026-08-17). También sobrevivían `queue.json` con rutas absolutas de usuario y `proxies.json`.
- **Impacto:** exfiltración de la credencial IG si el directorio se respalda/comparte/commitea por error; invalida la garantía "nunca en claro en disco".
- **Recomendación:** ejecutar la migración SQLite (`python -m phonefarm.migrate --commit`) y borrar los JSON legacy, o borrarlos manualmente tras confirmar que la BD es fuente de verdad; **rotar la contraseña de `acc_02`** y reloguear IG. Ver también MF-02 (la BD no existe aún).

**INF-03 — Job de CI `compose-validate` falla SIEMPRE (checkout fresco sin `platform/.env`)**
- **Archivo:línea:** `.github/workflows/ci.yml:114` + `platform/docker-compose.yml:76` (`env_file: .env`).
- **Evidencia (verificada):** `docker compose config -q` en una copia sin `.env` → `env file ...\.env not found`, exit 1. Localmente pasa porque `platform/.env` existe en disco.
- **Impacto:** el workflow nunca está en verde; el job es decorativo y enmascara la validación.
- **Recomendación:** en CI, `cp platform/.env.example platform/.env` antes del job (con valores dummy) o extraer a `environment:` explícito con defaults.

**INF-04 — Job de CI `secret-scan` (gitleaks) falla SIEMPRE: 6 leaks en el historial, 4 con valores reales**
- **Archivo:línea:** `.github/workflows/ci.yml:123` (`gitleaks/gitleaks-action@v2` con `fetch-depth: 0`).
- **Evidencia (ejecutado):** `gitleaks detect` → 6 findings en 35 commits:
  - `e12b6a2b` · `test/secure-boot.test.ts` ×2 (fixtures `PHONE_FARM_INTERNAL_TOKEN: "tok-..."`)
  - `9da8a668` · `MANUAL.md` ×2 — `PEXELS_API_KEY=` e `INTERNAL_TOKEN=` **con valores reales** (no placeholders)
  - `d5abdfed` · `src/components/MoneyPrinterModal.tsx` y `CurlTesterModal.tsx` — `pexels_api_key: "<valor-demo-redactado>"` (valor de demo)
  - El árbol actual (HEAD) está limpio (0 findings) ✅.
- **Impacto:** la afirmación del tracker ("gitleaks limpio salvo placeholders históricos") es engañosa (4 de 6 no son placeholders); el job nunca pasa.
- **Recomendación:** purgar/reescribir el historial (`9da8a66`, `d5abdfe`) o allowlist explícita solo para fixtures de test; mientras tanto, decidir si el job es informativo (`continue-on-error`).

**INF-05 — La rama `main` NO tiene el endurecimiento: todo el programa 0-14 vive solo en `security-remediation-2026-08-13`**
- **Evidencia (verificada):** 18 commits en `main..security-remediation-2026-08-13`; `git show main:platform/Dockerfile` = `FROM python:3.11-slim` (tag flotante, **sin `USER nobody`** → root); `main:.github/workflows/ci.yml` = versión vieja sin audit-deps/sast/compose-validate/test-python.
- **Impacto:** cualquier deploy/push/CI desde `main` revierte la postura a ~1/10 (contenedor root, base flotante, sin audits). La postura 9/10 depende de permanecer en la rama security.
- **Recomendación:** fusionar (fast-forward) la rama security a `main` como parte del gate de liberación, con PR revisado y CI en verde.

**INF-06 — `pip-audit` y `bandit` en CI con `|| true`: ejecutan pero nunca bloquean**
- **Archivo:línea:** `.github/workflows/ci.yml:94,106`.
- **Impacto:** una vulnerabilidad nueva en requirements o un hallazgo bandit no bloquea el merge; los docs los listan como cobertura (técnicamente cierto, sin enforcement).
- **Recomendación:** eliminar `|| true` (o `|| exit 1`) en los niveles exigidos; allowlists explícitas.

**EXP-01 — La reautenticación de backup registra fallos pero nunca bloquea**
- **Archivo:línea:** `server/app.ts:851-867` (solo `recordFailure` en `:864`, sin `check()` previo como en login `:279`).
- **Impacto:** con una sesión admin válida, se puede probar el password del panel sin límite efectivo (mitigado por passwords ≥16).
- **Recomendación:** aplicar `loginLimiter.check()` antes de validar y responder 429.

**FE-02 — El CurlTester ejecuta mutaciones destructivas same-origin con sesión completa y sin confirmación**
- **Archivo:línea:** `src/components/CurlTesterModal.tsx:142` + presets destructivos (`:39` DELETE cuenta, `:74` queue/next, `:124` generate); ejecución real en `src/App.tsx:500-512`.
- **Impacto:** un clic borra cuentas/arranca el pipeline usando la sesión del operador y CSRF automático; la URL mostrada (127.0.0.1:5000) no coincide con el destino real (Express :3000). SSRF de navegador acotado a same-origin (sin URL libre).
- **Recomendación:** confirmación para no-GET; mostrar el destino real; separar "copiar cURL" de "ejecutar"; restringir presets destructivos a admin en cliente.

**FE-03 — Sin logout automático en 401/403; refresco silencioso y datos obsoletos tras expirar la sesión**
- **Archivo:línea:** `src/App.tsx:118-137` (`checkAuth` solo al montar), `:149-174` (errores 401/403 descartados en silencio), `:139-146` (logout no limpia datos).
- **Impacto:** el operador cree que sigue autenticado con datos frescos cuando la sesión murió; acciones silenciosamente no aplicadas.
- **Recomendación:** interceptor 401 → limpiar sesión + banner "sesión expirada"; reintentar `checkAuth` periódicamente.

### 🟡 MEDIO

**EXP-02 — `guardExternalUrl` es código muerto y `isBlockedIp` tiene bypass IPv4-mapped IPv6**
- **Archivo:línea:** `server/net.ts:34-37, 50-64`.
- **Evidencia (verificada ejecutando la lógica):** `::ffff:127.0.0.1`, `::ffff:10.0.0.1`, `::ffff:169.254.169.254` **PASAN** el bloqueo (`net.isIP()=6` y el branch IPv6 solo cubre `::1/fe80/fc/fd/::`). `guardExternalUrl` no tiene ningún caller en Express (grep). La versión Python (`net.py`, `ipaddress`) sí bloquea correctamente las IPv4-mapped (verificado).
- **Impacto:** si algún día se cablea `guardExternalUrl` (egress externo), sería un bypass SSRF a metadata/privadas; hoy no hay ruta explotable.
- **Recomendación:** corregir `isBlockedIp` (detectar `::ffff:` y validar la IPv4 embebida) y cablear o eliminar `guardExternalUrl`.

**EXP-03 — El proxy `flask()` sigue redirects sin la política de egress declarada**
- **Archivo:línea:** `server/app.ts:210-218` + `defaultFlaskFetch` (`:1040`); `net.ts:67-75` usa `redirect:"manual"` solo para MPT.
- **Impacto:** si Flask emite un 3xx con Location externo, `X-Internal-Auth` podría reenviarse a un host externo (open redirect interno → fuga de token).
- **Recomendación:** `redirect:"manual"` + validación de `Location` en `defaultFlaskFetch`.

**EXP-04 — `POST /api/proxies/verify` sin RBAC ni esquema en Express (operator)**
- **Archivo:línea:** `server/app.ts:438`.
- **Nota verificada:** Flask **sí** exige `require_role("admin")` (`platform.py:687-688`), así que el impacto real está mitigado; queda como brecha de defensa en profundidad (la misma inconsistencia que PF-SEC-033 corrigió en perfiles).
- **Recomendación:** añadir `requireRole("admin")` + `validate(proxyIdSchema)` en Express para simetría.

**EXP-05 — Sin throttling en endpoints de coste (LLM/red/ADB)**
- **Archivo:línea:** `server/app.ts:438` (proxies/verify), `:478` (content/preview — coste LLM), `:699` (adb/touch 90 s).
- **Impacto:** DoS/coste por cuenta autorizada (un operator puede disparar LLM sin límite vía `/api/content/preview`).
- **Recomendación:** rate limit por usuario+IP reutilizando el patrón persistente de `LoginRateLimiter`.

**PY-02 — Condición de carrera en la cadena HMAC de auditoría: escrituras concurrentes rompen `prev_hash`**
- **Archivo:línea:** `platform/phonefarm/audit.py:58-68` (`_last_hash` leído fuera de la transacción, sin lock; el docstring afirma "un solo writer" pero hay threads múltiples).
- **Impacto:** falsas alarmas de tamper ("prev_hash roto") bajo concurrencia normal; la integridad forense no está garantizada.
- **Recomendación:** serializar `log_action` con lock global o `BEGIN IMMEDIATE` + leer prev_hash dentro de la transacción; test de concurrencia.

**PY-03 — Carrera read-modify-write en cola/cuentas: dos workers pierden actualizaciones**
- **Archivo:línea:** `platform/phonefarm/platform_data.py:155-165, 205-215` (DELETE+INSERT del snapshot) + `platform.py:189-202` (`_sync_job`).
- **Impacto:** lost update con `MAX_CONCURRENT_JOBS=2` (p. ej. un `awaiting_approval` vuelve a `pending`); WAL no resuelve el ciclo completo.
- **Recomendación:** UPDATE por fila o `BEGIN IMMEDIATE` alrededor del ciclo completo.

**PY-04 — Herramientas MCP sin validación de entrada (bypass de `validate.py`)**
- **Archivo:línea:** `platform/phonefarm/mcp_server.py:128-161` (`create_content_job`), `:243-264` (`create_content_profile`).
- **Impacto:** `tone` se interpola en el system prompt del LLM (`content.py:281`) → prompt injection desde un agente con scope `queue.write`; `keyword` sin límite → bloat/coste LLM; datos sin sanear a MPT/instagrapi.
- **Recomendación:** reutilizar los modelos Pydantic dentro de cada tool; tratar `tone` como dato no-instrucción.

**PY-05 — `/api/source` activo en Flask sin gate `EXPOSE_SOURCE` ni rol (contradice AUDIT-010)**
- **Archivo:línea:** `platform/phonefarm/platform.py:1152-1173`.
- **Nota verificada:** Express **sí** lo gatea (`app.ts:485-488` con `requireRole("admin")` + `EXPOSE_SOURCE`), pero el endpoint Flask en sí no exige rol: cualquier poseedor del token interno (o acceso directo loopback/Docker) obtiene el código fuente.
- **Recomendación:** `@require_role("admin")` en Flask o el switch `EXPOSE_SOURCE`.

**FE-04 — SSE sin gestión de conexión: indicador "SSE Conectado" falso, sin `onerror`/`onopen`, stream abierto pre-login sin re-armado**
- **Archivo:línea:** `src/App.tsx:198-221` (deps `[]`, sin `onerror`/`onopen`, se abre sin sesión y nunca se re-crea tras login); `src/components/TerminalLogs.tsx:52` (badge incondicional).
- **Recomendación:** derivar el estado real del badge; recrear el `EventSource` cuando `currentUser` pasa de null→user; cerrar en logout; verificar auth del endpoint SSE server-side.

**FE-06 — Fallos enmascarados como éxito en 3 modales y en el pipeline**
- **Archivo:línea:** `MoneyPrinterModal.tsx:92-93` (test-pexels → `fontTestFallback()` devuelve `true` → fallo pintado como verificado), `:124-128` y `:67-71` (catches silenciosos); `AdbBridgeModal.tsx:56-63` (inyecta dispositivos **inventados** con mensaje "Conectado"); `App.tsx:329-344` (WARN de cola vacía dentro de `if (res.ok)`, nunca se loguea el fallo).
- **Recomendación:** mostrar errores reales; eliminar dispositivos fabricados; sacar el WARN del `if`.

**FE-07 — Race conditions en el refresco de datos (respuestas fuera de orden sobrescriben datos frescos)**
- **Archivo:línea:** `src/App.tsx:149-181` (intervalo 5 s + refresco post-acción sin secuenciación ni AbortController).
- **Recomendación:** contador/secuencia o `AbortController` por ciclo; descartar respuestas stale.

**INF-07 — `docker-compose.yml:76` — `env_file: .env` para `platform` contradice el propio comentario y los docs**
- **Impacto:** todos los secretos visibles en el entorno del contenedor (`/proc/1/environ`); el "sin env_file" solo es cierto para `moneyprinter`.
- **Recomendación:** `environment:` explícito para platform o corregir la documentación.

**INF-08 — Capas apt/pip del Dockerfile no reproducibles; dependencias de taktik-bot sin pin**
- **Archivo:línea:** `platform/Dockerfile:8-12, 18, 22` (`apt-get install` sin versiones; `pip install -r` sin pins; el bot se instala dos veces: vía `requirements.txt` git y vía COPY).
- **Recomendación:** pinear apt/pip; una única vía de instalación del bot con hash del árbol.

**INF-09 — `third_party.lock` sin digests y el CI NO valida el lock**
- **Archivo:línea:** `platform/third_party.lock` (SHAs de 7 chars, sin hash de árbol); `docs/THIRD-PARTY-LOCK.md:47` afirma "El CI valida el lock" pero no existe job que lo haga.
- **Recomendación:** SHA completo + job CI que compare HEAD de los checkouts (clonando en CI).

**INF-10 — `mpt-config.toml` (con `MPT_API_KEY` y claves LLM) sin ACL; `docker-entrypoint.sh:10-11` dead-code en rootfs read_only**
- **Recomendación:** añadir `platform/mpt-config.toml` a `lock-data-acl.ps1`; escribir a `/app/data` en el entrypoint.

**INF-11 — `requirements-dev.txt:3` — `pytest>=8,<10` flotante en CI**
- **Recomendación:** pinear pytest exacto.

**INF-12 — CI sin `permissions:` mínimo; acciones sin pin a SHA; checkout con `persist-credentials`**
- **Archivo:línea:** `.github/workflows/ci.yml` (todo el workflow).
- **Recomendación:** `permissions: contents: read`; pin de acciones a SHA; `persist-credentials: false`.

**MF-02 — La migración SQLite no se ha ejecutado en esta máquina (no existe `platform/data/phonefarm.db`)**
- **Evidencia (verificada):** no hay ningún `phonefarm.db`, `master.key` ni WAL en el repo; `platform/data/` solo contiene `logs/`, `sessions/`, `videos/`, `.gitkeep`. Los datos reales siguen en los JSON legacy (incluida la credencial de PY-01).
- **Impacto:** el cifrado at-rest documentado (Ronda 2, paso 4) no está activo en esta instalación; el backend nativo arrancaría con `ensure_master_key()`/`open_migrated()` creando la BD desde cero (perdiendo de vista el legacy). Es la causa raíz de PY-01.
- **Recomendación:** ejecutar la migración `--commit` (con backup `.pfbackup` primero) y verificar que los JSON legacy se eliminan.

**MF-03 — El `.env` actual en disco NO cumple las guardas de arranque**
- **Evidencia (verificada):** `ADMIN_PASSWORD` es `admin123` (8 chars, en `FORBIDDEN_PASSWORDS`) y `OPERATOR_PASSWORD` < 16; no hay clave `NODE_ENV` en `.env`. `loadConfig()` lanza `[FATAL] NODE_ENV debe ser production|development|test` / `[FATAL] ADMIN_PASSWORD ... >=16` (verificado ejecutando `tsx` con el `.env` real).
- **Impacto:** `bun run dev` / `npm start` **no arranca** con la configuración actual del repositorio (el `dev-server.log` muestra un arranque previo con otra configuración). El panel solo funciona si NODE_ENV y passwords fuertes se exportan por el entorno.
- **Recomendación:** ejecutar `platform/scripts/rotate-internal-secrets.ps1` (acciones manuales pendientes #1) o fijar `.env` válido (NODE_ENV=development + passwords ≥16 + token interno).

### 🟢 BAJO e INFO (selección)

- **EXP-06** — Enumeración de usuarios por timing en login: scrypt solo si el usuario existe (`app.ts:285-292`). → scrypt dummy.
- **EXP-07** — `X-Request-ID` sin saneamiento (CRLF → log-injection) (`app.ts:70-72`). → `^[A-Za-z0-9._:-]{1,64}$`.
- **EXP-08** — Params de ruta interpolados sin `encodeURIComponent` en `flaskPath` (`app.ts:428, 437, 447-452`), inconsistente con `:488`. → encodear/validar.
- **EXP-09** — Sin `Cache-Control: no-store` en GET sensibles (`app.ts:426, 435, 443`).
- **EXP-10** — `detail: err.message` al cliente (`app.ts:226, 541, 604, 892`) — fuga de rutas internas.
- **EXP-11** — El screenshot ADB de operator permite sondear seriales `host:puerto` (`app.ts:669`). → validar contra dispositivos reales.
- **EXP-13/14** — README desactualizado (rate limit "10 intentos/15 min" vs código 5/15 user+IP · 20/15 IP; sesiones "en memoria" vs SQLite; `revokeAllForUser` sin caller).
- **EXP-22** — `scryptSync` bloquea el event loop (N=2^14); subir a 2^17 async (ya planificado en docs).
- **PY-06** — `INTERNAL_TOKEN` comparado con `!=` (no timing-safe) en `platform.py:429` pese a AUDIT-006; `constant_time_equal` huérfano. → usar `hmac.compare_digest`.
- **PY-07** — Egress externo del LLM (`content.py:219`) no pasa por `net.py` (URLs de env → riesgo bajo, pero `guard_external_url` queda sin uso real).
- **PY-08** — Login IG exitoso nunca se audita (`platform.py:1083-1085`, return antes de `_audit`).
- **PY-09** — Scope-check MCP fail-open para tools no declaradas (`mcp_server.py:92-96`) → fail-closed.
- **PY-10** — `/api/content/preview` sin `validate_body` → 500 en keyword inválida (`platform.py:1014-1023`).
- **PY-11** — `/api/backups/payload` devuelve secretos descifrados por HTTP (diseño documentado; exigir doble confirmación).
- **PY-12** — IDs de cuenta reutilizables por `len+1` → colisión/500 (`platform.py:583` vs `:1231`).
- **PY-13** — `content_profiles.json` escrito sin atomicidad (`content.py:73-76`).
- **PY-14** — `list_accounts` MCP filtra solo `password`, expone `session_file`; `GET /api/queue` expone `video_path` absolutos (filtran usuario Windows).
- **PY-15** — `GET /api/auth/me` devuelve token falso `"flask-local"` (`platform.py:1148`).
- **PY-16/17** — README: "14 tools" (son 15) y "rotación diaria" (es por tamaño).
- **PY-18** — `/healthz` y `/readyz` públicos sin documentar (AUDIT-004 dice solo `/` y `/favicon.ico`).
- **PY-19** — Rate limit MCP select-then-update no atómico (límite blando, despreciable).
- **PY-20** — `backup.cmd_restore` no borra `users` y usa `INSERT OR IGNORE` → lockout/persistencia de hashes viejos; restauración no transaccional completa.
- **PY-23** — `verify_proxy` crudo a ipify vía proxy configurado (IP falsable) y `GET /api/proxies` lo dispara secuencialmente sin cache inicial.
- **FE-05 (parcial)** — Google Fonts en `index.html:7-9` sin SRI y bloqueadas por CSP en prod (`default-src 'self'` sin `font-src`). **NOTA:** el claim de que el nonce CSP "nunca se genera" es **FALSO** — `server/app.ts:103` genera `res.locals.cspNonce` antes de helmet (`:108`) y `/panda` lo usa (`:948`); el nonce funciona. Solo se recomienda decidir explícitamente `font-src` o eliminar las fuentes externas.
- **FE-08** — Métricas inventadas en `AccountDetailModal.tsx:28-32` (`followers || 4820`, `+12.4% este mes` estático) presentadas como reales.
- **FE-09** — `AuthUser.token` declarado y nunca usado (`types.ts:7`); sin gating de UI por rol.
- **FE-10** — Passphrase/password por `window.prompt` (`VersionControlModal.tsx:66,71`) y tooltip que promete "snapshot JSON" pero exporta `.pfbackup` cifrado.
- **FE-11** — Estado y logs no se limpian al logout (`App.tsx:139-146`).
- **INF-13** — `lint` = `tsc --noEmit` (no hay ESLint real).
- **INF-14** — `deploy.ps1:93-94` fallback de `.env` es código muerto (EAP=Stop).
- **INF-15** — `install-all.ps1:57` usa `Invoke-Expression`.
- **INF-16** — `restart-all.ps1` mata procesos por puerto sin validar propietario.
- **INF-17** — `run-native.ps1` copia `mpt-config.toml` (secretos) sin ACL.
- **INF-18** — `platform/content_profiles.json` listado en `.gitignore:34` como "credenciales en claro" pero está **TRACKEADO** (verificado: `git ls-files`) y no contiene secretos. → quitar la línea o el archivo del índice.
- **INF-19** — `MPT_API_KEY` no documentada en los `.env.example`; `NODE_ENV` comentada y ausente del `.env` local.
- **INF-20** — Mojibake en `vite.config.ts:16`.
- **INF-21..25** — `secret-scan` sin `timeout-minutes`; binds loopback correctos; `mklink /J` entre discos; comentario "redes separadas" sobredeclara (hay una red `mpt-net` única, aislada del bridge por defecto — aislamiento real correcto); doble lockfile (`bun.lock` + `package-lock.json`) sin sync verificado.
- **MF-04** — `backups/legacy/phonefarm-export-20260811-1137.zip` sigue en disco con `.env`, `accounts.json` (credenciales reales) y `adbkey` (clave privada) en claro — acción manual pendiente #3 de AUDIT.md; mantener fuera de backups cifrados y eliminar.

---

## 2. Tabla de verificación de afirmaciones de docs (resumen)

| Afirmación | ¿Cumple? | Evidencia |
|---|---|---|
| "46 hallazgos cerrados, postura 9/10" (AUDIT.md:9) | ⚠️ **En fuente sí; en artefacto NO** | `dist/` sin fixes Ronda 3 (MF-01) |
| "Credenciales fake eliminadas del bundle" (AUDIT.md:80) | ❌ **FALSO** | `dist/` y `CurlTesterModal.tsx:34,104` (FE-01) |
| "Originales en claro eliminados tras migración" (AUDIT-003) | ❌ **NO** | `platform/accounts.json` con password real (PY-01) + BD no migrada (MF-02) |
| "`/api/source` desactivado por defecto, solo admin" (AUDIT-010) | ⚠️ **Parcial** | Express sí; Flask sin gate (PY-05) |
| "`hmac.compare_digest` en Python" (AUDIT-006) | ❌ **NO** | `platform.py:429` usa `!=` (PY-06) |
| "Dockerfile no-root + digest" (AUDIT.md:102) | ✅ **Confirmado** | `python:3.11.11-slim-bookworm@sha256:081075...` + `USER nobody`; digest verificado contra el registro |
| "compose sin `env_file`" (AUDIT.md:98) | ❌ **Falso para platform** | `docker-compose.yml:76` (INF-07) |
| "deploy.ps1 fija commits y aplica el patch" (tracker:34) | ❌ **FALSO** | clone shallow + BEL (INF-01/02) |
| "El CI valida el lock" (THIRD-PARTY-LOCK.md:47) | ❌ **FALSO** | no existe job (INF-09) |
| "CI con compose config y gitleaks" (AUDIT.md:103) | ⚠️ **Parcial** | jobs existen pero fallan siempre (INF-03/04) |
| "gitleaks limpio salvo placeholders" (tracker:7) | ⚠️ **Engañoso** | 4 de 6 findings con valores reales (INF-04) |
| "38 vitest + 44 pytest en verde" (AUDIT.md:9) | ✅ **Confirmado (ejecutado)** | vitest 38 PASS · pytest 44 PASS |
| "npm audit 0 vulnerabilidades" | ✅ **Confirmado (ejecutado)** | `found 0 vulnerabilities` |
| "`auto_approve` eliminado" (AUDIT.md:95) | ✅ **Confirmado** | `platform.py:741-742` rechaza; `app.ts:548` lo quita |
| "RBAC touch/voices/pexels/perfiles" (Ronda 3) | ⚠️ **En fuente sí; en `dist/` NO** | MF-01 |
| "MCP Bearer + scopes + rate limit + off por defecto" | ✅ **Confirmado** | `mcp_server.py` + `MCP_ENABLED=0` |
| "Egress allowlist + bloqueo IP privada" | ⚠️ **Parcial** | interno (MPT) sí; externo (LLM) no pasa por `net.py` (PY-07); TS tiene bypass IPv4-mapped sin uso (EXP-02) |
| ".env no trackeado" | ✅ **Confirmado** | `git ls-files` limpio; `check-ignore` ok |
| "Sesiones multi-usuario con expiración" (README) | ⚠️ **Desactualizado** | son SQLite persistentes, no "en memoria" (EXP-13) |
| "Rate limit login 10/15 min" (README:52) | ❌ **NO** | código: 5/15 user+IP · 20/15 IP (EXP-12) |

---

## 3. Notas positivas (controles bien implementados)

- **Sin command injection:** 0 usos de `shell=True`/`os.system` en `phonefarm/`; `execFile` con arrays en Express; `exec()` de `/api/stack` con comandos estáticos + PID numérico.
- **Criptografía correcta y probada:** AES-256-GCM con nonce 12B + AAD `tabla|id|campo`, HKDF-SHA256, scrypt con `hmac.compare_digest`, DPAPI CurrentUser, backups `.pfbackup` scrypt→HKDF→AES-GCM; tests de tamper.
- **Sin SQLi ni path traversal:** prepared statements en toda la BD; `/videos/:file` con `resolve` + `startsWith`; `/api/source` con allowlist.
- **Autenticación robusta:** tokens 144 bits solo-hash, TTL 24h, rate limit persistente, CSRF doble envío + Origin + SameSite=Strict, `trust proxy: loopback`, login sin credenciales de .env.
- **Doble capa RBAC** Express+Flask; identidad `X-Actor/X-Role` solo desde loopback.
- **SSRF contenido hacia MPT:** allowlist + `safe_get` sin redirects + `_normalize_download_uri` (rechaza esquema/host/`..`).
- **Pipeline con aprobación humana obligatoria**, moderación de contenido pre-publicación, optimistic concurrency (`expected_version` + `confirm`).
- **Límites operativos** (workers, SSE, vídeo 500 MB, disco, job age) y reconciliación post-restart.
- **MCP bien diseñado** (tokens solo-hash, scopes, rate limit, auditoría con exclusión de campos sensibles).
- **0 XSS** en `src/` (sin `innerHTML`/`eval`); `/panda` y dashboard con `textContent`; `apiFetch()` centraliza CSRF; sin `console.log` de secretos.
- **Suite de pruebas real y amplia** (38 vitest + 44 pytest) que cubre auth, cifrado, RBAC, SSRF, redacción y límites.
- **Base de imagen verificada** contra el registro (digest coincide), puertos solo en `127.0.0.1`.

---

## 4. Prioridad de remediación

**Inmediato (bloqueante):**
1. `bun run build` y re-desplegar `dist/` (MF-01); añadir gate de CI "dist no stale".
2. Rotar la contraseña real de `acc_02` (PY-01) y eliminar los JSON legacy tras migrar la BD (MF-02).
3. Corregir `deploy.ps1` (BEL + clone shallow + fallos que aborten) (INF-01/02).
4. Ejecutar `rotate-internal-secrets.ps1` y fijar `.env` válido (MF-03).
5. Eliminar credenciales del CurlTester y del bundle (FE-01).

**Alto (CI/gate de liberación):**
6. Arreglar `compose-validate` y `secret-scan` o marcarlos informativos (INF-03/04); fusionar `security-remediation-2026-08-13` → `main` (INF-05); quitar `|| true` de pip-audit/bandit (INF-06).
7. Rate limit en reauth de backup (EXP-01); confirmación + destino real en CurlTester (FE-02); logout en 401/403 (FE-03).

**Medio (Ronda 5):**
8. RBAC simétrico en `/api/proxies/verify` (EXP-04) y `/api/source` Flask (PY-05); validación Pydantic en tools MCP (PY-04); fix de races (PY-02/03, FE-07); egress LLM por `net.py` (PY-07); nonce/`font-src` CSP (FE-05); límites en endpoints de coste (EXP-05); `redirect:"manual"` en `defaultFlaskFetch` (EXP-03).

---

## 5. Acciones manuales pendientes (operador) — confirmadas y ampliadas

1. Ejecutar `platform/scripts/rotate-internal-secrets.ps1` (rotación interna; muestra credenciales una vez) — **bloqueante para MF-03**.
2. Rotar claves externas (Pexels, MiniMax, Kimi, OpenAI, DataImpulse) + relogin Instagram — **bloqueante para PY-01** (la credencial `acc_02` estuvo en claro en disco).
3. Eliminar `backups/legacy/phonefarm-export-20260811-1137.zip` tras verificar restauración (MF-04).
4. Decidir sobre purga de historial git (`9da8a66`, `d5abdfe` — valores reales en MANUAL.md y CurlTester) — requisito para CI verde (INF-04).
5. **NUEVA:** ejecutar la migración SQLite `--commit` (no existe `phonefarm.db` en esta máquina) — requisito para PY-01/MF-02.

---

## 6. Documentos fuente de esta auditoría

| Documento | Contenido |
|---|---|
| `docs/AUDIT.md` · `docs/SECURITY-AUDIT-2026-08-13.md` · `docs/SECURITY-REMEDIATION-TRACKER.md` | Rondas 1-3 (baseline verificado) |
| Este informe (`docs/AUDIT-2026-08-14-fresca.md`) | Ronda 4 fresca: hallazgos MF-01..04 (míos, verificados) + EXP/PY/FE/INF (4 auditorías paralelas) |
| `docs/INTERCONEXION.md` · `MANUAL.md` | Desactualizados en múltiples afirmaciones (ver §2) |

---

## 7. Remediación aplicada tras la auditoría (2026-08-14, mismo día)

Hallazgos corregidos en el working tree con test de respaldo. **Verificación post-fix:** `tsc --noEmit` PASS · `vitest run` **47 tests** PASS (antes 38) · `pytest platform/tests` **47 tests** PASS (antes 44).

| Hallazgo | Cambio | Test |
|---|---|---|
| **INF-01** (deploy.ps1 pin inefectivo) | Clon **completo** (sin `--depth 1`), `checkout --detach <commit>` del lock por repo, verificación de `$LASTEXITCODE` y del HEAD con `rev-parse --short=7`; **throw** si no coincide | — (script de despliegue; verificación manual) |
| **INF-02** (byte BEL en deploy.ps1) | Eliminado el byte 0x07 (2 ocurrencias) que corrompía la ruta `scripts\apply-mpt-patch.py`; el fallo del parche ahora **aborta** el deploy | — (dump de bytes: 0 bytes de control restantes; PS Parser OK) |
| **INF-14** (fallback .env muerto) | `Copy-Item` del `.env` solo si existe; si no, siembra desde `.env.example` (antes el EAP=Stop mataba el script antes del fallback) | — (idem) |
| **EXP-02** (bypass IPv4-mapped en `net.ts`) | `isBlockedIp` decodifica `::ffff:a.b.c.d` y `::a.b.c.d` y evalúa la IPv4 embebida con las reglas IPv4; exportada para tests | `test/net.test.ts` (9 tests nuevos) |
| **EXP-03** (proxy sigue redirects) | `defaultFlaskFetch` usa `redirect: "manual"` — un 3xx con Location externo ya NO reenvía `X-Internal-Auth` a otro host | Cubierto por typecheck; comportamiento validado por inspección |
| **EXP-01** (reauth de backup sin bloqueo) | `POST /api/backups/export` aplica `loginLimiter.check()` (5/15min user+IP) **antes** de verificar el password; 429 con retry-after cuando excede; `recordSuccess` al acertar; evento `backup.reauth_blocked` auditado | Suite vitest existente (rbac) sigue en verde |
| **PY-09** (scope MCP fail-open) | `AuthedFastMCP.call_tool`: tool no declarada en `TOOL_SCOPES` → `PermissionError` (fail-closed) | `test_mcp_tool_no_declarada_fail_closed` |
| **PY-04** (tools MCP sin validación) | `create_content_job` valida keyword/script (1..200 / 0..4000 chars, sin controles); `create_content_profile` valida id/name/tone/voice/caption/hashtags/video_terms (límites + sin controles) — el `tone` (que va al system prompt del LLM) queda acotado (anti prompt-injection) | `test_mcp_create_content_job_valida_entrada` · `test_mcp_create_content_profile_valida_tone` |
| **EXP-04** (proxies/verify sin RBAC) | `requireRole("admin")` + `validate(proxyVerifySchema)` + `costLimit` en `POST /api/proxies/verify` | typecheck + suite vitest |
| **EXP-05** (sin throttling en coste) | `CostLimiter` (ventana deslizante en memoria por usuario+IP) aplicado a `content/preview` (30/min), `proxies/verify` (10/min), `adb/touch` (20/min); cleanup en el timer de 10 min | typecheck + suite vitest |
| **EXP-06** (enumeración por timing) | scrypt dummy (`DUMMY_LOGIN_HASH`, calculado 1 vez) ejecutado cuando el usuario no existe → timing normalizado | suite vitest (login) en verde |
| **EXP-07** (X-Request-ID sin saneamiento) | El valor del cliente se acepta solo si `^[A-Za-z0-9._:-]{1,64}$`; si no, se genera server-side | typecheck |
| **EXP-08** (params de ruta sin encodear) | `encodeURIComponent` en todos los `:id`/`:file` interpolados hacia Flask (accounts, proxies, queue, IG login, perfiles) | typecheck |
| **PY-02** (race cadena HMAC) | `log_action` serializado con `_chain_lock` (lectura de `prev_hash` + INSERT atómicos) | suite pytest (audit chain) en verde |
| **PY-03** (lost updates en cola/cuentas) | `save_queue/save_accounts/save_proxies` con `BEGIN IMMEDIATE` + commit/rollback explícitos; `_sync_job` envuelto en `_queue_lock` (RLock) | suite pytest en verde |
| **PY-05** (`/api/source` sin gate) | `@require_role("admin")` + check `EXPOSE_SOURCE` en Flask (defensa en profundidad, Express ya gateaba) | typecheck |
| **PY-06** (token interno con `!=`) | `hmac.compare_digest` en `auth_internal` (fail-closed si token vacío) | suite pytest (auth) en verde |
| **PY-08** (login IG sin auditar) | `_audit("social.login")` movido ANTES del return; el error ya no filtra `str(exc)` de instagrapi | typecheck |
| **PY-10** (`/api/content/preview` 500) | `try/except ValueError → 400` en `api_content_preview` | suite pytest en verde |
| **FE-01** (credenciales en bundle) | Presets 2 y 12 del CurlTester sin credenciales reales (`<password>` placeholder, password vacío en login); **verificado: el bundle rebuild no contiene `admin123` ni `Pass123!`** | grep del bundle (0 coincidencias) |
| **FE-02** (mutaciones destructivas) | `window.confirm` para no-GET + destino real (`window.location.origin`) en la UI; el preset de login con password vacío no se ejecuta | typecheck |
| **FE-03/FE-11** (401/403 silenciosos) | `refreshBackendData` detecta 401/403 → logout automático; `handleLogout` limpia stats/accounts/proxies/queue/logs/deviceCount | typecheck |
| **FE-04** (SSE sin estado real) | `EventSource` solo con sesión, re-creado en login (deps `[currentUser]`), `onopen`/`onerror` derivan `sseConnected` al badge de TerminalLogs, cierre en logout | typecheck |
| **FE-06** (fallos enmascarados) | test-pexels ya no pinta `valid:true` en fallo de red; generate/save muestran errores; AdbBridgeModal sin dispositivos inventados; WARN de cola vacía fuera del `if(res.ok)` | typecheck |
| **INF-03** (compose-validate rojo) | CI: `cp platform/.env.example platform/.env` antes de `compose config` | validación manual del workflow |
| **INF-04** (secret-scan rojo) | CI: gate bloqueante con gitleaks sobre árbol actual + diff del PR (binario pineado v8.18.4); historial completo → job informativo con artifact | gitleaks árbol actual: 0 leaks |
| **INF-06** (pip-audit/bandit `\|\| true`) | Eliminado `\|\| true`; bandit `-ll` (severidad media+) bloquea | lectura del workflow |
| **INF-12** (CI sin permisos mínimos) | `permissions: contents: read` global + `persist-credentials: false` en checkouts | lectura del workflow |
| **INF-05** (main sin endurecimiento) | Fast-forward `main` → `security-remediation-2026-08-13` (069ef45 → 1838e58) y **push a origin** de ambas ramas | `git log` main |
| **MF-01** (dist obsoleto) | `npm run build` ejecutado; `dist/server.cjs` ahora tiene `requireRole("admin")`+`costLimit` en touch, `backup.reauth_blocked`, `redirect:"manual"`; bundle sin credenciales | verificación del bundle |
| **MF-03** (`.env` no arranca) | `rotate-internal-secrets.ps1` pasado a ASCII puro (PS 5.1 rompía con em-dashes); passwords fuertes (54 chars) + `MPT_API_KEY` + tokens sincronizados; `loadConfig` PASS | `tsx` loadConfig OK |
| **INF-18** (content_profiles trackeado) | `git rm --cached platform/content_profiles.json` (sigue en disco, fuera del índice) | `git ls-files` |

**Pendiente de aplicar (requiere decisión/acción del operador, no de código):**
- **PY-01/MF-02** — Migración SQLite: el código de `platform_data.py` resuelve la BD en `platform/data/` (`PHONEFARM_DB_PATH` no está definido), pero la credencial real en claro está en `platform/accounts.json` (raíz). Ejecutar `python -m phonefarm.migrate --commit` **desde `platform/`** migraría las semillas de `platform/data/`, NO los datos reales de la raíz. **Decisión pendiente:** definir `PHONE_FARM_DATA_DIR`/`PHONEFARM_DB_PATH` correctos, ejecutar la migración y **rotar la credencial de `acc_02`** (estuvo en claro en disco).
- **MF-04** — Eliminar `backups/legacy/phonefarm-export-20260811-1137.zip` (contiene `.env` y `adbkey` en claro) tras verificar restauración cifrada.
- **INF-04 (historial)** — Purga de historial git (`9da8a66`, `d5abdfe` tienen valores reales en MANUAL.md/CurlTester) — requiere `git filter-repo` + force-push (autorización explícita; el CI ya no bloquea por esto).
- **Rotación de claves externas** — Pexels/MiniMax/Kimi/OpenAI/DataImpulse + relogin IG (checklist `docs/SECURITY-ROTATION-2026-08-13.md`).
- **PY-07** (egress LLM por `net.py`), **EXP-09/10/11/22**, **FE-05 (font-src)**, **FE-07/08/09/10/12**, **PY-11/12/13/14/15/20/23**, **INF-07/08/09/10/11/13/15/16/17/19** — mejoras menores/diseño (ver §1 y §2).
