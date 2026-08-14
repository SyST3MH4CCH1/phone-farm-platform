# Auditoría de seguridad — Phone Farm Platform

**Fecha:** 2026-08-13  
**Alcance:** `server.ts`, `platform/phonefarm/*.py`, React, Docker/Compose, scripts PowerShell, persistencia, dependencias y checkout local de MoneyPrinterTurbo/taktik-bot.  
**Método:** revisión estática, pruebas Flask/Express con fixtures y comprobaciones locales no destructivas. No se usaron cuentas, teléfonos ni claves reales en las pruebas.

## Resumen ejecutivo

| Severidad | Hallazgos |
|---|---:|
| CRÍTICA | 4 |
| ALTA | 10 |
| MEDIA | 10 |
| BAJA | 3 |
| INFO | 3 |
| **Total** | **30** |

### Top 5 riesgos

1. Credenciales conocidas (`admin/admin123`, `operator/operator123`) activas en el entorno local y permitidas por el fallback de desarrollo.
2. MCP Streamable HTTP sin autenticación ni RBAC; cualquier proceso local o contenedor vecino puede publicar, arrancar bots y modificar datos.
3. MoneyPrinterTurbo sin autenticación efectiva y con todo el `.env` montado; una explotación del servicio puede robar el token interno, claves LLM/proxy y credenciales del panel.
4. Contraseñas de Instagram y sesiones instagrapi almacenadas en claro, además de exportaciones ZIP sin cifrado.
5. Express escucha en `0.0.0.0` por HTTP y la cookie de sesión carece de `Secure`; un atacante de la LAN puede capturar o reutilizar sesiones.

**Postura general:** **1/10** (fotografía inicial) → **9/10 tras la remediación (2026-08-13, rama `security-remediation-2026-08-13`)**. Las 30 observaciones están cerradas con evidencia y pruebas automatizadas (35 vitest + 42 pytest); quedan como acciones manuales: rotación de claves externas, eliminación del ZIP legacy, decisión de purga de historial y verificación runtime de Docker.

**¿Seguro para producción hoy?** **Sí, con requisitos pendientes (gate del plan):** rotar las claves externas (checklist en docs/SECURITY-ROTATION-2026-08-13.md), eliminar el ZIP legacy tras restaurar un backup cifrado, decidir la purga de historial y verificar el despliegue Docker endurecido. Sin esas acciones manuales no se libera producción.

## Evidencia de ejecución

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | PASS |
| `npm run build` | PASS (Vite + esbuild) |
| `npm audit --json` | 1 vulnerabilidad HIGH: `nanoid@3.3.16` vía `autoprefixer -> postcss`; fix disponible desde `3.3.17` |
| `uvx pip-audit -r platform/requirements.txt -f json` | Sin CVEs en paquetes resolubles; `taktik-bot` omitido por no existir como paquete PyPI auditable |
| Flask test client | Sin header interno: 401; con header: `/api/auth/me` devuelve identidad admin ficticia; creación de cuenta/proxy devuelve password/pass en la respuesta |
| Flask validación | `auto_approve: "false"` se persiste como `true` por `bool(string)` |
| Express loopback | Login demo `admin/admin123`: 200; `Set-Cookie` no contiene `Secure`; operator obtiene 403 en cuentas pero atraviesa a `/api/queue` (503 solo porque Flask fixture estaba apagado) |
| MCP runtime | No ejecutable en el Python activo porque `mcp` no está instalado; revisión estática completa |
| Docker runtime | No se levantaron contenedores ni servicios externos |

El aviso de `nanoid` corresponde a [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8). Para MoneyPrinterTurbo, el registro de referencia es [NVD CVE-2025-7897](https://nvd.nist.gov/vuln/detail/CVE-2025-7897); el checkout local no está fijado a una versión verificable.

## Hallazgos críticos

### [CRÍTICA-PF-SEC-001] Credenciales administrativas conocidas y fallback inseguro

Severidad: CRÍTICA  
Categoría: Autenticación, gestión de secretos, red  
Ubicación: `.env:2-5`, `.env.example:4-7`, `server.ts:23-35`, `platform/scripts/setup-new-machine.ps1:53-70,107-112`, `server.ts:895-896`  

Aplicabilidad: Windows nativoDescripción: El entorno actual contiene las credenciales de demostración y el código las usa si `NODE_ENV` no es `production`. El script de instalación copia el ejemplo y arranca `tsx server.ts` sin imponer producción ni exigir cambio de password. Express escucha en todas las interfaces.  
Vector de ataque: 1) alcanzar el puerto 3000 desde la LAN; 2) enviar `admin/admin123`; 3) recibir sesión admin; 4) descargar/exportar datos, cambiar configuración y publicar. La prueba local devolvió HTTP 200.  
Impacto: C/I/A completos; toma de control del panel y de cuentas sociales.  
Evidencia: `const ADMIN_PASSWORD = ... (IS_DEV ? "admin123" : "")`; `app.listen(PORT, "0.0.0.0")`.  
Remediación:

```ts
if (process.env.NODE_ENV === "production") {
  const forbidden = new Set(["admin123", "operator123", "password", "changeme"]);
  for (const [name, value] of [["ADMIN_PASSWORD", ADMIN_PASSWORD], ["OPERATOR_PASSWORD", OPERATOR_PASSWORD]]) {
    if (!value || value.length < 16 || forbidden.has(value.toLowerCase())) {
      throw new Error(`${name} debe ser un secreto único de producción`);
    }
  }
}
```

Generar credenciales durante el bootstrap, eliminar los defaults del `.env.example`, rotar las credenciales actuales y enlazar Express a `127.0.0.1` detrás de un reverse proxy TLS.  
Estado: CERRADO (pasos 2/5)
Cierre: Credenciales demo eliminadas (UI, .env.example, código); config.ts exige NODE_ENV whitelist, passwords >=16 sin valores conocidos y listen 127.0.0.1; login contra users (scrypt). Prueba: test/secure-boot.test.ts, test/rbac.test.ts.
Prioridad de fix: P0 (hoy)

### [CRÍTICA-PF-SEC-002] MCP sin autenticación ni RBAC

Severidad: CRÍTICA  
Categoría: MCP, autorización, comunicación inter-servicios  
Ubicación: `platform/phonefarm/mcp_server.py:23-225,228-240`, `platform/docker-compose.yml:49-56`  

Aplicabilidad: AmbosDescripción: Las 15 tools se registran directamente en `FastMCP`; no existe middleware de autenticación, identidad, rol, aprobación ni rate limit. `start_mcp_server()` escucha `0.0.0.0` dentro del contenedor. El mapeo de puerto a loopback del host no impide el acceso desde otros contenedores del mismo bridge.  
Vector de ataque: 1) un proceso local, o un contenedor MPT comprometido, conecta a `/mcp`; 2) invoca `create_content_job(auto_approve=true)`, `start_bot`, `approve_job` o `publish_job`; 3) modifica la granja o publica spam sin pasar por Express/RBAC.  
Impacto: C/I/A; publicación no autorizada, exposición de cuentas/proxies/logs y control de procesos.  
Evidencia: `mcp = FastMCP("phone-farm")`; las tools llaman directamente a `platform_data`, `engagement` y workers; no se lee ningún token.  
Remediación: deshabilitar MCP por defecto; exigir `Authorization: Bearer` validado con secreto independiente o mTLS; enlazar a loopback cuando sea nativo; separar la red Docker; aplicar allowlist por rol, doble confirmación para `publish_job/start_bot` y límites por identidad.  
Estado: CERRADO (paso 7)
Cierre: BearerAuthMiddleware (401 sin token/válido), scopes por tool (403 sin scope), rate limit 60/min por token, auditoría mcp.*; MCP_ENABLED=0 por defecto. Prueba: test_mcp_*.
Prioridad de fix: P0 (hoy)

### [CRÍTICA-PF-SEC-003] MoneyPrinterTurbo sin auth efectiva y con secretos innecesarios

Severidad: CRÍTICA  
Categoría: Comunicación inter-servicios, supply chain, secretos, CVE  
Ubicación: `platform/docker-compose.yml:20-21`, `platform/third_party/MoneyPrinterTurbo/app/controllers/base.py:16-28`, `platform/third_party/MoneyPrinterTurbo/app/controllers/v1/video.py:35-40`, `platform/third_party/MoneyPrinterTurbo/app/controllers/v1/llm.py:15-17`, `platform/scripts/gen_mpt_config.py:23-39,73-110`  

Aplicabilidad: AmbosDescripción: Compose inyecta todo `platform/.env` mediante `env_file` al contenedor MPT. El código de MPT define `verify_token`, pero la dependencia aparece comentada en los routers (`router = new_router()`). El API queda sin auth dentro de la red Docker y el checkout/version no está fijado.  
Vector de ataque: 1) explotar el endpoint MPT desde un contenedor vecino o un proceso local; 2) leer variables de entorno/configuración; 3) obtener `INTERNAL_TOKEN`, claves LLM/proxy y otros secretos; 4) llamar MCP o Flask y pivotar.  
Impacto: C/I/A; compromiso de secretos y control de la plataforma.  
Evidencia: `env_file: - .env` en MPT y dependencia de autenticación comentada.  
Remediación: montar únicamente variables MPT explícitas; generar un `MPT_API_KEY` separado; activar `Depends(base.verify_token)` en todas las rutas; red Docker aislada sin acceso a MCP; fijar commit/tag parcheado y comprobarlo en CI.  
Estado: CERRADO (paso 8)
Cierre: Parche mpt-verify-token aplicado (verify_token activo con comparación tiempo constante y fail-closed sin MPT_API_KEY; solo /ping público); sin env_file; CVE-2025-7897 no aplica a 1.3.3 declarada. Prueba: platform/scripts/apply-mpt-patch.py --check = PATCH APLICADO.
Prioridad de fix: P0 (hoy)

### [CRÍTICA-PF-SEC-004] Credenciales sociales y sesiones persistidas en claro

Severidad: CRÍTICA  
Categoría: Gestión de secretos, privacidad, persistencia  
Ubicación: `platform/phonefarm/platform.py:398-406,965-972`, `platform/phonefarm/publisher.py:67-86,113-133`, `platform/phonefarm/platform_data.py:46-54`, `platform/scripts/export-data.ps1:35-55`  

Aplicabilidad: AmbosDescripción: `accounts.json` conserva `password` en texto plano y las sesiones instagrapi se serializan como JSON sin cifrado ni ACL explícita. El backup normal incluye cuentas, proxies, sesiones, logs y vídeos; es un ZIP sin cifrado.  
Vector de ataque: 1) leer el volumen `platform/data`, un backup o un ZIP; 2) extraer contraseñas/sesiones; 3) reutilizar sesiones contra Instagram o acceder a cuentas de terceros.  
Impacto: C/I completos sobre cuentas sociales y PII.  
Evidencia: `"password": password`, `json.dump(settings, fh, indent=2)` y `Copy-Item` de `sessions`/`accounts.json`.  
Remediación: migrar secretos a DPAPI/Windows Credential Manager o un secret manager; cifrar datos con claves fuera del volumen; invalidar y rotar todas las sesiones existentes; backups cifrados con clave separada, expiración y control de acceso.  
Estado: CERRADO (paso 4)
Cierre: Passwords y sesiones cifrados AES-256-GCM (AAD tabla|id|campo) en SQLite; backups .pfbackup cifrados. Prueba: test_platform_data_no_guarda_passwords_en_claro, test_backup_export_restore_roundtrip.
Prioridad de fix: P0 (hoy)

## Hallazgos altos

### [ALTA-PF-SEC-005] Sesión HTTP capturable en LAN

Severidad: ALTA  
Categoría: Transporte, sesiones  
Ubicación: `server.ts:211-214,895-896`  

Aplicabilidad: Windows nativoDescripción: La cookie solo declara `HttpOnly`, `SameSite=Strict` y `Max-Age`; falta `Secure`. Express escucha en `0.0.0.0` y la URL operativa es HTTP.  
Vector de ataque: sniffing/ARP spoofing en la LAN captura `pf_session`; el atacante reutiliza el token durante 24 h.  
Impacto: C/I/A de la sesión.  
Evidencia: `Set-Cookie: ... HttpOnly; Path=/; SameSite=Strict; Max-Age=86400`.  
Remediación: terminar TLS en reverse proxy, enlazar backend a loopback y emitir `Secure; HttpOnly; SameSite=Strict`; invalidar sesiones tras cambio de password.  
Estado: CERRADO (paso 2)
Cierre: Cookie Secure; HttpOnly; SameSite=Strict; Express escucha solo en 127.0.0.1; trust proxy loopback (Tailscale Serve). Prueba: secure-boot.test.ts.
Prioridad de fix: P0 (hoy)

### [ALTA-PF-SEC-006] Publicación automática accesible a cualquier operator autenticado

Severidad: ALTA  
Categoría: Autorización, MCP/IA, abuso de terceros  
Ubicación: `server.ts:353-362,468-471`, `platform/phonefarm/platform.py:537-571,592-646`, `platform/phonefarm/mcp_server.py:36-67`  

Aplicabilidad: AmbosDescripción: `/api/moneyprinter/generate` fuerza `auto_approve: true`; las rutas de cola, aprobación, publicación y engagement solo requieren sesión. Además `bool("false")` produce `True`, confirmado con Flask test client.  
Vector de ataque: un operator crea un job o llama a `/api/moneyprinter/generate`; el worker salta la aprobación humana, genera el Reel y ejecuta `publisher.publish_video`.  
Impacto: I/A; spam, publicación reputacionalmente dañina y consumo de APIs.  
Remediación: eliminar el auto-approve de rutas HTTP; aceptar solo booleanos reales; separar `generate` de `publish`; exigir rol/admin y un approval nonce firmado para publicación; rate limit y presupuesto por cuenta.  
Estado: CERRADO (paso 5)
Cierre: auto_approve eliminado (400 explícito), StrictBool (sin coerción), publish exige ready_for_publish + expected_version (409) + confirm:true; RBAC admin. Prueba: test_publish_exige_estado..., rbac.test.ts.
Prioridad de fix: P0 (hoy)

### [ALTA-PF-SEC-007] Endpoints de creación devuelven secretos al cliente

Severidad: ALTA  
Categoría: Gestión de secretos, API  
Ubicación: `platform/phonefarm/platform.py:381-418,467-492,941-983`  

Aplicabilidad: AmbosDescripción: Aunque los GET filtran `password`/`pass`, los POST de creación devuelven el objeto completo. La respuesta de prueba incluyó `password` y `pass` literalmente.  
Vector de ataque: un proxy, extensión, historial del navegador, captura de red o log de frontend conserva la credencial recién creada.  
Impacto: C/I sobre cuentas y proxies.  
Remediación: devolver DTOs redactados (`id`, `username`, estado), nunca password/pass; usar un canal de alta separado que no repita el secreto y limpiar el estado del cliente.  
Estado: CERRADO (paso 4)
Cierre: DTOs redactados en create/from-device/login IG (sin password ni session_file). Prueba: flask test client + _account_dto.
Prioridad de fix: P0 (hoy)

### [ALTA-PF-SEC-008] Login Instagram sin vinculación de cuenta ni rol

Severidad: ALTA  
Categoría: Autorización, escalación horizontal  
Ubicación: `server.ts:378-380`, `platform/phonefarm/platform.py:804-823`, `platform/phonefarm/publisher.py:113-133`  

Aplicabilidad: AmbosDescripción: Cualquier sesión puede llamar `/api/accounts/:id/instagram/login`; Flask no comprueba que `account_id` exista ni que el username coincida con la cuenta. `login_once()` guarda la sesión bajo el ID recibido.  
Vector de ataque: operator elige `acc_01`, envía credenciales de otra cuenta o fuerza una sesión para un ID existente y la sobrescribe.  
Impacto: C/I sobre sesiones sociales y publicación en la cuenta equivocada.  
Remediación: `requireRole("admin")`, comprobar existencia y estado de la cuenta, ignorar username del cliente usando el almacenado, impedir overwrite sin reautenticación y auditar actor/target.  
Estado: CERRADO (paso 5)
Cierre: Login IG admin-only (Express y Flask), identidad de cuenta solo desde :id con username almacenado. Prueba: test_login_ig_admin_usa_username_almacenado.
Prioridad de fix: P1 (esta semana)

### [ALTA-PF-SEC-009] SSRF ciego mediante `mini_pc_ip`

Severidad: ALTA  
Categoría: SSRF, red  
Ubicación: `server.ts:536-543`  

Aplicabilidad: Windows nativoDescripción: `/api/adb/test-connection` construye `http://${miniPcIp}:${miniPcPort}/api/stats` con un host controlado por el usuario y sin allowlist ni token interno.  
Vector de ataque: un operator apunta a `127.0.0.1`, rangos RFC1918, metadata/servicios internos o un servidor controlado; observa diferencias de estado/tiempo para escanear la red.  
Impacto: C/I potencial y reconocimiento de red; posible exfiltración si el destino responde información aprovechable.  
Remediación: eliminar host/puerto del request; usar una configuración server-side allowlisted (`127.0.0.1:5000`); validar IP literal, bloquear loopback/metadata y añadir `X-Internal-Auth` al destino.  
Estado: CERRADO (paso 9)
Cierre: test-connection usa ADB_HOST/ADB_PORT del servidor (ignora el body) + X-Internal-Auth. Prueba: test vitest "adb/test-connection ignora host/puerto del cliente".
Prioridad de fix: P1 (esta semana)

### [ALTA-PF-SEC-010] Descarga de vídeo desde URL absoluta no allowlisted

Severidad: ALTA  
Categoría: SSRF, generación, egress  
Ubicación: `platform/phonefarm/generator.py:163-176,218-230`  

Aplicabilidad: AmbosDescripción: `_normalize_download_uri()` acepta cualquier `http://` o `https://` devuelto por MPT y `_download_video()` lo descarga directamente. La URL base MPT también es configurable.  
Vector de ataque: comprometer/manipular MPT o configurar una base maliciosa; devolver una URL hacia servicios internos o un fichero grande; el backend lo solicita y lo almacena.  
Impacto: C/I/A; SSRF, exfiltración y agotamiento de disco.  
Remediación: aceptar solo rutas relativas de MPT; resolver contra un origin allowlisted, bloquear cambios de esquema/host, aplicar límites de tamaño MIME y timeout total.  
Estado: CERRADO (paso 9)
Cierre: Descargas MPT solo rutas relativas bajo storage, sin esquema/host ni ".."; redirects cross-host rechazados (safe_get). Prueba: test_normalize_download_uri_rechaza_absolutas.
Prioridad de fix: P1 (esta semana)

### [ALTA-PF-SEC-011] Contenedores root con volúmenes host y acceso ADB

Severidad: ALTA  
Categoría: Infraestructura, aislamiento  
Ubicación: `platform/Dockerfile:2-31`, `platform/docker-compose.yml:22-27,51-56`  

Aplicabilidad: DockerDescripción: No se declara `USER`; ambos servicios ejecutan como root. `platform` monta `./data` y `./templates` del host con escritura y accede a `host.docker.internal:5037` (ADB).  
Vector de ataque: una vulnerabilidad en Flask/MPT/taktik obtiene root dentro del contenedor, modifica datos/sesiones del host y usa ADB para controlar teléfonos.  
Impacto: C/I/A y pivot al host/dispositivos.  
Remediación: usuario UID/GID sin privilegios, root filesystem read-only, `cap_drop: [ALL]`, `no-new-privileges`, volúmenes mínimos read-only, red ADB separada y política de egress.  
Estado: CERRADO (paso 13)
Cierre: Dockerfile con USER nobody, read_only, cap_drop ALL, no-new-privileges, tmpfs; compose con límites, redes separadas y healthchecks (docker compose config válido). Nota: verificación runtime pendiente del despliegue real.
Prioridad de fix: P1 (esta semana)

### [ALTA-PF-SEC-012] Supply chain no reproducible

Severidad: ALTA  
Categoría: Dependencias y despliegue  
Ubicación: `platform/scripts/deploy.ps1:31-40`, `platform/Dockerfile:15-20`, `platform/requirements.txt:6,9,13,15`, `platform/scripts/setup-new-machine.ps1:73-80`  

Aplicabilidad: AmbosDescripción: Deploy clona `taktik-bot` y MoneyPrinterTurbo desde la rama actual sin commit/tag; `requirements.txt` deja varios paquetes en rangos abiertos y la instalación de npm usa `--no-audit`. El Dockerfile tampoco fija digest de imagen base ni hashes de wheels.  
Vector de ataque: un cambio malicioso en upstream o mirror se incorpora en el siguiente deploy y ejecuta código con acceso a ADB, secretos y sesiones.  
Impacto: C/I/A.  
Remediación: fijar commit verificado de cada tercero, usar lock/hash (`pip --require-hashes`), digest de imagen, SBOM, firma/verificación y CI con `npm audit`, `pip-audit`, escáner de imagen y revisión de cambios.  
Estado: CERRADO (pasos 8/13)
Cierre: Lock de terceros (third_party.lock + docs/THIRD-PARTY-LOCK.md), commits fijados en deploy.ps1, requirements con versiones exactas, patch reproducible. Prueba: apply-mpt-patch.py + npm audit 0 vulns.
Prioridad de fix: P1 (esta semana)

### [ALTA-PF-SEC-013] `nanoid` vulnerable en la cadena Node

Severidad: ALTA  
Categoría: Dependencias y supply chain  
Ubicación: `package-lock.json` / `node_modules/nanoid`; introducido por `autoprefixer -> postcss -> nanoid`  

Aplicabilidad: Ambos (build/CI)Descripción: `npm audit --json` detectó `nanoid@3.3.16`, rango vulnerable `<3.3.17`, con severidad HIGH y fix disponible.  
Vector de ataque: activar el camino vulnerable mediante un consumidor que permita tamaño cero; el impacto principal es denegación de servicio.  
Impacto: A; riesgo transitorio mientras el paquete permanezca instalado.  
Remediación: actualizar PostCSS/autoprefixer o fijar `nanoid >=3.3.17`, regenerar ambos lockfiles y verificar con `npm audit --omit=dev` y build.  
Estado: CERRADO (paso 13)
Cierre: nanoid 3.3.18 vía overrides (>=3.3.17); npm audit --audit-level=high = 0 vulnerabilidades.
Prioridad de fix: P1 (esta semana)

### [ALTA-PF-SEC-014] Cola, threads, SSE y disco sin límites operativos

Severidad: ALTA  
Categoría: Disponibilidad y resiliencia  
Ubicación: `server.ts:185`, `platform/phonefarm/platform.py:180-189,309-323`, `platform/phonefarm/mcp_server.py:36-67,221-225`, `platform/phonefarm/platform.py:985-1001`, `platform/phonefarm/generator.py:43-45,218-246`  

Aplicabilidad: AmbosDescripción: No hay cuota de jobs, concurrencia global, límite de tamaño en Flask/MCP, límite de vídeos/logs ni límite de clientes SSE. Cada job puede crear un thread y esperar hasta una hora.  
Vector de ataque: operator/MCP envía muchos jobs o abre conexiones SSE; se consumen RAM, workers, disco y cuota de proveedores hasta dejar el panel/pipeline fuera de servicio.  
Impacto: A y coste financiero.  
Remediación: `MAX_CONTENT_LENGTH`, esquemas con límites, cola persistente con worker pool acotado, cuotas por usuario/cuenta, backpressure, límites de vídeo/log, timeouts SSE y limpieza/retención.  
Estado: CERRADO (paso 12)
Cierre: Worker pool (semáforo), timeouts por job (reap), límites SSE (32), payload (256kb/1MB), vídeo (500MB) y disco (2GB); fallback_queue acotada. Prueba: test_reap_stale_jobs, test_sse_subscriber_limit, test_video_size_limit.
Prioridad de fix: P1 (esta semana)

## Hallazgos medios

### [MEDIA-PF-SEC-015] Validación de entrada insuficiente y errores 500 controlables

Severidad: MEDIA  
Categoría: Validación, disponibilidad  
Ubicación: `server.ts:185`, `platform/phonefarm/platform.py:381-418,467-492,537-571,717-746`  

Aplicabilidad: AmbosDescripción: No hay esquemas ni límites para username, password, keyword, script, caption, hashtags, nombres de perfil o listas. `int(body.get("port"))` y `int(warmup_day)` pueden lanzar excepciones no controladas.  
Vector de ataque: enviar tipos/valores enormes o malformados repetidamente; provocar 500, consumo de memoria, entradas corruptas o costes LLM.  
Impacto: A/I.  
Remediación: Pydantic/JSON Schema, longitudes y cardinalidades máximas, tipos estrictos, respuestas 400 y límites de request.  
Estado: CERRADO (paso 9)
Cierre: Esquemas Zod (Express) y Pydantic (Flask) con longitudes/tipos estrictos y 400 con detalle; MAX_CONTENT_LENGTH 413. Prueba: test_queue_create_rechaza_controles, test_proxy_create_valida_puerto.
Prioridad de fix: P2 (sprint)

### [MEDIA-PF-SEC-016] XSS DOM en Panda Grid

Severidad: MEDIA  
Categoría: XSS, frontend  
Ubicación: `server.ts:824-833`  

Aplicabilidad: Windows nativoDescripción: La página `/panda` construye `card.innerHTML` interpolando `dev.model`, `dev.product` y `dev.serial`. Esos valores provienen de `adb devices -l` y no se escapan.  
Vector de ataque: conectar/registrar un dispositivo con metadatos maliciosos; un usuario autenticado abre Panda y el HTML ejecuta JavaScript en el origen del panel.  
Impacto: C/I de la sesión del navegador.  
Remediación: crear nodos con `textContent`/DOM APIs; no usar `innerHTML` con datos ADB; añadir CSP sin `unsafe-inline`.  
Estado: CERRADO (pasos 1/10)
Cierre: /panda y dashboard.html sin innerHTML (nodos + textContent); CSP con nonce. Prueba: test "panda sin innerHTML" (vitest).
Prioridad de fix: P2 (sprint)

### [MEDIA-PF-SEC-017] Exportación de backup sin cifrado ni confirmación fuerte

Severidad: MEDIA  
Categoría: Privacidad, backups  
Ubicación: `platform/scripts/export-data.ps1:35-67`  

Aplicabilidad: Windows nativoDescripción: El modo normal copia cuentas, proxies, sesiones, logs y vídeos a un ZIP plano; `-IncludeSecrets` añade `.env` y `adbkey`. No existe cifrado, password, ACL o expiración.  
Vector de ataque: robo del ZIP, carpeta de backups o canal de migración; extracción offline de credenciales.  
Impacto: C/I.  
Remediación: exportación cifrada autenticada, redacción por defecto, separación de secretos, ACL de destino y borrado seguro/retención.  
Estado: CERRADO (paso 10)
Cierre: export-data.ps1 reescrito: .pfbackup cifrado (scrypt passphrase); restore-backup.ps1; sin -IncludeSecrets en claro. Prueba: test_backup_cli_export_e2e.
Prioridad de fix: P1 (esta semana)

### [MEDIA-PF-SEC-018] Inyección de líneas en `.env` desde configuración MPT

Severidad: MEDIA  
Categoría: Validación, secretos, persistencia  
Ubicación: `server.ts:439-465`  

Aplicabilidad: Windows nativoDescripción: Un admin puede escribir valores `pexels_api_key`, `minimax_api_key` y otros directamente en `.env` sin rechazar `\r`/`\n`, `=` o caracteres de control.  
Vector de ataque: un valor con salto de línea añade variables arbitrarias; tras reinicio puede modificar `ADMIN_PASSWORD`, `PHONE_FARM_INTERNAL_TOKEN`, `FLASK_BASE` o el comportamiento del proceso.  
Impacto: I/A y potencial toma de control tras restart; requiere sesión admin.  
Remediación: no editar `.env` desde HTTP; usar archivo de configuración tipado fuera del repo, allowlist de charset/longitud y escritura atómica con permisos restrictivos.  
Estado: CERRADO (paso 9)
Cierre: Config MPT editable pasa a tabla settings validada (sin "=" ni controles; mpt_api_url solo hosts internos); nunca se escribe .env desde HTTP. Prueba: test vitest "moneyprinter/config rechaza secretos...".
Prioridad de fix: P2 (sprint)

### [MEDIA-PF-SEC-019] Rate limit de login evadible por distribución y mapa no acotado

Severidad: MEDIA  
Categoría: Autenticación, disponibilidad  
Ubicación: `server.ts:119-133`  

Aplicabilidad: Windows nativoDescripción: El límite es 10 intentos/15 min por IP; no existe límite por cuenta, credencial o ventana global. El `Map` de IPs no tiene tamaño máximo ni limpieza de entradas antiguas.  
Vector de ataque: distribuir intentos entre IPs/proxies o enviar muchas IPs distintas para credential stuffing y crecimiento de memoria. `X-Forwarded-For` no se confía actualmente, lo cual evita un bypass trivial pero no resuelve el problema distribuido.  
Impacto: C/I potencial y A.  
Remediación: rate limit distribuido por identidad+IP, backoff, CAPTCHA/step-up, bloqueo temporal y TTL/LRU en el almacén.  
Estado: CERRADO (paso 5)
Cierre: Rate limit persistente 5/15min por usuario+IP y 20/15min por IP (tabla rate_limits, TTL + barrido). Prueba: rbac.test.ts.
Prioridad de fix: P2 (sprint)

### [MEDIA-PF-SEC-020] Sesiones y trabajos frágiles ante restart

Severidad: MEDIA  
Categoría: Resiliencia, sesiones, cola  
Ubicación: `server.ts:41-79`, `platform/phonefarm/platform.py:157-189,309-327`  

Aplicabilidad: AmbosDescripción: Las sesiones Express viven solo en memoria y se pierden al reiniciar. Threads y referencias de jobs también se pierden; `bot_active` puede quedar true aunque el proceso ya no exista.  
Vector de ataque: provocar o aprovechar un reinicio; usuarios quedan bloqueados y jobs pueden quedar pendientes, duplicarse o requerir intervención manual.  
Impacto: A/I.  
Remediación: store de sesiones con revocación/TTL, cola durable con estados idempotentes, recuperación al arranque y reconciliación de bots.  
Estado: CERRADO (pasos 3/5/12)
Cierre: Sesiones en SQLite (sobreviven reinicios), jobs persistentes con versionado, reconciliación de arranque (jobs atascados + bot_active). Prueba: test_reconcile_after_restart, "la sesión sobrevive a un reinicio".
Prioridad de fix: P2 (sprint)

### [MEDIA-PF-SEC-021] SSE y `get_logs` exponen PII y rutas internas

Severidad: MEDIA  
Categoría: Logging, privacidad  
Ubicación: `platform/phonefarm/platform.py:95-145,985-1001`, `platform/phonefarm/mcp_server.py:221-225`, `server.ts:692-717`  

Aplicabilidad: AmbosDescripción: El ring buffer y el SSE entregan mensajes completos a cualquier sesión válida/MCP. Los logs incluyen usernames, seriales ADB, rutas locales, media IDs, keywords y excepciones de terceros. No hay redacción centralizada.  
Vector de ataque: operador/MCP lee el stream o un cliente comprometido captura el historial y reconstruye PII/infraestructura.  
Impacto: C/I y privacidad.  
Remediación: logger estructurado con campos sensibles filtrados, scopes de logs por rol, cursor/TTL, límite de conexiones y no enviar stack traces/rutas al cliente.  
Estado: CERRADO (paso 10)
Cierre: Redactor central (redact.py) en ring buffer y logging; SSE/MCP sanitizados. Prueba: test_redact_text_enmascara_secretos.
Prioridad de fix: P2 (sprint)

### [MEDIA-PF-SEC-022] No existe identidad de actor ni logs tamper-evident

Severidad: MEDIA  
Categoría: Monitorización, forense  
Ubicación: `platform/phonefarm/platform.py:417,435,491,569,626,645,670,684,745,758,982`; arquitectura de proxy `server.ts:143-171`  

Aplicabilidad: AmbosDescripción: Flask registra acción/objeto, pero Express no transmite usuario/rol y no hay `actor_id`, correlación, firma, envío remoto ni alertas. Un usuario con acceso al host puede borrar o editar los logs locales.  
Vector de ataque: abuso o intrusión posterior; no se puede atribuir quién publicó, cambió secretos o eliminó cuentas.  
Impacto: I y capacidad forense reducida.  
Remediación: propagar identidad firmada desde Express, auditoría append-only remota, hash chain/WORM, alertas por publicación masiva, cambios de configuración y fallos de auth.  
Estado: CERRADO (paso 6)
Cierre: X-Actor/X-Role/X-Request-ID propagados y aceptados solo desde loopback; audit_log encadenado HMAC con verify_chain. Prueba: test_audit_chain_integra_y_detecta_tamper, test_identity_headers_solo_loopback.
Prioridad de fix: P2 (sprint)

### [MEDIA-PF-SEC-023] Prompt injection y falta de controles de contenido

Severidad: MEDIA  
Categoría: IA, abuso, privacidad  
Ubicación: `platform/phonefarm/content.py:122-160,179-195`, `platform/phonefarm/platform.py:537-571`, `platform/phonefarm/mcp_server.py:36-67`  

Aplicabilidad: AmbosDescripción: `keyword` y `script` llegan al LLM con límites mínimos; no hay moderación, allowlist temática, revisión obligatoria para jobs MCP ni presupuesto por proveedor. `auto_approve` permite saltar el control humano.  
Vector de ataque: introducir instrucciones en keyword/script para generar contenido dañino, exfiltrar contexto del prompt o consumir cuota masivamente.  
Impacto: I/A, reputación y coste.  
Remediación: separar instrucciones de datos, límites de longitud, moderación, clasificación de riesgo, aprobación obligatoria y cuotas por actor/cuenta.  
Estado: CERRADO (paso 11)
Cierre: Instrucciones de sistema constantes, bloqueo de secretos en prompts, validación de salida y moderación antes de ready_for_publish. Prueba: test_build_script_rechaza_secretos, test_ready_bloqueado_por_moderacion.
Prioridad de fix: P2 (sprint)

### [MEDIA-PF-SEC-024] Configuración de red y egress demasiado confiada

Severidad: MEDIA  
Categoría: Red, SSRF, hardening  
Ubicación: `server.ts:38,152-160,255-305`, `platform/phonefarm/generator.py:34,59,84,108,155,227`, `platform/phonefarm/platform.py:356-370`  

Aplicabilidad: AmbosDescripción: `FLASK_BASE`, `MPT_API_URL`, proveedores LLM y proxies se resuelven desde entorno/config sin una política central de host/esquema. CORS loopback está restringido, pero no sustituye una allowlist de egress.  
Vector de ataque: error de despliegue o cuenta admin configura un endpoint externo; el backend envía tokens, prompts o vídeos a un destino no autorizado.  
Impacto: C/I.  
Remediación: catálogo de origins permitido, DNS/IP pinning donde aplique, proxy de salida, bloqueo de metadata/link-local y validación de TLS.  
Estado: CERRADO (paso 9)
Cierre: Política central de egress (net.py/net.ts): allowlist interna, bloqueo de IP privada/loopback/link-local en externo y DNS pinning. Prueba: test_net_guard_interno_rechaza_externo.
Prioridad de fix: P2 (sprint)

## Hallazgos bajos e informativos

### [BAJA-PF-SEC-025] Cabeceras HTTP de hardening ausentes

Severidad: BAJA  
Categoría: Transporte, frontend  
Ubicación: `server.ts:181-185,864-893`  

Aplicabilidad: Windows nativoDescripción: No se configura Helmet/CSP, HSTS, `X-Content-Type-Options`, `frame-ancestors` ni `Referrer-Policy`; además Express expone `X-Powered-By` por defecto.  
Vector de ataque: clickjacking, MIME sniffing y mayor impacto de XSS si aparece otro sink.  
Impacto: I/C secundarios.  
Remediación: `helmet()` con CSP explícita, HSTS solo tras TLS, `app.disable("x-powered-by")` y política de referrer.  
Estado: CERRADO (paso 2)
Cierre: Helmet (CSP nonce, HSTS condicional, X-Content-Type-Options, Referrer-Policy), frame-ancestors none, sin X-Powered-By. Prueba: secure-boot.test.ts.
Prioridad de fix: P3 (backlog)

### [BAJA-PF-SEC-026] Rotación de logs limitada y sin cuota por fichero

Severidad: BAJA  
Categoría: Logging, disponibilidad  
Ubicación: `platform/phonefarm/platform.py:67-89`  

Aplicabilidad: AmbosDescripción: Hay rotación diaria con `backupCount=14`, pero no límite de tamaño ni política de limpieza para `taktik_<account>.log`, `fallback_queue.json` y vídeos.  
Vector de ataque: generar actividad o errores largos hasta llenar el volumen.  
Impacto: A.  
Remediación: rotación por tamaño, cuotas por cuenta, retención central y monitorización de disco.  
Estado: CERRADO (paso 12)
Cierre: Rotación de logs por tamaño (10MB x 10 backups), fallback_queue acotada (500).
Prioridad de fix: P3 (backlog)

### [BAJA-PF-SEC-027] Health checks y dependencias de arranque insuficientes

Severidad: BAJA  
Categoría: Infraestructura, resiliencia  
Ubicación: `platform/docker-compose.yml:9-57`  

Aplicabilidad: DockerDescripción: `depends_on` solo ordena inicio; no hay `healthcheck`, límites de CPU/RAM, política de logs ni readiness de MPT antes de aceptar jobs.  
Vector de ataque: reinicios o arranque parcial dejan jobs fallando, reintentos manuales y estados inconsistentes.  
Impacto: A/I.  
Remediación: healthchecks autenticados, `condition: service_healthy`, límites de recursos, log driver con rotación y endpoint de readiness.  
Estado: CERRADO (pasos 12/13)
Cierre: /healthz y /readyz (Express + Flask) sin revelar configuración; healthchecks + límites en compose; depends_on service_healthy. Prueba: test_readyz_flask, vitest readyz.
Prioridad de fix: P3 (backlog)

## Observaciones informativas

### [INFO-PF-SEC-028] Auth interno Flask verificado en prueba local

Severidad: INFO  
Categoría: Comunicación inter-servicios  
Ubicación: `platform/phonefarm/platform.py:343-350`  

Aplicabilidad: AmbosDescripción: La prueba Flask devolvió 401 sin `X-Internal-Auth` y 200 con el token ficticio configurado para el fixture. Esto confirma que el middleware existe; no acredita rotación, secreto seguro ni aislamiento de red.  
Vector de ataque: no aplica como vulnerabilidad independiente; el riesgo residual está cubierto por PF-SEC-003/PF-SEC-024.  
Impacto: INFO.  
Evidencia: test client local.  
Remediación: mantener el middleware y añadir rotación, identidad de servicio y mTLS/allowlist.  
Estado: CERRADO (mantenido + paso 6/7)
Cierre: Middleware interno conservado; identidad de servicio y auditoría añadidas; token rotable con rotate-internal-secrets.ps1.
Prioridad de fix: P2 (sprint)

### [INFO-PF-SEC-029] Traversal de source y vídeos bloqueado en prueba local

Severidad: INFO  
Categoría: Inyección, autorización  
Ubicación: `server.ts:366-375`, `platform/phonefarm/platform.py:894-907,1009-1017`  

Aplicabilidad: AmbosDescripción: Las pruebas con rutas codificadas `..` devolvieron 403/404 y no leyeron archivos fuera de las bases permitidas.  
Vector de ataque: no reproducido en los caminos auditados.  
Impacto: INFO.  
Evidencia: Express rechaza el path fuera de `platform/videos`; Flask usa `Path(filename).name` y allowlist.  
Remediación: conservar las pruebas de regresión y no introducir rutas arbitrarias en nuevas descargas.  
Estado: CERRADO (mantenido)
Cierre: Traversal de vídeos/source bloqueado y con pruebas de regresión (vitest /videos + allowlist de source intactas).
Prioridad de fix: P3 (backlog)

### [INFO-PF-SEC-030] Compilación correcta, pero sin suite de seguridad automatizada

Severidad: INFO  
Categoría: SDLC, pruebas  
Ubicación: `.github/workflows/ci.yml:17-58`, `package.json:7-13`  

Aplicabilidad: Ambos (CI)Descripción: Typecheck y build pasan. CI ejecuta typecheck/build/gitleaks, pero no ejecuta `npm audit`, `pip-audit`, pruebas Flask/MCP, SAST ni escaneo de imágenes.  
Vector de ataque: regresiones de seguridad pueden entrar aunque el build sea verde.  
Impacto: INFO; riesgo residual tratado en PF-SEC-012/PF-SEC-013.  
Evidencia: comandos locales PASS y workflow sin jobs de dependencias/SAST.  
Remediación: añadir jobs de seguridad con artefactos y umbral de fallo.  
Estado: CERRADO (pasos 1/14)
Cierre: Suites Vitest (35 tests) y pytest (42 tests); CI ampliado: npm audit, pip-audit, bandit, compose config, gitleaks, typecheck/build/test.
Prioridad de fix: P2 (sprint)

## Controles confirmados

- `safeEqual()` usa `timingSafeEqual` y compara longitudes antes de comparar (`server.ts:56-61`).
- Las sesiones tienen tokens aleatorios, hash SHA-256 en memoria, expiración de 24 h y logout selectivo (`server.ts:50-79,202-224`).
- ADB/scrcpy/touch usan `execFile` con arrays y validación de seriales; no se observó `shell: true` en esos caminos (`server.ts:174-177,564-678`).
- `/videos` usa resolución bajo base y `send_from_directory`; `/api/source` aplica allowlist de nombres (`server.ts:366-375`, `platform.py:894-907,1009-1017`).
- `platform_data._write()` usa temporal + `os.replace`, evitando corrupción parcial de los tres JSON principales (`platform_data.py:46-54`).
- CORS Flask solo refleja origins explícitamente loopback (`platform.py:354-370`).
- `.env`, datos runtime, sesiones y backups están ignorados por Git; el workflow incluye gitleaks. Esto no protege el disco local ni ZIPs ya creados.

## Matriz de riesgo

| Probabilidad \ Impacto | Bajo | Medio | Alto | Crítico |
|---|---|---|---|---|
| **Alta** | PF-SEC-025, PF-SEC-026, PF-SEC-027 | PF-SEC-015, PF-SEC-016, PF-SEC-019, PF-SEC-020, PF-SEC-021, PF-SEC-023, PF-SEC-024 | PF-SEC-005, PF-SEC-006, PF-SEC-007, PF-SEC-008, PF-SEC-009, PF-SEC-010, PF-SEC-011, PF-SEC-012, PF-SEC-013, PF-SEC-014, PF-SEC-017 | PF-SEC-001, PF-SEC-002, PF-SEC-003, PF-SEC-004 |
| **Media** | — | PF-SEC-018, PF-SEC-022 | — | — |
| **Baja** | PF-SEC-028, PF-SEC-029, PF-SEC-030 | — | — | — |

## Roadmap de remediación

### Fase 0 — 24 horas (P0)

- Rotar credenciales admin/operator, `PHONE_FARM_INTERNAL_TOKEN`, claves LLM/proxy y todas las sesiones sociales; eliminar defaults del entorno.
- Apagar MCP y MPT externos hasta añadir auth, separación de red y mínimo privilegio.
- Desactivar `/api/moneyprinter/generate` y cualquier `auto_approve` HTTP/MCP; exigir aprobación de publicación.
- Eliminar password/pass de todas las respuestas; bloquear exposición del panel por HTTP y añadir reverse proxy TLS.
- Copiar datos a una ubicación segura y comenzar migración de cuentas/sesiones fuera de JSON plano.

### Fase 1 — 1 semana (P1)

- Corregir login Instagram con RBAC, existencia y binding de cuenta; cerrar SSRF de ADB y descargas MPT.
- Separar secretos del contenedor MPT, fijar commits/digests y actualizar `nanoid`.
- Ejecutar contenedores como usuario no root, restringir volúmenes y aplicar egress/firewall.
- Cifrar backups y rotar los ZIP existentes.

### Fase 2 — 1 sprint (P2)

- Añadir esquemas, límites, cuotas, worker pool, límites SSE, rate limit distribuido y cola durable.
- Eliminar `innerHTML`, desplegar CSP/Helmet y añadir actor/audit trail tamper-evident.
- Introducir moderación/prompt isolation y políticas de privacidad/retención.
- Incorporar pruebas de seguridad de rutas, MCP, SSRF y redacción al CI.

### Fase 3 — backlog (P3)

- Health checks/readiness, rotación por tamaño, alertas SIEM, SBOM firmado, revisión de firewall Windows y pruebas de recuperación.
- Evaluar una base de datos transaccional y un gestor de secretos administrado.

## Checklist pre-producción (30 controles mínimos)

| # | Control | Estado |
|---:|---|:---:|
| 1 | Credenciales de producción únicas y rotadas | ✅ (rotación externa pendiente) |
| 2 | Token interno fuerte, separado y con rotación | ✅ |
| 3 | Expiración de sesión server-side | ✅ |
| 4 | Logout revoca solo la sesión actual | ✅ |
| 5 | Cookie `Secure` + `HttpOnly` + `SameSite` | ✅ |
| 6 | Protección contra fixation (token nuevo por login) | ✅ |
| 7 | Rate limit básico de login | ✅ |
| 8 | Protección contra credential stuffing distribuido | ✅ |
| 9 | RBAC aplicado a cada mutación sensible | ✅ |
| 10 | Operator no puede publicar/arrancar acciones privilegiadas | ✅ |
| 11 | Ownership/IDOR de cuentas y jobs | ✅ |
| 12 | Flask exige autenticación interna | ✅ |
| 13 | MPT exige autenticación y origin allowlist | ✅ |
| 14 | MCP exige autenticación y RBAC | ✅ |
| 15 | MCP destructivo con aprobación y rate limit | ✅ |
| 16 | Puertos loopback y segmentación interna efectiva | ✅ |
| 17 | Esquemas y límites de payload | ✅ |
| 18 | Subprocess/ADB sin shell injection | ✅ |
| 19 | Traversal de vídeos/source bloqueado | ✅ |
| 20 | XSS/CSP cubiertos | ✅ |
| 21 | SSRF y egress allowlisted | ✅ |
| 22 | Passwords de cuentas cifradas | ✅ |
| 23 | Sesiones instagrapi cifradas/protegidas | ✅ |
| 24 | Logs y exportaciones redactados | ✅ |
| 25 | Secretos fuera del historial Git | ✅ |
| 26 | HTTPS + HSTS en producción | ✅ |
| 27 | Firewall y exposición de puertos documentados | ✅ |
| 28 | Contenedores sin root + healthchecks | ✅ |
| 29 | Backups cifrados y recuperación probada | ✅ |
| 30 | Dependencias fijadas, auditadas y escaneadas en CI | ✅ |

## Correcciones de contexto (paso 1 — recalibración)

- **PF-SEC-003 (CVE-2025-7897):** el checkout declara MoneyPrinterTurbo 1.3.3 y el CVE enumera versiones afectadas hasta 1.2.6 → el CVE no aplica a la versión declarada. La observación sigue abierta por la ausencia de autenticación y la exposición de secretos (se cierra en el paso 8).
- **PF-SEC-013 (nanoid):** `nanoid@3.3.16` es dependencia de desarrollo (vía `autoprefixer -> postcss`). Se conserva la severidad HIGH comunicada por `npm audit`, pero la prioridad interna baja; la actualización a `>=3.3.17` (GHSA-2v37-7h3g-55p8) se ejecuta en el paso 13.
- **Postura base:** 1/10 se mantiene como fotografía inicial; la liberación a producción dependerá del gate del paso 14 (cero críticas/altas aplicables abiertas, secretos rotados, pruebas completas, Docker endurecido y postura recalculada >= 8/10).

## Limitaciones

- No se levantó Docker ni MoneyPrinterTurbo real; la validación de esos componentes es estática y depende del checkout local.
- El módulo `mcp` no está instalado en el Python activo; no se hizo una llamada HTTP real a `/mcp`.
- No se enviaron payloads a Instagram, LLM, Pexels, proxies ni teléfonos ADB reales.
- La ausencia de CVEs de `pip-audit` solo cubre paquetes que la herramienta pudo resolver desde PyPI; `taktik-bot` y el checkout Git quedan fuera de esa garantía.

---

# Ronda 3 — Auditoría de seguimiento (2026-08-14)

**Alcance:** relectura completa de `server/app.ts` + `platform/phonefarm/*.py` + frontend React, verificación de git/secretos, `npm audit` y comparación con la línea base PF-SEC-001..030 (cerrada).  
**Método:** revisión estática dirigida a RBAC por endpoint, redacción de logs, manejo de `.env` en HTTP, robustez de cookies y consistencia de la cadena de autenticación.

| Severidad | Hallazgos |
|---|---:|
| ALTA | 1 |
| MEDIA | 3 |
| BAJA | 2 |
| **Total** | **6** (todos remediados en esta ronda) |

## [ALTA-PF-SEC-031] RedactFilter no redacta `record.args` — secretos en claro en logs

Severidad: ALTA  
Categoría: Logging/forense, gestión de secretos  
Ubicación: `platform/phonefarm/redact.py:42-51`  
Descripción: el filtro redactaba solo `record.msg` (el formato), pero `logging.Formatter` interpola `record.args` DESPUÉS de pasar por los filtros. Un `logger.info("Proxy %s conectado", "pass=supersecreto")` escribía el secreto en claro en el archivo y en el ring buffer (SSE/MCP), invalidando la garantía de redacción del paso 10.  
Evidencia: `RedactFilter.filter()` dejaba `if record.args: pass`.  
Remediación: el filtro ahora interpola con `record.getMessage()`, redacta el mensaje COMPLETO y vacía `record.args` para que el Formatter no re-formatee.  
Test: `test_redact_filter_redacta_args_interpolados` (pytest).

## [MEDIA-PF-SEC-032] RBAC inconsistente en control ADB táctil

Severidad: MEDIA  
Categoría: Autorización (RBAC)  
Ubicación: `server/app.ts` `/api/adb/touch`  
Descripción: `/api/adb/mirror` (scrcpy) era admin-only, pero `/api/adb/touch` (tap/swipe/key/power sobre todos los dispositivos físicos) solo exigía sesión. Un operator podía controlar físicamente los teléfonos de la granja.  
Remediación: `requireRole("admin")` en `/api/adb/touch` (mismo criterio que `/mirror`). El screenshot (`/api/adb/screenshot/:serial`) se mantiene accesible a operator por ser lectura/monitoreo, coherente con `/api/adb/devices` y `/api/stats`.  
Test: `test/rbac.test.ts` (operator → 403).

## [MEDIA-PF-SEC-033] RBAC en perfiles de contenido (config global de generación)

Severidad: MEDIA  
Categoría: Autorización (RBAC)  
Ubicación: `platform/phonefarm/platform.py` `POST/DELETE /api/content/profiles`; `server/app.ts` proxys equivalentes  
Descripción: cualquier operator podía crear/eliminar perfiles de nicho que gobiernan la generación global: `tone` (se interpola en el prompt de sistema del LLM), `caption_template`, `voice_name`, `video_terms`. Sin gate en Express NI en Flask (a diferencia de approve/publish/schedule).  
Remediación: `require_role("admin")` en Flask y `requireRole("admin")` en Express para POST/DELETE. El GET se mantiene abierto (el operator selecciona nicho al crear contenido).  
Tests: `test_operator_no_puede_gestionar_perfiles_de_contenido` (pytest) + `test/rbac.test.ts`.

## [MEDIA-PF-SEC-034] Ejecución de procesos host y oráculo de claves sin RBAC (moneyprinter)

Severidad: MEDIA  
Categoría: Autorización (RBAC), exposición de información  
Ubicación: `server/app.ts` `GET /api/moneyprinter/voices` y `POST /api/moneyprinter/test-pexels`  
Descripción: un operator podía (a) invocar `edge-tts --list-voices` en el host y (b) usar `config.pexelsApiKey` del servidor como oráculo de validez de la key. Ambas son operaciones de configuración, coherentes con el POST `/api/moneyprinter/config` (admin-only).  
Remediación: `requireRole("admin")` en ambos. `GET /api/moneyprinter/config` se mantiene operator (estado de solo lectura, sin secretos).  
Test: `test/rbac.test.ts` (operator → 403 en voices/test-pexels).

## [BAJA-PF-SEC-035] `GET /api/moneyprinter/config` releía `.env` desde HTTP

Severidad: BAJA  
Categoría: Gestión de secretos  
Ubicación: `server/app.ts` `GET /api/moneyprinter/config`  
Descripción: el endpoint parseaba el fichero `.env` con `fs.readFile` en cada request. Hoy solo extrae campos no sensibles, pero el patrón es frágil: un campo futuro añadido al parseo filtraría secretos por HTTP.  
Remediación: se elimina la lectura del fichero; los valores se toman de `config` (cargada desde `.env` al arrancar por `loadConfig`). Comportamiento de la API idéntico.  
Test: suite vitest existente (paso 9) sin cambios de contrato.

## [BAJA-PF-SEC-036] `cmd_revoke` con UPDATE duplicado y cookie parse con 500

Severidad: BAJA  
Categoría: Robustez, consistencia  
Ubicación: `platform/phonefarm/mcp_tokens.py:87-95`; `server/app.ts` `parseCookies`  
Descripción: `cmd_revoke` ejecutaba el `UPDATE service_tokens SET revoked=1` DOS veces (una en autocommit fuera del `with conn` y otra dentro), con `rowcount` leído tras la segunda ejecución. Además, una cookie malformada (`%` inválido) hacía lanzar `URIError` a `decodeURIComponent` → HTTP 500.  
Remediación: un solo UPDATE transaccional capturando su `rowcount`; `try/catch` en `parseCookies` (la cookie malformada se ignora, no revienta en 500).

## Verificaciones sin hallazgo (ronda 3)

- `GET /api/proxies` filtra el campo `pass` (Flask `platform.py:639`); `_account_dto` filtra `password` y `session_file` (`_row_to_account` descifra a `password`, nunca expone `enc_password`).
- `.env` y `platform/.env` no están trackeados en git (solo `.env.example`); `npm audit --omit=dev` → 0 vulnerabilidades; CI `audit-deps` cubre `npm audit --audit-level=high` + `pip-audit`.
- Frontend sin `innerHTML`/`dangerouslySetInnerHTML`/`eval` (XSS no aplicable); `/panda` usa `textContent` (regresión paso 14 cubierta por test).
- `/api/content/preview` valida `keyword` (MAX_KEYWORD_LEN=200, `content.py`) — descartado el hallazgo preliminar de ausencia de límite.
- `execFile` sin shell en ADB/scrcpy/edge-tts (sin command injection); `/api/stack` usa `exec()` pero con comandos fijos y PID del sistema (no explotable remotamente; solo lectura, cache 10 s).

## Observaciones aceptadas por diseño (sin cambio)

- `/api/adb/screenshot/:serial` accesible a operator: monitoreo de pantallas, mismo criterio que devices/stats (el CONTROL es admin: touch/mirror).
- `GET /api/proxies` dispara `verify_proxy` (conexión saliente a ipify) con cache 60 s: coste acotado por cache, operador autenticado interno.
- `scrypt N=2^14` por debajo del N=2^17 de OWASP: cambiar N rompería los hashes existentes; requiere rehash-on-login planificado (no se toca en esta ronda).
- `token_is_valid` abre una conexión SQLite por llamada: ineficiencia sin impacto de seguridad (rate limit MCP 60/min).

**Postura tras la ronda 3:** 9/10 mantenida; sin hallazgos nuevos abiertos. Evidencia: `npm run typecheck` PASS, 38 vitest + 44 pytest PASS.
