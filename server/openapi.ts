// ---------------------------------------------------------------------------
// OpenAPI generado desde el router REAL de Express (TASK §16).
//
// No hay una lista curada a mano de endpoints: el documento se construye
// recorriendo `app._router.stack`, de modo que cualquier ruta que exista en el
// panel aparece en el explorador cURL y cualquier ruta eliminada desaparece.
//
// De cada ruta se derivan hechos observables del cableado real:
//   - método y path              -> layer.route.methods / layer.route.path
//   - parámetros de path         -> `:id`, `:serial`, ...
//   - esquema del body           -> tag __chBodySchema (middleware `validate`)
//   - sesión requerida           -> tag __chRequiresAuth (middleware requireAuth)
//   - rol requerido              -> tag __chRequiresRole (middleware requireRole)
//   - CSRF requerido             -> tag __chRequiresCsrf (middleware csrfProtect)
//   - rate limit de coste        -> tag __chRateLimited (middleware costLimit)
//   - prefijo protegido          -> tag __chMountPrefix (appGuarded)
//
// NO se inventan esquemas de respuesta: los endpoints proxied a Flask
// reenvían el JSON real, así que la respuesta se declara sin `schema`.
// ---------------------------------------------------------------------------

import type express from "express";
import { z } from "zod";
import { SESSION_COOKIE } from "./sessions";

export const CSRF_HEADER = "X-CSRF-Token";

type Tagged = {
  __chBodySchema?: z.ZodTypeAny;
  __chRequiresAuth?: boolean;
  __chRequiresRole?: string;
  __chRequiresCsrf?: boolean;
  __chRateLimited?: boolean;
  __chMountPrefix?: string;
};

export interface RouteFacts {
  method: string;
  path: string;
  operationId: string;
  tags: string[];
  summary: string;
  parameters: { name: string; required: boolean; in: string; schema: Record<string, unknown> }[];
  requestBody: { required: boolean; content: Record<string, unknown> } | null;
  security: Record<string, string[]>[];
  rateLimited: boolean;
  hasValidator: boolean;
  role: string | null;
}

/**
 * Registra middleware con prefijo y marca los handlers para que la
 * introspección sepa que ese prefijo está protegido. Sustituye a `app.use`
 * directo solo para los montajes de protección (no cambia el comportamiento).
 */
export function appGuarded(
  app: express.Express,
  prefix: string,
  ...handlers: express.RequestHandler[]
): express.Express {
  // Envoltorio POR MONTAJE: requireAuth se reutiliza en varias rutas, así que
  // el prefijo debe vivir en una copia, no mutar el middleware compartido
  // (si no, /api/auth/logout heredaría el prefijo /videos).
  for (const original of handlers) {
    const source = original as Tagged;
    const wrapped: express.RequestHandler = (req, res, next) => original(req, res, next);
    const t = wrapped as Tagged;
    t.__chRequiresAuth = source.__chRequiresAuth;
    t.__chRequiresRole = source.__chRequiresRole;
    t.__chRequiresCsrf = source.__chRequiresCsrf;
    t.__chRateLimited = source.__chRateLimited;
    t.__chBodySchema = source.__chBodySchema;
    t.__chMountPrefix = prefix;
    app.use(prefix, wrapped);
  }
  return app;
}

/** Etiqueta un middleware individual (requireAuth, requireRole, csrfProtect…). */
export function tag<T extends express.RequestHandler>(fn: T, facts: Tagged): T {
  Object.assign(fn as Tagged, facts);
  return fn;
}

const TAGS: { prefix: string; name: string; description: string }[] = [
  { prefix: "/api/auth", name: "auth", description: "Sesión del panel (cookie HttpOnly + CSRF)." },
  { prefix: "/api/accounts", name: "accounts", description: "Cuentas sociales y su vínculo con proxy/dispositivo." },
  { prefix: "/api/proxies", name: "proxies", description: "Proxies, credenciales y verificación de salida." },
  { prefix: "/api/queue", name: "queue", description: "Pipeline de jobs: guion, render, aprobación y publicación." },
  { prefix: "/api/drafts", name: "drafts", description: "Drafts generados a partir de previews." },
  { prefix: "/api/content", name: "content", description: "Generación de guion/caption con LLM y perfiles de contenido." },
  { prefix: "/api/moneyprinter", name: "moneyprinter", description: "MoneyPrinterTurbo vía adapter (Flask aislado)." },
  { prefix: "/api/adb", name: "adb", description: "Puente ADB: inventario, screenshot y toque. Sin shell." },
  { prefix: "/api/source", name: "dev", description: "Lectura de código fuente del panel (solo lectura)." },
  { prefix: "/api/events", name: "observability", description: "Eventos y logs del panel." },
  { prefix: "/api/logs", name: "observability", description: "Historial de logs y stream SSE." },
  { prefix: "/api/stream", name: "observability", description: "Server-Sent Events en vivo." },
  { prefix: "/api/stack", name: "system", description: "Estado del stack: contenedores, MPT, Flask, git SHA." },
  { prefix: "/api/stats", name: "system", description: "Métricas agregadas reales del backend." },
  { prefix: "/api/backups", name: "system", description: "Exportación de backup del panel." },
  { prefix: "/api/download-zip", name: "system", description: "Descarga de artefactos de sesión." },
  { prefix: "/healthz", name: "system", description: "Liveness del panel." },
  { prefix: "/readyz", name: "system", description: "Readiness: panel + Flask + MPT." },
  { prefix: "/videos", name: "system", description: "Artefactos de video ya generados." },
];

function tagsFor(path: string): string[] {
  const hit = TAGS.filter((t) => path === t.prefix || path.startsWith(`${t.prefix}/`));
  return hit.length ? Array.from(new Set(hit.map((t) => t.name))) : ["other"];
}

function humanize(path: string, method: string): string {
  const rest = path.replace(/^\/api\//, "").replace(/:([A-Za-z_]+)/g, "{$1}");
  const verb =
    method === "GET" ? "Consultar" :
    method === "POST" ? "Crear/accionar" :
    method === "PATCH" ? "Actualizar" :
    method === "PUT" ? "Reemplazar" :
    method === "DELETE" ? "Eliminar" : method;
  return `${verb} ${rest === "" ? "/" : rest}`;
}

function operationIdFor(method: string, path: string): string {
  const cleaned = path
    .replace(/^\//, "")
    .split("/")
    .map((seg) =>
      seg.startsWith(":")
        ? "By" + seg.slice(1).charAt(0).toUpperCase() + seg.slice(2)
        : seg.replace(/[^A-Za-z0-9]+(.)/g, (_m, c: string) => c.toUpperCase())
    )
    .join("");
  return method.toLowerCase() + cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

const HTTP_METHODS = ["get", "post", "patch", "put", "delete"] as const;

type Guard = { prefix: string; auth: boolean; csrf: boolean };

function covers(guard: Guard, path: string): boolean {
  return path === guard.prefix || path.startsWith(`${guard.prefix}/`);
}

/**
 * Recorre el stack respetando el ORDEN de registro: un guard montado con
 * `appGuarded(app, "/api", requireAuth, csrfProtect)` protege a todas las rutas
 * declaradas después en el mismo stack, igual que en runtime.
 */
function walk(stack: any[], activeGuards: Guard[], acc: RouteFacts[]) {
  for (const layer of stack ?? []) {
    if (layer?.route) {
      const rawPath: string = layer.route.path;
      if (rawPath === "*" || rawPath === "/*" || rawPath === "/*splat") continue;
      for (const method of HTTP_METHODS) {
        if (!layer.route.methods?.[method]) continue;
        const handlers: Tagged[] = (layer.route.stack ?? []).map((s: any) => s.handle);
        const path: string = layer.route.path;

        // csrfProtect solo exige token en mutaciones: hace short-circuit para
        // GET/HEAD/OPTIONS. El documento replica esa semántica real.
        const isMutation = !["get", "head", "options"].includes(method);
        const requiresAuth = handlers.some((h) => h?.__chRequiresAuth) || activeGuards.some((g) => g.auth && covers(g, path));
        const requiresCsrf = isMutation && (
          handlers.some((h) => h?.__chRequiresCsrf) || activeGuards.some((g) => g.csrf && covers(g, path))
        );
        const role = handlers.find((h) => h?.__chRequiresRole)?.__chRequiresRole;
        const bodySchema = handlers.find((h) => h?.__chBodySchema)?.__chBodySchema;
        const rateLimited = handlers.some((h) => h?.__chRateLimited);

        const security: Record<string, string[]>[] = [];
        if (requiresAuth || role) security.push({ sessionCookie: [] });
        if (requiresCsrf) security.push({ csrfHeader: [] });

        const pathParams = [...path.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]);

        let requestBody: RouteFacts["requestBody"] = null;
        if (bodySchema) {
          // z.toJSONSchema es la API nativa de Zod 4: el esquema del documento
          // es el MISMO objeto que valida el request en runtime.
          const json = z.toJSONSchema(bodySchema, { io: "input", unrepresentable: "any" });
          delete (json as Record<string, unknown>).$schema;
          requestBody = { required: true, content: { "application/json": { schema: json } } };
        }

        const fact: RouteFacts = {
          method: method.toUpperCase(),
          path: path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, "{$1}"),
          operationId: operationIdFor(method, path),
          tags: tagsFor(path),
          summary: humanize(path, method.toUpperCase()),
          parameters: pathParams.map((name) => ({
            name,
            required: true,
            in: "path",
            schema: { type: "string" },
          })),
          requestBody,
          security,
          rateLimited,
          hasValidator: !!bodySchema,
          role: role ?? null,
        };
        acc.push(fact);
      }
      continue;
    }

    const handle = layer?.handle;
    if (typeof handle === "function" && handle.__chMountPrefix) {
      activeGuards.push({
        prefix: handle.__chMountPrefix,
        auth: !!handle.__chRequiresAuth,
        csrf: !!handle.__chRequiresCsrf,
      });
    } else if (handle?.stack) {
      walk(handle.stack, activeGuards, acc);
    }
  }
}

export function buildOpenApiDocument(
  app: express.Express,
  opts: { publicBaseUrl: string; version: string; title?: string },
): Record<string, unknown> {
  const acc: RouteFacts[] = [];
  const rootStack = (app as any)._router?.stack ?? [];
  walk(rootStack, [], acc);

  const paths: Record<string, Record<string, unknown>> = {};
  for (const f of acc) {
    if (f.path === "/api/openapi.json") continue;
    const entry = (paths[f.path] ??= {});
    const responses: Record<string, unknown> = {};
    if (f.requestBody) {
      responses["400"] = { description: "Validación fallida (esquema Zod real del panel)." };
    }
    if (f.security.length) responses["401"] = { description: "Sin sesión válida." };
    if (f.security.some((s) => s.sessionCookie)) {
      if (f.role) responses["403"] = { description: `Requiere rol ${f.role}.` };
    }
    if (f.rateLimited) responses["429"] = { description: "Rate limit de coste excedido." };
    // Sin schema de respuesta: el backend real (Flask/MPT) decide el cuerpo.
    responses["200"] = { description: "Respuesta real del backend (sin esquema declarado)." };

    entry[f.method.toLowerCase()] = {
      operationId: f.operationId,
      summary: f.summary,
      tags: f.tags,
      ...(f.parameters.length ? { parameters: f.parameters } : {}),
      ...(f.requestBody ? { requestBody: f.requestBody } : {}),
      security: f.security,
      responses,
      "x-panel-role": f.role,
      "x-panel-validated": f.hasValidator,
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: opts.title ?? "Control Hub / Phone Farm — Panel API",
      version: opts.version,
      description:
        "Documento GENERADO desde el router real de Express y los esquemas Zod reales del panel. " +
        "No hay catálogo mantenido a mano: si una ruta no aparece aquí, no existe en el servidor.",
      "x-generated-from": "express app._router.stack + server/schemas.ts",
    },
    servers: [{ url: opts.publicBaseUrl }],
    tags: TAGS.map((t) => ({ name: t.name, description: t.description })),
    components: {
      securitySchemes: {
        sessionCookie: { type: "apiKey", in: "cookie", name: SESSION_COOKIE },
        csrfHeader: { type: "apiKey", in: "header", name: CSRF_HEADER },
      },
    },
    paths,
  };
}
