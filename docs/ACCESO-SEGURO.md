# Acceso seguro al panel — Phone Farm Platform

A partir del paso 2 de la remediación (2026-08-13), el servidor Express:

- **Escucha solo en `127.0.0.1`** (loopback). No se expone a LAN ni a Internet.
- **No arranca** sin `NODE_ENV` válido (`production|development|test`), sin passwords
  de panel fuertes (≥16 chars, sin valores conocidos) y sin `PHONE_FARM_INTERNAL_TOKEN`.
- Emite cookies de sesión `HttpOnly; Secure; SameSite=Strict` y una cookie CSRF de
  doble envío (`pf_csrf`) para todas las mutaciones (`X-CSRF-Token`).
- Valida `Origin`/`Referer` contra la allowlist (loopback + `PUBLIC_BASE_URL`).
- Aplica Helmet: CSP (con nonce), `X-Content-Type-Options`, `Referrer-Policy`,
  `frame-ancestors 'none'` y HSTS cuando el acceso público es HTTPS.

## Acceso local

```
http://127.0.0.1:3000
```

## Acceso remoto (predeterminado): Tailscale Serve HTTPS

El panel NO se publica con port-forwarding ni en el firewall. El acceso remoto
recomendado es [Tailscale Serve](https://tailscale.com/kb/1312/serve), que
expone HTTPS desde tu máquina a tu tailnet sin abrir puertos:

```powershell
# 1. Tailscale instalado y conectado
tailscale up

# 2. Servir el panel con HTTPS automático (certificado de Tailscale)
tailscale serve --bg https / http://127.0.0.1:3000

# 3. Ver la URL pública (https://<nombre>.ts.net)
tailscale serve status
```

Opcional — fijar la URL pública en `.env` para cookies/CSRF correctos:

```
PUBLIC_BASE_URL=https://<nombre-de-tu-maquina>.ts.net
COOKIE_SECURE=true        # (default: true)
```

### Si usas otro reverse proxy TLS (Caddy/nginx)

- El proxy debe terminar TLS y reenviar a `http://127.0.0.1:3000`.
- Configurar `PUBLIC_BASE_URL=https://<dominio>`.
- `app.set("trust proxy", "loopback")` ya confía solo en proxies de loopback
  (no acepta `X-Forwarded-*` arbitrarios).

## Qué NO se debe hacer

- `netstat -ano` verificará que Express escuche SOLO en `127.0.0.1:3000`
  (nunca `0.0.0.0:3000`).
- No añadir reglas de firewall entrantes para 3000/5000/5001/8080.
- No exponer MCP (:5001) ni MoneyPrinterTurbo (:8080) — sin auth propia (pasos 7/8).

## Bootstrap de credenciales

1. `powershell -ExecutionPolicy Bypass -File platform\scripts\setup-new-machine.ps1`
   — genera passwords fuertes + token interno si están vacíos.
2. `powershell -File platform\scripts\rotate-internal-secrets.ps1` — rota
   credenciales internas (muestra las nuevas del panel una sola vez).

## Verificación post-arranque

- `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/auth/me` → 200
- `netstat -ano | findstr :3000` → `127.0.0.1:3000 ... LISTENING` (nunca `0.0.0.0`)
