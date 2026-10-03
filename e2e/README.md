# E2E y regresión visual (TASK §27.4 / §27.5)

Ambos corren contra el **panel real**: `e2e/server.ts` levanta
`server/app.ts` (el mismo Express de producción) sirviendo el build real de
`dist/`. No hay mocks del panel: la sesión, el CSRF, el RBAC y el proxy a
Flask son los de verdad.

## Qué sustituye al backend en CI

| Pieza | En esta máquina | Sustituto en E2E | Razón |
|---|---|---|---|
| Express (panel) | real | **real** | es lo que se prueba |
| SQLite + usuarios | real | **real** (`test/helpers.seedDb`) | login/RBAC/CSRF reales |
| Flask (`platform/`) | no arrancado | stub HTTP en `:4174` | devuelve `[]`/`{...}` vacío o `503` explícito |
| MoneyPrinterTurbo | no arrancado | `mpt_online: false` real | la UI debe pintar el estado caído |
| ADB / scrcpy | no disponibles | sin dispositivos | la UI debe pintar el empty state |

El stub **no falsea respuestas**: devuelve listas vacías y errores `503` con un
mensaje explícito. Es exactamente el escenario que la UI tiene que saber
renderizar (`—`, `Sin datos`, `ErrorState` con reintento), así que el test
ejerita los estados de error de verdad, no un "todo verde" con datos de mentira.

## Comandos

```bash
npm run e2e:install     # una vez: descarga Chromium
npm run e2e             # build + los 4 viewports
npm run e2e:desktop     # solo 1440x900
npm run e2e:visual      # solo capturas + smoke responsive
```

## Viewports cubiertos

| Proyecto | Tamaño | Uso |
|---|---|---|
| `desktop-1440x900` | 1440×900 | baseline visual + E2E funcional |
| `wide-1920x1080` | 1920×1080 | baseline visual |
| `smoke-1366x768` | 1366×768 | smoke responsive |
| `mobile-390x844` | 390×844 | smoke responsive + overlay de navegación |

## Capturas

Se escriben en `docs/evidence/ui/` con el sufijo que se pase por CLI:

```bash
PW_SHOT_SUFFIX=after  npx playwright test e2e/visual.spec.ts
PW_SHOT_SUFFIX=before npx playwright test e2e/visual.spec.ts   # sobre el commit base
```

El nombre incluye el viewport, así que `before` y `after` son comparables
archivo a archivo sin convenciones extra.

## Contra la plataforma real

Si el operador tiene `platform/` (Flask) levantado, se puede apuntar el E2E al
backend real en lugar del stub:

```bash
$env:PW_USE_REAL_BACKEND = "http://127.0.0.1:5000"
npx playwright test --project=desktop-1440x900
```

`e2e/server.ts` respeta esa variable: si está definida, no levanta el stub y el
proxy real habla con la plataforma. Los tests que asumen backend vacío se
omiten en ese modo.
