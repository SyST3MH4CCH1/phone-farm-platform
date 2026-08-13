// ---------------------------------------------------------------------------
// Bootstrap del servidor Express (Phone Farm Control Center).
// La app se construye en server/app.ts (createApp) — testable sin puertos.
// Este archivo: carga .env, valida config y escucha en loopback.
// ---------------------------------------------------------------------------

// Cargar .env de la raíz ANTES de leer cualquier process.env (tsx no lo hace solo).
import dotenv from "dotenv";
dotenv.config();

import { createServer as createViteServer } from "vite";
import { loadConfig } from "./server/config";
import { createApp } from "./server/app";

async function main() {
  const config = loadConfig();

  // Guardas de arranque (endurecidas en el paso 2).
  if (config.nodeEnv === "production" && (!config.adminPassword || !config.operatorPassword)) {
    console.error("[FATAL] En producción debe definir ADMIN_PASSWORD y OPERATOR_PASSWORD (ver .env.example).");
    process.exit(1);
  }
  if (!config.internalToken) {
    console.warn("[WARN] PHONE_FARM_INTERNAL_TOKEN no definido — backend Flask rechazará las llamadas hasta configurarlo.");
  }

  const app = createApp(config, {
    viteMiddleware: config.nodeEnv === "production" ? undefined : await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          // Ignorar el RUNTIME de la plataforma (queue.json, logs, MP4...):
          // Flask los escribe en cada transición de job y sin esto Vite
          // RECARGABA la página entera del operador en cada cambio de estado.
          ignored: [
            "**/platform/**",
            "**/node_modules/**",
            "**/dist/**",
            "**/storage/**",
            "**/__pycache__/**",
            "**/*.log",
            "**/*.mp4",
          ],
        },
      },
      appType: "spa",
    }).then((vite) => vite.middlewares),
  });

  app.listen(config.port, config.listenHost, () => {
    console.log(`Server Phone Farm running on http://localhost:${config.port} (proxy de API a ${config.flaskBase})`);
  });
}

main().catch((err) => {
  console.error("[FATAL] No se pudo arrancar el servidor:", err);
  process.exit(1);
});
