// ---------------------------------------------------------------------------
// Configuración central del servidor Express. Única fuente de lectura de env
// (excepto dotenv.config() en el bootstrap). `loadConfig` es una función pura
// del entorno para poder testearla sin abrir puertos.
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

/** Valores por defecto seguros para entornos de prueba. */
export function defaultConfig(): AppConfig {
  return {
    nodeEnv: "development",
    port: 3000,
    listenHost: "0.0.0.0", // paso 2: siempre 127.0.0.1
    adminUsername: "admin",
    adminPassword: "",
    operatorUsername: "operator",
    operatorPassword: "",
    internalToken: "",
    flaskBase: "http://127.0.0.1:5000",
    exposeSource: false,
    adbHost: "127.0.0.1",
    adbPort: 5037,
    adbExe: "adb",
    scrcpyExe: "scrcpy",
    mptApiUrl: "http://127.0.0.1:8080",
    mptVoiceName: "es-ES-AlvaroNeural",
    mptVideoAspect: "9:16",
    mptBgmType: "",
    llmProvider: "minimax",
    pexelsApiKey: "",
    cookieSecure: true,
    publicBaseUrl: "http://127.0.0.1:3000",
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const base = defaultConfig();
  const isDev = env.NODE_ENV !== "production";

  return {
    ...base,
    nodeEnv: (env.NODE_ENV === "production" || env.NODE_ENV === "test" ? env.NODE_ENV : "development") as AppConfig["nodeEnv"],
    port: Number(env.PORT) || base.port,
    // Credenciales vía entorno. El fallback de demo (dev) desaparece en el paso 2.
    adminUsername: env.ADMIN_USERNAME || base.adminUsername,
    adminPassword: env.ADMIN_PASSWORD || (isDev ? "admin123" : ""),
    operatorUsername: env.OPERATOR_USERNAME || base.operatorUsername,
    operatorPassword: env.OPERATOR_PASSWORD || (isDev ? "operator123" : ""),
    internalToken: env.PHONE_FARM_INTERNAL_TOKEN || "",
    flaskBase: env.FLASK_BASE || base.flaskBase,
    exposeSource: env.EXPOSE_SOURCE === "true",
    adbHost: env.ADB_HOST || base.adbHost,
    adbPort: Number(env.ADB_PORT) || base.adbPort,
    adbExe: env.ADB_EXE || base.adbExe,
    scrcpyExe: env.SCRCPY_EXE || base.scrcpyExe,
    mptApiUrl: env.MPT_API_URL || base.mptApiUrl,
    mptVoiceName: env.MPT_VOICE_NAME || base.mptVoiceName,
    mptVideoAspect: env.MPT_VIDEO_ASPECT || base.mptVideoAspect,
    mptBgmType: env.MPT_BGM_TYPE || base.mptBgmType,
    llmProvider: env.LLM_PROVIDER || base.llmProvider,
    pexelsApiKey: env.PEXELS_API_KEY || "",
    cookieSecure: env.COOKIE_SECURE !== "false",
    publicBaseUrl: env.PUBLIC_BASE_URL || `http://127.0.0.1:${Number(env.PORT) || base.port}`,
  };
}
