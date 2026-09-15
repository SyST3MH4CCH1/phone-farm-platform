import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { useFocusTrap } from '../a11y';

interface CurlTesterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunEndpointTest: (method: string, endpoint: string, body?: any) => Promise<any>;
}

export const CurlTesterModal: React.FC<CurlTesterModalProps> = ({
  isOpen,
  onClose,
  onRunEndpointTest
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [responseOutput, setResponseOutput] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, onClose);

  if (!isOpen) return null;

  const endpoints = [
    {
      name: "1. Listar todas las cuentas",
      method: "GET",
      url: "/api/accounts",
      curl: `curl -X GET http://127.0.0.1:5000/api/accounts`,
      body: null
    },
    {
      name: "2. Crear nueva cuenta IG",
      method: "POST",
      url: "/api/accounts",
      curl: `curl -X POST http://127.0.0.1:5000/api/accounts -H "Content-Type: application/json" -d '{"username":"<cuenta>","password":"<password>","device_serial":"<serial>","proxy_id":"proxy_01","warmup_day":1}'`,
      body: { username: "<cuenta>", password: "<password>", device_serial: "<serial>", proxy_id: "proxy_01", warmup_day: 1 }
    },
    {
      name: "3. Eliminar cuenta por ID",
      method: "DELETE",
      url: "/api/accounts/acc_02",
      curl: `curl -X DELETE http://127.0.0.1:5000/api/accounts/acc_02`,
      body: null
    },
    {
      name: "4. Listar proxies con IP pública",
      method: "GET",
      url: "/api/proxies",
      curl: `curl -X GET http://127.0.0.1:5000/api/proxies`,
      body: null
    },
    {
      name: "5. Agregar credencial de proxy",
      method: "POST",
      url: "/api/proxies",
      curl: `curl -X POST http://127.0.0.1:5000/api/proxies -H "Content-Type: application/json" -d '{"provider":"DataImpulse","type":"socks5","host":"gw.dataimpulse.com","port":10003,"user":"usr","pass":"pwd"}'`,
      body: { provider: "DataImpulse", type: "socks5", host: "gw.dataimpulse.com", port: 10003, user: "usr", pass: "pwd" }
    },
    {
      name: "6. Consultar cola de generación",
      method: "GET",
      url: "/api/queue",
      curl: `curl -X GET http://127.0.0.1:5000/api/queue`,
      body: null
    },
    {
      name: "7. Agregar job a la cola",
      method: "POST",
      url: "/api/queue",
      curl: `curl -X POST http://127.0.0.1:5000/api/queue -H "Content-Type: application/json" -d '{"keyword":"postres faciles sin horno","target_account":"acc_01"}'`,
      body: { keyword: "postres faciles sin horno", target_account: "acc_01" }
    },
    {
      name: "8. Procesar siguiente job (Generar + Publicar)",
      method: "POST",
      url: "/api/queue/next",
      curl: `curl -X POST http://127.0.0.1:5000/api/queue/next`,
      body: null
    },
    {
      name: "9. Iniciar bot de engagement",
      method: "POST",
      url: "/engagement/start",
      curl: `curl -X POST http://127.0.0.1:5000/engagement/start -H "Content-Type: application/json" -d '{"account_id":"acc_01"}'`,
      body: { account_id: "acc_01" }
    },
    {
      name: "10. Detener bot de engagement",
      method: "POST",
      url: "/engagement/stop",
      curl: `curl -X POST http://127.0.0.1:5000/engagement/stop -H "Content-Type: application/json" -d '{"account_id":"acc_01"}'`,
      body: { account_id: "acc_01" }
    },
    {
      name: "11. Métricas globales del sistema",
      method: "GET",
      url: "/api/stats",
      curl: `curl -X GET http://127.0.0.1:5000/api/stats`,
      body: null
    },
    {
      name: "12. Autenticación (Login) — ejemplo NO ejecutable",
      method: "POST",
      url: "/api/auth/login",
      curl: `curl -X POST http://127.0.0.1:5000/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"<password>"}'`,
      // FE-01: sin credenciales reales. Password vacío -> el servidor rechaza
      // con 400 (validación) y NUNCA autentica con credenciales hardcodeadas.
      body: { username: "admin", password: "" }
    },
    {
      name: "13. Consultar sesión actual (Auth Me)",
      method: "GET",
      url: "/api/auth/me",
      curl: `curl -X GET http://127.0.0.1:5000/api/auth/me`,
      body: null
    },
    {
      name: "14. MoneyPrinterTurbo Config (Get)",
      method: "GET",
      url: "/api/moneyprinter/config",
      curl: `curl -X GET http://127.0.0.1:5000/api/moneyprinter/config`,
      body: null
    },
    {
      name: "15. MoneyPrinterTurbo Generación Vídeo 9:16",
      method: "POST",
      url: "/api/moneyprinter/generate",
      curl: `curl -X POST http://127.0.0.1:5000/api/moneyprinter/generate -H "Content-Type: application/json" -d '{"keyword":"decoracion minimalista","target_account":"acc_01","video_aspect":"9:16"}'`,
      body: { keyword: "decoracion minimalista", target_account: "acc_01", video_aspect: "9:16" }
    },
    {
      name: "16. Verificar API Key de Pexels",
      method: "POST",
      url: "/api/moneyprinter/test-pexels",
      curl: `curl -X POST http://127.0.0.1:5000/api/moneyprinter/test-pexels -H "Content-Type: application/json" -d '{"pexels_api_key":"your_pexels_key"}'`,
      body: { pexels_api_key: "" }
    }
  ];

  const currentEndpoint = endpoints[activeTab];

  const handleTest = async () => {
    // FE-02: las mutaciones (no-GET) requieren confirmación explícita — antes
    // un clic borraba cuentas / arrancaba el pipeline con la sesión completa.
    if (currentEndpoint.method !== "GET" && currentEndpoint.method !== "HEAD") {
      const ok = window.confirm(
        `¿Ejecutar ${currentEndpoint.method} ${currentEndpoint.url} con tu sesión actual?\n` +
        `Esta acción NO es reversible.`
      );
      if (!ok) return;
    }
    // FE-02: el login con password vacío no debe ejecutarse (fallaría 400,
    // pero evitamos llamadas inútiles al endpoint de auth).
    if (currentEndpoint.url === "/api/auth/login" && !currentEndpoint.body?.password) {
      setResponseOutput(JSON.stringify({ error: "Este preset es de ejemplo: introduce un password real para probar el login." }, null, 2));
      return;
    }
    setLoading(true);
    setResponseOutput(null);
    try {
      const res = await onRunEndpointTest(currentEndpoint.method, currentEndpoint.url, currentEndpoint.body);
      setResponseOutput(JSON.stringify(res, null, 2));
    } catch (e: any) {
      setResponseOutput(JSON.stringify({ error: e.message }, null, 2));
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCurl = (index: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 font-mono">
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.18 }}
        role="dialog"
        aria-modal="true"
        className="bg-[#1E2023] border border-[#2A2C30] rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="bg-[#232528] px-4 py-3 border-b border-[#2A2C30] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-[#E5E5E5] uppercase tracking-wider">
              Pruebas cURL y Validación REST API (16 Endpoints - Incluye MoneyPrinterTurbo)
            </h3>
          </div>
          <button onClick={onClose} className="text-[#9CA1A8] hover:text-[#E5E5E5] font-bold text-sm p-1">✕</button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* List of 16 Endpoints */}
          <div className="w-72 bg-[#1A1C1E] border-r border-[#2A2C30] p-2 overflow-y-auto space-y-1 text-xs">
            {endpoints.map((ep, idx) => (
              <button
                key={idx}
                onClick={() => { setActiveTab(idx); setResponseOutput(null); }}
                className={`w-full text-left px-3 py-2 rounded-lg flex flex-col gap-0.5 transition-colors font-mono ${
                  activeTab === idx
                    ? 'bg-[#8A8F98]/10 border border-[#8A8F98]/30 text-[#8A8F98]'
                    : 'text-[#9CA1A8] hover:bg-[#1E2023] hover:text-[#E5E5E5]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                    ep.method === 'GET' ? 'bg-[#A1A6AE]/10 text-[#A1A6AE] border border-[#A1A6AE]/30' :
                    ep.method === 'POST' ? 'bg-[#8A8F98]/10 text-[#8A8F98] border border-[#8A8F98]/30' : 'bg-red-950/40 text-[#E05B5B] border border-red-500/30'
                  }`}>
                    {ep.method}
                  </span>
                  <span className="truncate font-semibold text-[#E5E5E5]">{ep.name}</span>
                </div>
                <span className="text-[10px] text-[#6B7076] truncate">{ep.url}</span>
              </button>
            ))}
          </div>

          {/* Test Workbench */}
          <div className="flex-1 flex flex-col p-4 bg-[#1A1C1E] overflow-y-auto space-y-4">
            <div>
              <h4 className="text-sm font-bold text-[#E5E5E5] mb-1">{currentEndpoint.name}</h4>
              <div className="flex items-center gap-2 text-xs font-mono text-[#9CA1A8]">
                <span className="text-[#8A8F98] font-bold">{currentEndpoint.method}</span>
                <span>{window.location.origin}{currentEndpoint.url}</span>
                <span className="text-[#6B7076]">(same-origin — usa tu sesión)</span>
              </div>
            </div>

            {/* cURL Command Block */}
            <div className="bg-[#1E2023] border border-[#2A2C30] rounded-xl p-3 relative font-mono text-xs text-[#8A8F98]">
              <button
                onClick={() => handleCopyCurl(activeTab, currentEndpoint.curl)}
                className="absolute top-2 right-2 bg-[#1A1C1E] hover:bg-[#33363A] text-[#E5E5E5] border border-[#2A2C30] px-2.5 py-1 rounded-lg text-[11px] flex items-center gap-1 font-bold"
              >
                {copiedIndex === activeTab ? true : null}
                {copiedIndex === activeTab ? 'Copiado' : 'Copiar cURL'}
              </button>
              <pre className="pr-24 whitespace-pre-wrap">{currentEndpoint.curl}</pre>
            </div>

            {/* Execute Test Button */}
            <div>
              <button
                onClick={handleTest}
                disabled={loading}
                className="bg-[#8A8F98] hover:bg-[#8A8F98]/90 text-[#1E2023] font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-2"
              > Ejecutar Prueba cURL
              </button>
            </div>

            {/* Response Output */}
            {responseOutput && (
              <div className="flex-1 flex flex-col">
                <span className="text-xs font-mono text-[#9CA1A8] mb-1">Respuesta del endpoint:</span>
                <pre className="bg-[#1E2023] border border-[#2A2C30] rounded-xl p-3 font-mono text-xs text-[#A1A6AE] overflow-auto flex-1 max-h-60">
                  {responseOutput}
                </pre>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
