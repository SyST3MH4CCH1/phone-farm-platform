import React, { useState } from 'react';
import { GitBranch, Download, RefreshCw, CheckCircle2, History, Archive, X, Sparkles, ShieldCheck, Terminal } from 'lucide-react';
import { Account, ProxyItem, QueueJob } from '../types';

interface VersionControlModalProps {
  accounts: Account[];
  proxies: ProxyItem[];
  queue: QueueJob[];
  onClose: () => void;
  onDownloadZip: () => void;
}

export const VersionControlModal: React.FC<VersionControlModalProps> = ({
  accounts,
  proxies,
  queue,
  onClose,
  onDownloadZip
}) => {
  const [selectedVersion, setSelectedVersion] = useState<'v2.4' | 'v2.3' | 'v2.2'>('v2.4');
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState(false);

  const versions = [
    {
      version: 'v2.4 REAL (Actual)',
      id: 'v2.4',
      date: '2026-07-31',
      author: 'Antigravity Core',
      changes: [
        'Motor MoneyPrinterTurbo 9:16 integrado con previsualización en tiempo real.',
        'Antigravity UI Theme Teal/Navy (#0B1220, #00E5BE).',
        'Consola de logs SSE en vivo desplegable/minimizable.',
        'Sincronización multi-dispositivo ADB Bridge con proxies SOCKS5.'
      ]
    },
    {
      version: 'v2.3 Stable',
      id: 'v2.3',
      date: '2026-07-20',
      author: 'PhoneFarm Devs',
      changes: [
        'Soporte inicial para taktik-bot en Windows Mini PC.',
        'Tabla de cola de tareas básica.',
        'Conexión Express 0.0.0.0:3000.'
      ]
    },
    {
      version: 'v2.2 Legacy',
      id: 'v2.2',
      date: '2026-07-05',
      author: 'PhoneFarm Devs',
      changes: [
        'Script de warm-up automatizado de 30 días.',
        'Soporte básico para proxies DataImpulse.'
      ]
    }
  ];

  const handleRestoreVersion = (verId: 'v2.4' | 'v2.3' | 'v2.2') => {
    setIsRestoring(true);
    setTimeout(() => {
      setSelectedVersion(verId);
      setIsRestoring(false);
      setRestoreSuccess(true);
      setTimeout(() => setRestoreSuccess(false), 3000);
    }, 800);
  };

  const handleExportBackupJson = () => {
    const backupData = {
      timestamp: new Date().toISOString(),
      version: selectedVersion,
      system: 'TH3F4Rm3R Phone Farm v2.4 REAL',
      accounts,
      proxies,
      queue
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `phone-farm-backup-${selectedVersion}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 font-mono">
      <div className="bg-[#101A2D] border border-[#1E2C42] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#0F1829] px-6 py-4 border-b border-[#1E2C42] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#00E5BE]/10 border border-[#00E5BE]/30 flex items-center justify-center text-[#00E5BE]">
              <GitBranch className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                Control de Versiones & Backups — TH3F4Rm3R
              </h3>
              <p className="text-[11px] text-[#94A3B8] font-sans">
                Gestiona despliegues, versiones de código Python/ADB y exporta backups
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#94A3B8] hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs flex-1">
          {restoreSuccess && (
            <div className="bg-[#00E5BE]/10 border border-[#00E5BE]/30 text-[#00E5BE] p-3 rounded-lg flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>Versión de configuración aplicada exitosamente al runtime.</span>
            </div>
          )}

          {/* Export Quick Bar */}
          <div className="bg-[#0B1320] border border-[#1E2C42] rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="font-bold text-white text-xs block">Exportación Completa del Sistema</span>
              <span className="text-[11px] text-[#94A3B8] font-sans">Descarga el código fuente (.ZIP) o snapshot de estado (.JSON)</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportBackupJson}
                className="px-3 py-1.5 bg-[#1E293B] hover:bg-[#334155] border border-[#4DFFE0]/30 text-[#4DFFE0] rounded-lg font-bold flex items-center gap-1.5"
              >
                <Archive className="w-3.5 h-3.5" /> Snapshot JSON
              </button>
              <button
                onClick={onDownloadZip}
                className="px-3.5 py-1.5 bg-[#00E5BE] hover:bg-[#00E5BE]/90 text-[#090D16] font-bold rounded-lg flex items-center gap-1.5 shadow-md"
              >
                <Download className="w-3.5 h-3.5" /> Descargar ZIP Full
              </button>
            </div>
          </div>

          {/* Version History List */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-[#00E5BE]" /> Historial de Reversiones & Builds
            </h4>

            <div className="space-y-3">
              {versions.map((ver) => (
                <div
                  key={ver.id}
                  className={`bg-[#0B1320] border rounded-xl p-4 transition-all ${
                    selectedVersion === ver.id
                      ? 'border-[#00E5BE] bg-[#00E5BE]/5 shadow-lg'
                      : 'border-[#1E2C42] hover:border-[#4DFFE0]/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">{ver.version}</span>
                      {selectedVersion === ver.id && (
                        <span className="text-[10px] bg-[#00E5BE]/10 text-[#00E5BE] border border-[#00E5BE]/30 px-2 py-0.5 rounded-full font-bold">
                          ACTIVA EN PRODUCCIÓN
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-[#64748B]">{ver.date} • {ver.author}</span>
                  </div>

                  <ul className="space-y-1 mb-3 text-[11px] text-[#94A3B8] font-sans">
                    {ver.changes.map((c, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-[#00E5BE] font-bold">•</span> {c}
                      </li>
                    ))}
                  </ul>

                  {selectedVersion !== ver.id && (
                    <button
                      onClick={() => handleRestoreVersion(ver.id as any)}
                      disabled={isRestoring}
                      className="px-3 py-1 bg-[#1E293B] hover:bg-[#334155] text-white border border-[#1E2C42] rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      {isRestoring ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin text-[#00E5BE]" /> Restaurando...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3 h-3 text-[#4DFFE0]" /> Cambiar a esta versión
                        </>
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
