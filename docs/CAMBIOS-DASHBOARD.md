# Registro de cambios — Dashboard (recuperación de opciones)

**Fecha del registro:** 2026-08-10
**Motivo:** el operador notó que "se habían perdido opciones" del dashboard (p. ej. el acceso a MoneyPrinter) y pidió documentar cuándo cambió todo y recuperarlo sin romper los avances actuales.

---

## 1. Cronología de los cambios

| Fecha | Commit / Sesión | Qué se hizo | Efecto en el dashboard |
|---|---|---|---|
| 8 ago 2026 | `1af6d56` (HEAD previo) | Estado de referencia | Header con pestañas: **Dashboard · MoneyPrinter · ADB Bridge · cURL API · Python Code · Versiones** + botón **ZIP** + switch master + métricas Panda/Proxies/CPU/RAM. Marca "TH3F4Rm3R v2.4". |
| 9 ago 2026 | Sesión "auditoría + remediación" (agente de limpieza frontend) | Simplificó `Header.tsx` a "texto plano, sin iconos, sin color de marca" (eliminó lucide, pestañas y botón ZIP) | ⚠️ **Se perdieron del header**: pestaña MoneyPrinter, ADB Bridge, cURL API, Python Code, Versiones y botón ZIP. Las opciones **siguieron existiendo en el sidebar**, pero el acceso directo superior desapareció. Ese mismo día se añadieron: auth multi-sesión + RBAC, `POST /api/moneyprinter/config` (antes 404), CodeViewer con fetch real, escritura JSON atómica. |
| 10 ago 2026 | Sesión "Panda en vivo" (hoy) | Añadidos `/panda` (pantallas en vivo), `/api/adb/mirror` (scrcpy), `/api/adb/screenshot`, `/api/adb/touch`, contador real de terminales (`deviceCount`), timeouts de proxy corregidos (20s→60s + caché) | Avances mantenidos: Panda live, manejo scrcpy, contador real de dispositivos en header y sidebar. |
| **10 ago 2026** | **Recuperación (esta sesión)** | **Header restaurado**: pestañas MoneyPrinter · ADB Bridge · cURL API · Python Code · Versiones + botón ZIP, combinadas con lo nuevo (Panda con contador real, tema claro/oscuro, bots, proxies, CPU/RAM) | ✅ Todo lo del 8-ago vuelve a estar visible **y** se conserva lo del 9-10 ago. |

---

## 2. Qué se recuperó hoy (10 ago) en el Header

- **Pestañas de acceso rápido** (iconos lucide):
  - **MoneyPrinter** → abre el generador MoneyPrinterTurbo.
  - **ADB Bridge** → diagnóstico ADB/Flask.
  - **cURL API** → probador de endpoints.
  - **Python Code** → visor de código del backend.
  - **Versiones** → control de versiones.
- **Botón ZIP** → descarga `phone-farm-config.zip` (solo admin).
- Se mantienen: **Panda: N conectados** (contador real ADB), bots (iniciar/detener), proxies online/total, CPU/RAM, fecha, tema ☀/☾, usuario [salir].

---

## 3. Lo que NO se tocó (avances a día de hoy intactos)

| Avance | Estado |
|---|---|
| Auth multi-sesión + RBAC (admin/operator) | ✅ intacto |
| `POST /api/moneyprinter/config` persistente | ✅ intacto |
| `/panda` — grid de pantallas en vivo | ✅ intacto |
| Botón "Manejar (scrcpy)" por tarjeta | ✅ intacto |
| Contador real de terminales (`/api/adb/devices`) | ✅ intacto |
| Caché 5s + timeout 60s del proxy ADB | ✅ intacto |
| Escritura JSON atómica en `platform_data.py` | ✅ intacto |
| Purga de secretos/legacy (`farm-engine.ts`, `mcp.ts`, adbkey…) | ✅ intacto |

---

## 4. Notas operativas

- Las opciones siempre estuvieron en el **sidebar** (Proxies, Calendario, MoneyPrinter, ADB, cURL, Código, Versiones, Dispositivos, Panda live). Lo que se perdió el 9-ago y se recuperó hoy fue el **acceso directo desde el header**.
- Para volver a la "referencia" completa del 8-ago si alguna vez hace falta: `git checkout 1af6d56 -- src/components/Header.tsx src/App.tsx` (no recomendado: pisaría los avances del 9-10 ago).
- Documentación de referencia: `docs/INTERCONEXION.md`, `docs/AUDIT.md`, `docs/PLAN-LOCAL-VPS.md`, `MANUAL.md`.
