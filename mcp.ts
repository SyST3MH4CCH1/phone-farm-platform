// ---------------------------------------------------------------------------
// MCP server (Model Context Protocol, Streamable HTTP) para la Phone Farm.
// Expone las operaciones de cuentas, cola, proxies y MoneyPrinterTurbo para
// que agentes (Claude, Codex, OpenCode, ZCode, etc.) puedan operar la granja.
//
// Endpoint: POST/GET/DELETE /mcp  (requiere sesión — cookie o Bearer token)
// ---------------------------------------------------------------------------

import { randomUUID } from "crypto";
import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { FarmEngine } from "./farm-engine";

const SERVER_NAME = "phone-farm";
const SERVER_VERSION = "0.1.0";

interface ToolDef {
  name: string;
  description: string;
  properties: Record<string, { type: string; description: string }>;
  required?: string[];
  handler: (args: Record<string, any>) => Promise<unknown> | unknown;
}

function tool(def: ToolDef): ToolDef {
  return def;
}

export function setupMcp(app: express.Express, engine: FarmEngine): void {
  const tools: ToolDef[] = [
    tool({
      name: "get_stats",
      description: "Métricas globales de la Phone Farm: vídeos subidos, acciones de hoy, errores, bots activos, proxies online, CPU/RAM.",
      properties: {},
      handler: () => engine.getStats()
    }),
    tool({
      name: "list_accounts",
      description: "Lista las cuentas registradas en la granja (sin contraseñas).",
      properties: {},
      handler: () => engine.listAccounts()
    }),
    tool({
      name: "create_account",
      description: "Registra una nueva cuenta de red social en la granja.",
      properties: {
        username: { type: "string", description: "Nombre de usuario de la cuenta" },
        password: { type: "string", description: "Contraseña (solo mock local)" },
        device_serial: { type: "string", description: "Serial ADB del dispositivo (ej: RFCW80XXXXX o IP:5555)" },
        proxy_id: { type: "string", description: "ID del proxy asignado" },
        warmup_day: { type: "number", description: "Día de warmup (1 = recién creada)" }
      },
      handler: (args) => engine.createAccount(args)
    }),
    tool({
      name: "delete_account",
      description: "Elimina una cuenta de la granja por su ID.",
      properties: { id: { type: "string", description: "ID de la cuenta (ej: acc_01)" } },
      required: ["id"],
      handler: (args) => {
        const ok = engine.deleteAccount(args.id);
        if (!ok) throw new Error(`Cuenta no encontrada: ${args.id}`);
        return { success: true, id: args.id };
      }
    }),
    tool({
      name: "start_bot",
      description: "Inicia el bot de engagement (taktik-bot) en la cuenta indicada.",
      properties: { account_id: { type: "string", description: "ID de la cuenta" } },
      required: ["account_id"],
      handler: (args) => {
        const r = engine.toggleBot(args.account_id, true);
        if (!r) throw new Error(`Cuenta no encontrada: ${args.account_id}`);
        return r;
      }
    }),
    tool({
      name: "stop_bot",
      description: "Detiene el bot de engagement en la cuenta indicada.",
      properties: { account_id: { type: "string", description: "ID de la cuenta" } },
      required: ["account_id"],
      handler: (args) => {
        const r = engine.toggleBot(args.account_id, false);
        if (!r) throw new Error(`Cuenta no encontrada: ${args.account_id}`);
        return r;
      }
    }),
    tool({
      name: "list_proxies",
      description: "Lista los proxies configurados en la granja.",
      properties: {},
      handler: () => engine.listProxies()
    }),
    tool({
      name: "verify_proxy",
      description: "Prueba la conectividad real de un proxy (resuelve IP pública).",
      properties: { proxy_id: { type: "string", description: "ID del proxy" } },
      required: ["proxy_id"],
      handler: async (args) => {
        const p = await engine.verifyProxy(args.proxy_id);
        if (!p) throw new Error(`Proxy no encontrado: ${args.proxy_id}`);
        return p;
      }
    }),
    tool({
      name: "list_queue",
      description: "Lista la cola de trabajos (generación/publicación de vídeos).",
      properties: {},
      handler: () => engine.listQueue()
    }),
    tool({
      name: "create_job",
      description: "Añade un trabajo a la cola de generación de contenido.",
      properties: {
        keyword: { type: "string", description: "Keyword/nicho para el vídeo (ej: decoracion sala moderna)" },
        target_account: { type: "string", description: "ID de la cuenta destino" }
      },
      handler: (args) => engine.createJob(args.keyword, args.target_account)
    }),
    tool({
      name: "process_next_job",
      description: "Procesa el siguiente trabajo pendiente: genera guión con Gemini y simula la publicación del Reel.",
      properties: {},
      handler: () => engine.processNextJob()
    }),
    tool({
      name: "generate_video",
      description: "Ejecuta el pipeline MoneyPrinterTurbo: guión IA + vídeo 9:16 + TTS y lo inyecta a la cola.",
      properties: {
        keyword: { type: "string", description: "Keyword/nicho para el vídeo" },
        target_account: { type: "string", description: "ID de la cuenta destino" },
        custom_prompt: { type: "string", description: "Guión personalizado (opcional, omite Gemini)" },
        video_aspect: { type: "string", description: "Aspecto del vídeo: 9:16, 16:9 o 1:1" },
        voice_name: { type: "string", description: "Voz TTS (ej: es-ES-AlvaroNeural)" }
      },
      handler: (args) => engine.generateVideo(args)
    }),
    tool({
      name: "get_moneyprinter_config",
      description: "Devuelve la configuración actual del motor MoneyPrinterTurbo.",
      properties: {},
      handler: () => engine.getMoneyPrinterConfig()
    }),
    tool({
      name: "get_bridge_config",
      description: "Devuelve la configuración del bridge ADB / Mini PC Flask.",
      properties: {},
      handler: () => engine.getBridgeConfig()
    }),
    tool({
      name: "get_logs",
      description: "Devuelve los últimos logs del sistema.",
      properties: {
        limit: { type: "number", description: "Número máximo de logs (por defecto 100)" }
      },
      handler: (args) => engine.getLogs(Number(args.limit) || 100)
    })
  ];

  const sessionServer = (): Server => {
    const server = new Server(
      { name: SERVER_NAME, version: SERVER_VERSION },
      { capabilities: { tools: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: {
          type: "object",
          properties: t.properties,
          required: t.required || []
        }
      }))
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const t = tools.find((x) => x.name === request.params.name);
      if (!t) {
        return {
          content: [{ type: "text", text: `Tool desconocido: ${request.params.name}` }],
          isError: true
        };
      }
      try {
        const result = await t.handler((request.params.arguments as Record<string, any>) || {});
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: false
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error: ${err?.message || String(err)}` }],
          isError: true
        };
      }
    });

    return server;
  };

  // Sesiones activas: sessionId -> { server, transport }
  const sessions = new Map<string, { server: Server; transport: StreamableHTTPServerTransport }>();

  // CORS mínimo para clientes MCP externos (agentes remotos).
  const mcpCors = (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id");
    if (_req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  };

  app.post("/mcp", mcpCors, async (req, res) => {
    const sessionId = typeof req.headers["mcp-session-id"] === "string" ? req.headers["mcp-session-id"] : undefined;
    let session = sessionId ? sessions.get(sessionId) : undefined;

    if (!session) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          sessions.set(sid, { server, transport });
        }
      });
      const server = sessionServer();
      transport.onclose = () => {
        sessions.delete(transport.sessionId || sessionId || "");
      };
      await server.connect(transport);
      session = { server, transport };
      // Sin header de sesión: si la petición no es `initialize`, el transporte
      // responderá 400/404 por sí mismo (modo stateful).
    }

    await session.transport.handleRequest(req, res, req.body);
  });

  app.get("/mcp", mcpCors, async (req, res) => {
    const sessionId = typeof req.headers["mcp-session-id"] === "string" ? req.headers["mcp-session-id"] : undefined;
    const session = sessionId ? sessions.get(sessionId) : undefined;
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    await session.transport.handleRequest(req, res);
  });

  app.delete("/mcp", mcpCors, async (req, res) => {
    const sessionId = typeof req.headers["mcp-session-id"] === "string" ? req.headers["mcp-session-id"] : undefined;
    const session = sessionId ? sessions.get(sessionId) : undefined;
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    await session.transport.close();
    sessions.delete(sessionId!);
    res.status(200).json({ ok: true });
  });

  engine.addLog("INFO", "MCPServer", `MCP server listo en /mcp (${tools.length} tools: ${tools.map((t) => t.name).join(", ")})`);
}
