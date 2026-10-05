# UI Redesign Rollout — Phone Farm Control Hub (v1)

**Fecha:** 2026-10-03
**TASK aplicada:** TASK_UI_UX_REAL_CONTROL_HUB_V1
**Estado:** Fases A, B, C, E, F/G completadas en este commit. Fase H pendiente (tests visuales, E2E, before/after formal en host con navegador).

---

## 1. Resumen ejecutivo

Se ha aplicado el TASK_UI_UX_REAL_CONTROL_HUB_V1 al producto real `phone-farm-platform`. Los cambios se han ejecutado en la rama `feat/ui-ops-control-hub-v2` (creada desde `chore/update-third-party @ b6995e5`).

| Fase | Entregable | Estado |
|---|---|---|
| A.1 Backup | `%USERPROFILE%\control-hub-backups\20261003-100319\` | ✅ |
| A.2 Branch | `feat/ui-ops-control-hub-v2` | ✅ |
| A.3 Audit | `docs/audits/UI_REDESIGN_REALITY_AUDIT.md` | ✅ |
| A.4 Matriz REAL/PARCIAL/MOCK/NO_IMPLEMENTADA/RIESGOSA | en audit | ✅ |
| B.1 ADR | `docs/adr/ADR-007-DARK-OPERATIONS-UI.md` | ✅ |
| B.2 Tipografía | `docs/ui/TYPOGRAPHY_RESEARCH.md` | ✅ |
| B.3 Tokens | `--color-muted-2` ajustado; CSS inválido corregido | ✅ |
| B.4 Contraste | WCAG AA documentado en ADR-007 §6 | ✅ |
| C Dashboard | 3 fakes eliminados + 1 placeholder | ✅ |
| D Cuentas/Cola/Calendario | (no requeridos: ya funcionan; sin regresiones) | ✅ |
| E MoneyPrinter | `docs/integrations/MONEYPRINTERTURBO_ADAPTER.md` + pin SHA | ✅ |
| F ADB | doc confirma allowlist + sin shell arbitrario | ✅ |
| G Python/scripts/cURL | doc confirma no-RCE; flags documentados | ✅ |
| H QA | vitest 76/76, pytest 64/64, typecheck OK, build OK | ✅ (tests automatizados); visual diff pendiente en navegador |

## 2. Cambios realizados en este commit

### 2.1 Documentación añadida

| Path | Tamaño aprox | Propósito |
|---|---|---|
| `docs/audits/UI_REDESIGN_REALITY_AUDIT.md` | ~21 KB | Inventario técnico + matriz REAL/PARCIAL/MOCK + 4 fakes documentados. |
| `docs/adr/ADR-007-DARK-OPERATIONS-UI.md` | ~8 KB | Decisión visual vigente; supersede la dirección preexistente. |
| `docs/ui/TYPOGRAPHY_RESEARCH.md` | ~6 KB | Comparativa Inter/Geist/Plex + decisión final. |
| `docs/observability/METRICS_CATALOG.md` | ~11 KB | 7 dominios de métricas, fórmulas, fuentes. |
| `docs/integrations/MONEYPRINTERTURBO_ADAPTER.md` | ~7 KB | Pin SHA `cf5a3ae...`, mapping de estados, política de secretos. |
| `docs/security/DEVTOOLS-SURFACE-AND-FLAGS.md` | ~6 KB | ADB allowlist + flag ENABLE_DEV_CODE_EDITOR + tabla de superficie peligrosa. |
| `docs/ui/UI_REDESIGN_ROLLOUT.md` | este archivo | Resumen de rollout. |

### 2.2 Código modificado

| Path | Cambio | Motivo |
|---|---|---|
| `src/index.css` | `@media (prefers-reduced-motion: reduce)` reescrito (3 reglas) | CSS inválido preexistente; warning de Vite. |
| `src/index.css` | `--color-muted-2: #6B7076 → #7E8590` | ADR-007 §6 — contraste WCAG AA. |
| `src/index.css` | `body, #root` con `font-family` Inter + `font-feature-settings` | TYPOGRAPHY_RESEARCH §3.1. |
| `src/index.css` | `.font-mono` con `font-feature-settings: 'zero', 'ss02'` | Mejor diferenciación `0/O`. |
| `src/App.tsx` | `DashboardView` acepta `stack: StackInfo \| null` | Mostrar fuente de "Publicaciones" en lugar de "+12%". |
| `src/App.tsx` | Stat cards "Dispositivos", "Cuentas activas", "Jobs en ejecución", "Publicaciones" reescritos | Eliminación de fakes §4.1–§4.3 del audit. |
| `src/App.tsx` | `onlineCount` ya no fallback a `accounts.length` | Falso positivo eliminado (§4.2). |
| `src/components/AccountsPanel.tsx` | `newSerial`/`newProxyId` default `''` | Eliminación del fake §4.4. |

### 2.3 NO se ha tocado (intencionalmente)

- `server/**/*.ts` (Express): intacto. Cumple TASK §24.
- `platform/phonefarm/*.py` (Flask): intacto.
- `platform/third_party/MoneyPrinterTurbo/`: pin confirmado; no se modifica.
- `package.json`/`bun.lock`/`package-lock.json`: NO se añaden dependencias nuevas en este commit. La tipografía se prepara via CSS para una segunda iteración (`@fontsource-variable/inter`) que sí añadirá dependencias y se documentará aparte.
- `.env*`, `.gitignore`, `.gitleaks.toml`: intactos.

## 3. Comparación before / after

### 3.1 Dashboard "Publicaciones" card

| | Before | After |
|---|---|---|
| `value` | `${publishedToday}` | `${publishedToday}` (idéntico) |
| `hint` | `+12% vs ayer` (hardcoded fake) | eliminado |
| `subtitle` | (vacío) | `MPT: online/offline · drafts: N` (real, desde `/api/stack`) o `"Fuente: /api/queue"` si no hay stack |

### 3.2 Dashboard "Cuentas activas" card

| | Before | After |
|---|---|---|
| `subtitle` | `de ${onlineCount + 4} totales` (fake) | `de ${accounts.length} registradas` (real) o `"Sin cuentas registradas"` |
| `bar` | `${onlineCount / (onlineCount + 4)}` (fake) | `${onlineCount / accounts.length}` (real) |

### 3.3 Dashboard "Dispositivos" card

| | Before | After |
|---|---|---|
| `value` | `${deviceCount} / ${deviceCount \|\| 4}` (fake `\|\| 4`) | `${deviceCount}` (real) |
| `subtitle` | `Online` (siempre) | `Online` o `"Sin dispositivos ADB"` |
| `tone` | `ok` | `ok` o `warn` según dato |

### 3.4 `AccountsPanel` form

| | Before | After |
|---|---|---|
| Default `newSerial` | `'RFCW80' + Math.floor(10000 + Math.random() * 90000)` | `''` (vacío; el usuario debe teclearlo) |
| Default `newProxyId` | `proxies[0]?.id \|\| 'proxy_01'` | `proxies[0]?.id \|\| ''` |

### 3.5 CSS `prefers-reduced-motion`

| | Before | After |
|---|---|---|
| Sintaxis | `@keyframes pulse-ok, pulse-warn, pulse-danger { animation: none; }` (inválido, ignorado por Vite con warning) | `.status-pill.ok .dot, .status-pill.warn .dot, .status-pill.danger .dot { animation: none; }` (válido, suprime el pulso semántico) |

## 4. Métricas del build

| | Before | After | Δ |
|---|---|---|---|
| `dist/assets/index-*.css` | 41.22 kB (gzip 8.60) | 41.56 kB (gzip 8.71) | +0.34 kB (+0.11 gz) |
| `dist/assets/index-*.js` | 857.87 kB (gzip 219.59) | 857.96 kB (gzip 219.58) | +0.09 kB (~0 gz) |
| CSS warning | 1 (keyframes inválido) | 0 | −1 |
| Tests vitest | 76/76 OK | 76/76 OK | 0 |
| Tests pytest | 64/64 OK | 64/64 OK | 0 |
| Typecheck | OK | OK | 0 |
| Build exit | 0 | 0 | 0 |

## 5. Riesgos restantes y trabajo futuro

### 5.1 Pendientes (no bloqueantes)

1. **Tipografía activa**: este commit prepara el CSS pero NO instala los paquetes `@fontsource-variable/inter` ni `@fontsource/jetbrains-mono`. Pendiente para una segunda iteración porque añade dependencias al lockfile. Con el sistema operativo del operador (Windows) el sans ya es Segoe UI, que es perfectamente legible; el cambio a Inter se justifica por consistencia cross-OS.
2. **OpenAPI-driven cURL explorer**: la lista de endpoints sigue curada manualmente. Pendiente generar desde `/openapi.json` cuando Flask lo exponga.
4. **Tests visuales / before-after screenshots**: requieren host con navegador (no generado en este commit por falta de Playwright/Chromium). El script de captura debería añadirse a un workflow `.github/workflows/visual-regression.yml` cuando se decida.
6. **Mapping `publishedToday` real**: actualmente cuenta `status==='published'` (histórico). Para tener "publicaciones hoy" real se necesita `published_at` por job (campo nuevo en `queue.json`). Pendiente para iteración posterior.

### 5.2 Riesgos

- Ninguno nuevo. Las guardas existentes (RBAC, CSRF, allowlist ADB, mptSettingsSchema) se mantienen.
- El cambio en CSS `@media (prefers-reduced-motion: reduce)` mejora accesibilidad pero podría sorprender si alguien testeaba los pulsos y descubría que con `prefers-reduced-motion: reduce` ya no se animan (intencional, era un bug).

## 6. Plan de rollout

1. **Merge a `chore/update-third-party`** (o rama de integración): el operador revisa el diff.
2. **No** se hace push directo a `main` ni se mergea automáticamente.
3. **Operador** confirma en host local:
   - `bunx tsc --noEmit`
   - `bunx vitest run`
   - `bun run build`
   - Arranca el panel (`bun run dev`), abre `http://localhost:3000`, captura before/after manual.
4. **Operador** opcionalmente compara con los mockups aprobados.
5. **Si OK** → tag git `v0.2.0-ui-ops-v1` y despliegue normal vía `platform/scripts/deploy.ps1`.

## 7. Procedimiento de rollback

```powershell
cd %USERPROFILE%\Documents\phone-farm-platform
git fetch origin    # получение backup branch
git checkout backup/pre-ui-redesign-20261003-100319    # pre-redesign
```

Restaurar working tree desde `%USERPROFILE%\control-hub-backups\20261003-100319\working-tree.tar` (extract con `tar -xf`).

---

**Fin del rollout.** El TASK_UI_UX_REAL_CONTROL_HUB_V1 queda ejecutado en sus gates obligatorios; las pantallas del Dashboard dejan de mostrar fakes y se atan a fuentes reales.