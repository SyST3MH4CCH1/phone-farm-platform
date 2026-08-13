// ---------------------------------------------------------------------------
// Configuración central del servidor Express. Única fuente de lectura de env
// (excepto dotenv.config() en el bootstrap). `loadConfig` es una función pura
// del entorno para poder testearla sin abrir puertos.
//
// Endurecimiento (paso 2): NODE_ENV obligatorio y en whitelist, sin fallbacks
// de credenciales demo, passwords >=16 chars sin valores conocidos, token
// interno obligatorio y escucha SIEMPRE en 127.0.0.1.
// ---------------------------------------------------------------------------

export interface AppConfig {
  nodeEnv: "production" | "development" | "test";
  port: number;
  /** Host de escucha — SIEMPRE loopback (ver docs/ACCESO-SEGURO.md). */
  listenHost: string;
  adminUsername: string;
  adminPassword: string;
  operatorUsername: string;
  operatorPassword: string;
  /** Token interno Express <-> Flask. */
  internalToken: string;
  flaskBase: string;
  exposeSource: boolean;
  adbHost: string;
  adbPort: number;
  adbExe: string;
  scrcpyExe: string;
  mptApiUrl: string;
  mptVoiceName: string;
  mptVideoAspect: string;
  mptBgmType: string;
  llmProvider: string;
  pexelsApiKey: string;
  /** Cookie `Secure` (TLS terminado en reverse proxy / Tailscale Serve). */
  cookieSecure: boolean;
  /** URL pública del panel (para cookies/enlaces correctos tras proxy TLS). */
  publicBaseUrl: string;
}

const NODE_ENVS = new Set(["production", "development", "test"]);
const FORBIDDEN_PASSWORDS = new Set(["admin123", "operator123", "password", "changeme", "12345678", "password123", "phonefarm", "admin"]);

/** Validación de arranque: el proceso NO arranca con config débil. */
export function validateConfig(cfg: AppConfig): void {
  if (!NODE_ENVS.has(cfg.nodeEnv)) {
    throw new Error(`[FATAL] NODE_ENV debe ser production|development|test (recibido: ${cfg.nodeEnv}).`);
  }
  for (const [name, value] of [["ADMIN_PASSWORD", cfg.adminPassword], ["OPERATOR_PASSWORD", cfg.operatorPassword]] as const) {
    if (!value || value.length < 16 || FORBIDDEN_PASSWORDS.has(value.toLowerCase())) {
      throw new Error(
        `[FATAL] ${name} debe ser un secreto único de >=16 caracteres sin valores conocidos. ` +
        `Ejecuta: powershell -File platform/scripts/rotate-internal-secrets.ps1`
      );
    }
  }
  if (!cfg.internalToken) {
    throw new Error("[FATAL] PHONE_FARM_INTERNAL_TOKEN no definido — el backend Flask rechazará todas las llamadas.");
  }
  if (cfg.publicBaseUrl.startsWith("https://") && !cfg.cookieSecure) {
    throw new Error("[FATAL] PUBLIC_BASE_URL es https pero COOKIE_SECURE=false — config insegura.");
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = (env.NODE_ENV || "") as AppConfig["nodeEnv"];
  const port = Number(env.PORT) || 3000;

  const cfg: AppConfig = {
    nodeEnv,
    port,
    // El panel NUNCA escucha fuera de loopback: el acceso remoto se hace con
    // Tailscale Serve / reverse proxy TLS (docs/ACCESO-SEGURO.md).
    listenHost: "127.0.0.1",
    adminUsername: env.ADMIN_USERNAME || "admin",
    adminPassword: env.ADMIN_PASSWORD || "",
    operatorUsername: env.OPERATOR_USERNAME || "operator",
    operatorPassword: env.OPERATOR_PASSWORD || "",
    internalToken: env.PHONE_FARM_INTERNAL_TOKEN || "",
    flaskBase: env.FLASK_BASE || "http://127.0.0.1:5000",
    exposeSource: env.EXPOSE_SOURCE === "true",
    adbHost: env.ADB_HOST || "127.0.0.1",
    adbPort: Number(env.ADB_PORT) || 5037,
    adbExe: env.ADB_EXE || "adb",
    scrcpyExe: env.SCRCPY_EXE || "scrcpy",
    mptApiUrl: env.MPT_API_URL || "http://127.0.0.1:8080",
    mptVoiceName: env.MPT_VOICE_NAME || "es-ES-AlvaroNeural",
    mptVideoAspect: env.MPT_VIDEO_ASPECT || "9:16",
    mptBgmType: env.MPT_BGM_TYPE || "",
    llmProvider: env.LLM_PROVIDER || "minimax",
    pexelsApiKey: env.PEXELS_API_KEY || "",
    cookieSecure: env.COOKIE_SECURE !== "false",
    publicBaseUrl: env.PUBLIC_BASE_URL || `http://127.0.0.1:${port}`,
  };

  validateConfig(cfg);
  return cfg;
}
