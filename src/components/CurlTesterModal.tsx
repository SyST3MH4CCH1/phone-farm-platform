import React, { useState } from 'react';
import { Terminal as TerminalIcon, Play, Copy, Check, Send } from 'lucide-react';

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
      curl: `curl -X POST http://127.0.0.1:5000/api/accounts -H "Content-Type: application/json" -d '{"username":"nicho_fitness_02","password":"Pass123!","device_serial":"RFCW80ZZZZZ","proxy_id":"proxy_01","warmup_day":1}'`,
      body: { username: "nicho_fitness_02", password: "Pass123!", device_serial: "RFCW80ZZZZZ", proxy_id: "proxy_01", warmup_day: 1 }
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
      name: "12. Autenticación Operador (Login)",
      method: "POST",
      url: "/api/auth/login",
      curl: `curl -X POST http://127.0.0.1:5000/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}'`,
      body: { username: "admin", password: "admin123" }
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
      body: { pexels_api_key: ""your_pexels_key"" }
    }
  ];

  const currentEndpoint = endpoints[activeTab];

  const handleTest = async () => {
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
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 font-mono">
      <div className="bg-[#101A2D] border border-[#1E2C42] rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#0F1829] px-4 py-3 border-b border-[#1E2C42] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TerminalIcon className="w-5 h-5 text-[#00E5BE]" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Pruebas cURL y Validación REST API (16 Endpoints - Incluye MoneyPrinterTurbo)
            </h3>
          </div>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-white font-bold text-sm p-1">✕</button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* List of 16 Endpoints */}
          <div className="w-72 bg-[#0B1320] border-r border-[#1E2C42] p-2 overflow-y-auto space-y-1 text-xs">
            {endpoints.map((ep, idx) => (
              <button
                key={idx}
                onClick={() => { setActiveTab(idx); setResponseOutput(null); }}
                className={`w-full text-left px-3 py-2 rounded-lg flex flex-col gap-0.5 transition-colors font-mono ${
                  activeTab === idx
                    ? 'bg-[#00E5BE]/10 border border-[#00E5BE]/30 text-[#00E5BE]'
                    : 'text-[#94A3B8] hover:bg-[#101A2D] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                    ep.method === 'GET' ? 'bg-[#38BDF8]/10 text-[#38BDF8] border border-[#38BDF8]/30' :
                    ep.method === 'POST' ? 'bg-[#00E5BE]/10 text-[#00E5BE] border border-[#00E5BE]/30' : 'bg-red-950/40 text-red-400 border border-red-500/30'
                  }`}>
                    {ep.method}
                  </span>
                  <span className="truncate font-semibold text-white">{ep.name}</span>
                </div>
                <span className="text-[10px] text-[#64748B] truncate">{ep.url}</span>
              </button>
            ))}
          </div>

          {/* Test Workbench */}
          <div className="flex-1 flex flex-col p-4 bg-[#0B1320] overflow-y-auto space-y-4">
            <div>
              <h4 className="text-sm font-bold text-white mb-1">{currentEndpoint.name}</h4>
              <div className="flex items-center gap-2 text-xs font-mono text-[#94A3B8]">
                <span className="text-[#00E5BE] font-bold">{currentEndpoint.method}</span>
                <span>http://127.0.0.1:5000{currentEndpoint.url}</span>
              </div>
            </div>

            {/* cURL Command Block */}
            <div className="bg-[#101A2D] border border-[#1E2C42] rounded-xl p-3 relative font-mono text-xs text-[#00E5BE]">
              <button
                onClick={() => handleCopyCurl(activeTab, currentEndpoint.curl)}
                className="absolute top-2 right-2 bg-[#0B1320] hover:bg-[#1E293B] text-white border border-[#1E2C42] px-2.5 py-1 rounded-lg text-[11px] flex items-center gap-1 font-bold"
              >
                {copiedIndex === activeTab ? <Check className="w-3 h-3 text-[#00E5BE]" /> : <Copy className="w-3 h-3 text-[#38BDF8]" />}
                {copiedIndex === activeTab ? 'Copiado' : 'Copiar cURL'}
              </button>
              <pre className="pr-24 whitespace-pre-wrap">{currentEndpoint.curl}</pre>
            </div>

            {/* Execute Test Button */}
            <div>
              <button
                onClick={handleTest}
                disabled={loading}
                className="bg-[#00E5BE] hover:bg-[#00E5BE]/90 text-[#090D16] font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm"
              >
                <Send className="w-4 h-4 text-[#090D16]" /> Ejecutar Prueba cURL
              </button>
            </div>

            {/* Response Output */}
            {responseOutput && (
              <div className="flex-1 flex flex-col">
                <span className="text-xs font-mono text-[#94A3B8] mb-1">Respuesta HTTP 200 (JSON):</span>
                <pre className="bg-[#101A2D] border border-[#1E2C42] rounded-xl p-3 font-mono text-xs text-[#38BDF8] overflow-auto flex-1 max-h-60">
                  {responseOutput}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
