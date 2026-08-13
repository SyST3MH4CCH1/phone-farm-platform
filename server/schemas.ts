// ---------------------------------------------------------------------------
// Esquemas de validación (zod) de los cuerpos que llegan al panel (paso 9):
// tipos estrictos, longitudes máximas y rechazo de CR/LF/NUL/`=` donde aplica.
// ---------------------------------------------------------------------------

import { z } from "zod";
import type { NextFunction, Request, Response } from "express";

const noControls = (v: string) => /[\x00-\x1f\x7f]/.test(v) ? false : true;
const configSafe = (v: string) => !/[\x00-\x1f\x7f=]/.test(v);

export const loginSchema = z.object({
  username: z.string().min(1).max(64).refine(noControls),
  password: z.string().min(1).max(512),
});

export const queueCreateSchema = z.object({
  keyword: z.string().min(1).max(200).refine(noControls),
  target_account: z.string().max(64).optional().default(""),
  niche_id: z.string().max(64).optional().default("general"),
  scheduled_time: z.string().max(64).optional().default(""),
  script: z.string().max(4000).optional().default(""),
  auto_approve: z.boolean().optional(), // paso 5: si llega true, Flask lo rechaza
}).strict();

export const accountCreateSchema = z.object({
  username: z.string().min(1).max(64).refine(noControls),
  password: z.string().min(1).max(512),
  device_serial: z.string().min(1).max(128).refine(noControls),
  proxy_id: z.string().max(64).optional().default(""),
  warmup_day: z.number().int().min(1).max(365).optional(),
}).strict();

export const proxyCreateSchema = z.object({
  host: z.string().min(1).max(253).refine(noControls),
  port: z.number().int().min(1).max(65535),
  provider: z.string().max(64).optional().default("DataImpulse"),
  type: z.string().max(16).optional().default("socks5"),
  user: z.string().max(128).optional().default(""),
  pass: z.string().max(512).optional().default(""),
  assigned_account: z.string().max(64).optional().default(""),
}).strict();

/** Config MPT editable (sin secretos): sin '=', sin controles, URL interna. */
export const mptSettingsSchema = z.object({
  mpt_api_url: z.string().max(200).refine(configSafe).optional(),
  llm_provider: z.string().max(16).refine(configSafe).optional(),
  voice_name: z.string().max(64).refine(configSafe).optional(),
  video_aspect: z.string().max(16).refine(configSafe).optional(),
  // secretos ya NO se editan por HTTP (paso 9): se rechazan explícitamente.
  pexels_api_key: z.never().optional(),
  minimax_api_key: z.never().optional(),
}).strict();

export const adbTouchSchema = z.object({
  serial: z.string().min(1).max(64).regex(/^[A-Za-z0-9._:-]+$/),
  action: z.enum(["tap", "swipe", "key"]).default("tap"),
  x: z.number().optional(),
  y: z.number().optional(),
  x2: z.number().optional(),
  y2: z.number().optional(),
  dur: z.number().min(50).max(2000).optional(),
  key: z.string().max(32).optional(),
}).strict();

export const adbMirrorSchema = z.object({
  serial: z.string().min(1).max(64).regex(/^[A-Za-z0-9._:-]+$/),
}).strict();

/** Middleware: valida req.body; 400 con detalle si falla. */
export function validate(schema: z.ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const detail = parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`);
      return res.status(400).json({ error: "validación fallida", detail });
    }
    req.body = parsed.data;
    next();
  };
}
