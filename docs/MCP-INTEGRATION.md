# Integración MCP con los agentes de esta máquina

El servidor de la Phone Farm expone **15 tools MCP** en
`http://127.0.0.1:5001/mcp` (Streamable HTTP, **autenticación Bearer
obligatoria** — paso 7 de la remediación 2026-08-13). El panel Express :3000
NO expone MCP: este servidor vive en Flask (uvicorn :5001) y solo se enciende
con `MCP_ENABLED=1` (por defecto está desactivado).

## 1. Crear un token de servicio (solo se muestra UNA vez)

```powershell
# scopes: read, queue.write, engagement, approve, publish, admin
platform\.venv\Scripts\python.exe -m phonefarm.mcp_tokens create `
  --name agente-1 --scopes read,queue.write --expires-days 30
```

- En la BD solo se guarda el **hash** del token.
- Revocar: `python -m phonefarm.mcp_tokens revoke --name agente-1`
- Listar: `python -m phonefarm.mcp_tokens list`
- Sin token válido → 401; sin scope → 403; rate limit 60 llamadas/min por token.

## 2. Conectar un agente (Codex)

Configura el MCP server en `~/.codex/config.toml`:

```toml
[mcp_servers.phone-farm]
command = "curl"
args = ["-s", "-X", "POST", "http://127.0.0.1:5001/mcp",
        "-H", "Content-Type: application/json",
        "-H", "Authorization: Bearer <TOKEN>",
        "-H", "Accept: application/json, text/event-stream", "-d", "@-"]
```

## 3. Scopes por tool (resumen)

| Scope | Tools |
|---|---|
| `read` | list_jobs, get_drafts, get_stats, list_accounts, list_proxies, list_content_profiles, get_logs |
| `queue.write` | create_content_job, reject_job, create_content_profile, generate_script_preview |
| `approve` | approve_job |
| `publish` | publish_job (exige estado ready_for_publish) |
| `engagement` | start_bot, stop_bot |

Toda llamada queda registrada en la auditoría encadenada (`mcp.<tool>`).

## 4. Notas

- El pipeline **no tiene auto_approve**: todo job pasa por revisión humana y la
  publicación exige `ready_for_publish` (un operador lo marca desde el panel).
- `get_logs` devuelve logs **sanitizados** (redactor central).
- Habilitar el servidor: `MCP_ENABLED=1` en `platform/.env` (o compose) y
  reiniciar el stack.
