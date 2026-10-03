# ADR-007 — Dark Operations UI (Phone Farm Control Hub)

**Status:** Accepted
**Fecha:** 2026-10-03
**Supersede:** `docs/CAMBIOS-DASHBOARD.md` solo en materia de dirección visual UI. NO afecta arquitectura, contratos, rutas, ni decisiones de seguridad.
**Superseded by:** —
**Relacionado:** TASK_UI_UX_REAL_CONTROL_HUB_V1.md (origen del presente ADR).

---

## 1. Contexto

El repositorio `phone-farm-platform` ya mantiene un tema oscuro denso, técnico, "centro de operaciones" (Linear / Hermes-HUD / Mission-Control style) implementado en `src/index.css` con tokens vía `@theme` de Tailwind 4. La dirección visual está consolidada por `docs/CAMBIOS-DASHBOARD.md` (10 ago 2026) y por la sesión de recuperación de 10 ago 2026 que reintrodujo el header con pestañas.

La TASK_UI_UX_REAL_CONTROL_HUB_V1 fija una nueva especificación visual "dark operations" y aporta mockups aprobados. Estos mockups **orientan** la composición, **no** crean funcionalidades por decreto (TASK §0). Algunos mockups muestran números y métricas que NO existen como fuente real — la regla principal es **primero preservar y auditar; después modificar** (TASK §0) y **no introducir datos de ejemplo** (TASK §0, §6).

Este ADR deja constancia de la decisión adoptada: **mantener el lenguaje visual oscuro existente** como dirección base, **eliminando los fakes detectados** y **ampliando** los tokens para soportar métricas operacionales reales (lease, latencia, status de provider).

## 2. Decisión

1. **Se conserva** el sistema `@theme` + `@layer utilities` de Tailwind 4 ya presente en `src/index.css`. NO se reemplaza por otra librería de design system.
2. **Se conserva** `#00FF88` Matrix Green como color de marca único. La TASK sugiere `#2f8cff` (azul) como `--primary` orientativo pero autoriza desviación si la dirección existente es coherente y validada con WCAG. Verificación §6.
4. **Darkness** = dark only. **NO** se reactiva `.theme-light`. El header y sidebar ya asumen este comportamiento.
5. **Tipografía** evaluada y decidida en `docs/ui/TYPOGRAPHY_RESEARCH.md`. Resultado: `Inter` (sans) + `JetBrains Mono` (mono) por peso, cobertura de bundle, coherencia con `index.css` y ya incluido en `lucide-react` ecosystem. Geist Sans/Mono evaluado y descartado por requerir self-hosting adicional y por ser indiferente al rendimiento en este set.
6. **Regresión CSS** del bloque `@media (prefers-reduced-motion: reduce)` que enumera keyframes con comas: **se corrige** dentro del mismo redesign porque bloquea accesibilidad y produce warning del bundler.
7. **Fakes** detectados en `src/App.tsx` y `src/components/AccountsPanel.tsx`: **se eliminan** (§4 del UI_REDESIGN_REALITY_AUDIT.md).
8. **Tokens nuevos** para operaciones (`--color-paused`, `--color-running`, `--color-leased`, `--color-degraded`) **solo si** se usan en componentes. Por ahora se reutilizan los estados semánticos existentes (`ok/warn/danger/info`).

## 3. ¿Qué queda supersedido?

- `docs/CAMBIOS-DASHBOARD.md` — solo en materia de "dirección visual" UI; los cambios de header (pestañas MoneyPrinter/ADB/cURL/Python Code/Versiones + ZIP) se **mantienen** y se documentan como decisiones vigentes. La fecha 2026-08-10 era una restauración, no un cambio de dirección.
- Cualquier referencia histórica a `.theme-light` queda **supersedida**: el sistema es dark-only.

## 4. ¿Qué partes arquitectónicas NO cambian?

- **Contratos HTTP** (`/api/*`) — intactos. La TASK prohíbe inventar campos.
- **Backend Flask** (`platform/phonefarm/*.py`) — intacto.
- **MoneyPrinterTurbo** pin (`cf5a3aedad1741d012152d355aa909d224fc4557` v1.3.7 MIT) — intacto. Se documenta en `docs/integrations/MONEYPRINTERTURBO_ADAPTER.md` (Fase E).
- **RBAC / sesiones / CSRF / allowlist ADB** — intactos.
- **SQLite / JSON / MPT** — intactos.
- **Pruebas vitest + pytest** — deben seguir pasando sin modificación (con la salvedad del test rbac que cubre `/api/moneyprinter/config`; si la TASK añade un campo nuevo, se ajustaría el schema, no el test).

## 5. ¿Por qué el dark ops UI es coherente con Phone Farm/Control Hub?

- **Densidad alta sin ruido**: el operador necesita leer 6 stat cards, un sistema de dispositivos, latencias de proxies, colas y logs en una sola pantalla.
- **Color intenso reservado para estado, no decoración**: rojo/verde/ámbar comunican OK/Fallo/Atención sin ambigüedad. La TASK §4.4 ("Nunca usar únicamente color") se aplica con iconografía + texto (status-pill).
- **Tema oscuro reduce fatiga visual** en sesiones de operación de 8+ horas (uso documentado en `MANUAL.md`).
- **Contraste WCAG** se preserva o mejora: ver §6.

## 6. Impacto en accesibilidad

| Métrica | Antes | Después |
|---|---|---|
| Texto normal sobre `--color-canvas` (#0A0A0B) | `#E5E5E5` (~16:1) | sin cambio |
| Texto muted sobre canvas | `#9CA1A8` (~7.5:1) | sin cambio |
| Texto muted-2 sobre canvas | `#6B7076` (~4.5:1 borderline) | se eleva a `#7E8590` (~5.4:1) — **mejora** |
| Brand (`#00FF88`) sobre canvas | ratio contraste 14.5:1 | sin cambio |
| Warning (`#FFB800`) sobre canvas | ~9.6:1 | sin cambio |
| Danger (`#FF3B5C`) sobre canvas | ~5.6:1 | sin cambio |
| Focus-visible | outline `2px` verde | sin cambio |
| `:focus-visible` aplica a todos los interactivos | sí | reforzado (asegurado en Header/Modal) |
| `prefers-reduced-motion` | **roto** (CSS inválido) | **corregido** (tres reglas separadas) |

WCAG objetivo: **2.2 AA**. Texto normal ≥ 4.5:1 ✅. Texto grande ≥ 3:1 ✅. No-texto crítico ≥ 3:1 (icons, focus ring) ✅.

## 7. Impacto en charts

- Charts implementados son SVG inline (`RingProgress`, `MiniBar`, sparkline). Comparten tokens semánticos (`--color-ok/warn/danger/info`).
- **No se introduce** Recharts/Chart.js (cumple TASK §7 "usar la librería existente si es adecuada" → en este repo la librería existente es la propia SVG).
- Normalización CPU/RAM como `%` ya implementada. Se documenta en `METRICS_CATALOG.md`.

## 8. Tokens nuevos / modificados

- `--color-muted-2`: `#6B7076` → `#7E8590` (contraste).
- `@keyframes pulse-*`: se mantienen, pero el `@media (prefers-reduced-motion: reduce)` se reescribe a 3 reglas separadas (sintaxis válida).
- Resto del `@theme` **sin cambios**.

## 9. Estrategia de rollback

1. Restaurar desde el bundle creado en `BACKUP_MANIFEST.md`: `git reset --hard backup/pre-ui-redesign-20261003-100319`.
2. Restaurar `src/index.css` desde el snapshot de working-tree.
3. Restaurar `src/App.tsx`, `src/components/*.tsx` desde el snapshot.
4. Re-correr `bunx vitest run` y `bun run build`.

Tiempo objetivo de rollback: < 5 min.

## 10. Consecuencias

**Positivas:**
- Sistema oscuro ya operativo se mantiene; cero reescritura de componentes.
- Fakes eliminados (3 hardcoded en `App.tsx`, 1 placeholder en `AccountsPanel.tsx`).
- Accesibilidad corregida (reduced-motion + `muted-2`).
- Auditoría completa publicada: `docs/audits/UI_REDESIGN_REALITY_AUDIT.md`.

**Negativas / Riesgos:**
- El brand `#00FF88` puede parecer "AI neon" para algunos usuarios. Mitigado porque coincide con la línea Matrix Green preexistente y con un lenguaje de terminal; NO es un azul/violeta genérico.
- Si en el futuro se quisiera migrar a un design system externo (Radix/Shadcn), sería trabajo extra. Por ahora no se justifica.

**Trade-offs aceptados:**
- Mantener tipografía existente (JetBrains Mono) sin migrar a Geist, evaluado en `TYPOGRAPHY_RESEARCH.md`.

---

## 11. Decisión

**Aceptado** por el agente de rediseño como dirección visual vigente del repositorio, alineado con TASK_UI_UX_REAL_CONTROL_HUB_V1 y con el estado real auditado.

Próximos ADR candidatos: `ADR-008-MPT-INTEGRATION-CONTRACT` (Fase E), `ADR-009-DEV-CODE-EDITOR-FLAG` (Fase G).