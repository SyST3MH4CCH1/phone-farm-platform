# Image Dashboard — endpoint audit (03 Oct 2026, 09:51 UTC)

Verificación curl contra `http://127.0.0.1:4100` (Express proxy → Flask :5000).
Auth vía cookie `pf_session` (login admin) + CSRF `X-CSRF-Token` para mutaciones.

## Servicios activos

| Puerto | PID    | Proceso                                   |
|--------|--------|------------------------------------------|
| 4100   | 14228  | Express (proxy CSRF/RBAC + flask)        |
| 5000   | 14536  | Flask (`-m phonefarm.platform`)          |
| 5037   | 6732   | ADB                                      |

## /api/stats (con disk_percent nuevo)

```
$ curl -b pf-cookies http://127.0.0.1:4100/api/stats
{
  "acciones_hoy": 0,
  "active_proxies": 0,
  "bridge_config": { "adb_host": "127.0.0.1", "adb_port": 5037, ... },
  "cpu_percent": 100.0,
  "disk_percent": 81.4,       ← NUEVO (antes no existía)
  "errores": 0,
  "panda_grid_status": "Disconnected",
  "ram_percent": 75.7,
  "videos_subidos": 0
}
```

UI muestra `—` cuando el campo es null (caso `shutil.disk_usage` falla en
Windows sin permisos); el valor real (81.4 %) se renderiza como anillo verde.

## /api/events/recent (NUEVO)

```
$ curl -b pf-cookies 'http://127.0.0.1:4100/api/events/recent?limit=2'
{
  "count": 2,
  "events": [
    "2026-10-03 09:51:15,061 | INFO | werkzeug | GET /api/drafts 200",
    "2026-10-03 09:51:26,774 | INFO | werkzeug | GET /api/stats 200"
  ]
}
```

`limit` clampeado a [1, 500]; default 50. Línea de log por evento (no dict).

## PATCH /api/accounts/<id> (NUEVO)

```
$ curl -X PATCH -b pf-cookies -H "Content-Type: application/json" \
       -H "X-CSRF-Token: $csrf" \
       -d '{"status":"paused"}' http://127.0.0.1:4100/api/accounts/acc_02
{"id":"acc_02", "status":"paused", ...}

# Schema invalida (extra field "bar"):
{"error":"validación fallida","detail":[": Unrecognized key: \"bar\""]}

# Status fuera de enum:
{"error":"validación fallida","detail":["status: Invalid option: ..."]}

# Body vacío:
{"error":"validación fallida","detail":[": PATCH vacío: al menos uno de {status, enabled} requerido"]}
```

## Cuentas actualmente en disco (seed inalterado)

```
[
  {"id":"acc_01","username":"nicho_decoracion_01","status":"active", "device_serial":"ZY326WFTMQ", ...},
  {"id":"acc_02","username":"redmi_s2",          "status":"active", "device_serial":"489f214",     ...}
]
```

`acc_02` revertido a `active` tras la prueba (estado real conservado).

## Tests añadidos

| Suite             | Tests nuevos | Total ahora |
|-------------------|--------------|-------------|
| platform/tests/test_api_endpoints.py | 11 | 11 |
| test/dashboard-view.test.ts | 10 | 10 |
| **TOTAL**         | **21**       | —           |

| Métrica                | Antes | Ahora |
|------------------------|-------|-------|
| pytest                 | 53/53 | 64/64 |
| vitest                 | 66/66 | 76/76 |
| typecheck (tsc)        | 0     | 0     |
| vite build             | OK    | OK    |
| npm audit --omit=dev   | 0     | 0     |
| bandit (sev High)      | 0     | 0     |