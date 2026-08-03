# Integración MCP con los agentes de esta máquina

El servidor de la Phone Farm expone **15 tools MCP** en `http://127.0.0.1:3000/mcp` (Streamable HTTP, requiere autenticación). Esta guía muestra cómo conectarla a las herramientas de agentes instaladas localmente.

> Requisito: el servidor corriendo (`bun run dev`) y un token de sesión válido
> (`curl -X POST /api/auth/login -d '{"username":"admin","password":"..."}'` → campo `user.token`).

## 1. Codex CLI (+ oh-my-codex)

Configura el MCP server en `~/.codex/config.toml`:

```toml
[mcp_servers.phone-farm]
command = "sh"
args = ["-c", "curl -s -X POST http://127.0.0.1:3000/mcp -H 'Content-Type: application/json' -H 'Authorization: Bearer <TOKEN>' -H 'Accept: application/json, text/event-stream' -d @-"]
env = { }
```

Luego, en cualquier sesión de Codex (o dentro de un workflow de oh-my-codex como `$team`):

> "Añade el trabajo 'recetas faciles 5 minutos' a la cola de la phone farm y genera un vídeo con MoneyPrinterTurbo."

Codex resolverá `create_job` → `generate_video` contra la farm.

## 2. OpenCode (+ plugin opencode-kilo-auth)

En `~/.config/opencode/opencode.json` (o `opencode.json` del proyecto):

```json
{
  "mcp": {
    "phone-farm": {
      "type": "remote",
      "url": "http://127.0.0.1:3000/mcp",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer <TOKEN>"
      }
    }
  }
}
```

El plugin kilo-auth no interfiere: la farm es una *herramienta* (no un modelo), así que puede operarla cualquier provider, incluido el gateway Kilo.

## 3. headroom (compresión de contexto)

headroom sirve para reducir tokens del contexto del agente. La farm devuelve JSON verbosos (`list_accounts`, `get_logs`); pásalos por el MCP de headroom antes de inyectarlos en el prompt:

```bash
headroom compress --stdin < (curl -s -H "Authorization: Bearer <TOKEN>" http://127.0.0.1:3000/api/accounts)
```

## 4. ponytail (skills de agentes)

Ponytail enseña a los agentes a escribir soluciones mínimas. La regla aplica directamente a la farm: usa `create_job` para encolar, y deja que `process_next_job` haga el trabajo — no generes pipelines paralelos dentro del agente.

## 5. ZCode / Claude Desktop / Cursor

| Cliente | Config |
|---|---|
| **ZCode** | `zcode config` → MCP servers → `http://127.0.0.1:3000/mcp` + header `Authorization: Bearer <TOKEN>` |
| **Claude Desktop** | `claude_desktop_config.json` → `"mcpServers": {"phone-farm": {"url": "http://127.0.0.1:3000/mcp", "headers": {"Authorization": "Bearer <TOKEN>"}}}` |
| **Cursor** | Settings → MCP → Add → `http://127.0.0.1:3000/mcp` + headers |

## 6. Flujos sugeridos

1. **Pipeline de contenido:** `create_job(keyword)` → `process_next_job()` → `get_stats()` (verificar `videos_subidos`).
2. **Operación de cuentas:** `list_accounts()` → `start_bot(account_id)` / `stop_bot(account_id)`.
3. **Diagnóstico:** `get_logs(limit=50)` → `verify_proxy(proxy_id)` → `get_bridge_config()`.
4. **Supervisión:** `get_stats()` cada N minutos (compatible con headroom para contexto compacto).

## Verificación rápida

```bash
# Handshake MCP completo (con el server corriendo):
curl -s -X POST http://127.0.0.1:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
