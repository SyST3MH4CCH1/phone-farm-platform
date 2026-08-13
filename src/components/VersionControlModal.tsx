import React, { useState } from 'react';
import { Account, ProxyItem, QueueJob } from '../types';
import { apiFetch } from '../api';

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

  const versions = [
    {
      version: 'v2.4 REAL (Actual)',
      id: 'v2.4',
      date: '2026-07-31',
      author: 'Antigravity Core',
      changes: [
        'Motor MoneyPrinterTurbo 9:16 integrado con previsualización en tiempo real.',
        'Antigravity UI Theme Teal/Navy (#17181A, #8A8F98).',
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
        'Conexión Express 127.0.0.1:3000.'
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

  // Paso 10: NO se exporta JSON en claro desde el cliente. El backup sale
  // SIEMPRE cifrado (.pfbackup) con passphrase + reautenticación admin.
  const handleExportVersion = (verId: 'v2.4' | 'v2.3' | 'v2.2') => {
    setSelectedVersion(verId);
    handleExportEncrypted();
  };

  const handleExportEncrypted = async () => {
    const passphrase = window.prompt('Passphrase del backup (>=12 chars, se pedirá al restaurar):');
    if (!passphrase || passphrase.length < 12) {
      window.alert('Passphrase requerida (>=12 caracteres). Exportación cancelada.');
      return;
    }
    const password = window.prompt('Reautenticación: password del panel (admin):');
    if (!password) return;
    try {
      const res = await apiFetch('/api/backups/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase, password })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(`Exportación fallida: ${data?.error || res.status}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `phonefarm-${new Date().toISOString().slice(0, 10)}.pfbackup`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      window.alert('Backup cifrado (.pfbackup) descargado. Guarda la passphrase: es necesaria para restaurar.');
    } catch (err) {
      window.alert(`Error de red: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 font-mono">
      <div className="bg-[#1E2023] border border-[#2A2C30] rounded-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#232528] px-6 py-4 border-b border-[#2A2C30] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#8A8F98]/10 border border-[#8A8F98]/30 flex items-center justify-center text-[#8A8F98]">
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#E5E5E5] uppercase tracking-wider flex items-center gap-2">
                Control de Versiones & Backups — TH3F4Rm3R
              </h3>
              <p className="text-[11px] text-[#9CA1A8] font-sans">
                Gestiona despliegues, versiones de código Python/ADB y exporta backups
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#9CA1A8] hover:text-[#E5E5E5] p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            title="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs flex-1">

          {/* Export Quick Bar */}
          <div className="bg-[#1A1C1E] border border-[#2A2C30] rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="font-bold text-[#E5E5E5] text-xs block">Exportación Completa del Sistema</span>
              <span className="text-[11px] text-[#9CA1A8] font-sans">Descarga el código fuente (.ZIP) o snapshot de estado (.JSON)</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportEncrypted}
                className="px-3 py-1.5 bg-[#33363A] hover:bg-[#3A3D42] border border-[#A1A6AE]/30 text-[#A1A6AE] rounded-lg font-bold flex items-center gap-1.5"
                title="Exporta un backup CIFRADO (.pfbackup) con passphrase — nunca JSON en claro"
              > Backup cifrado (.pfbackup)
              </button>
              <button
                onClick={onDownloadZip}
                className="px-3.5 py-1.5 bg-[#8A8F98] hover:bg-[#8A8F98]/90 text-[#1E2023] font-bold rounded-lg flex items-center gap-1.5"
              > Descargar ZIP Full
              </button>
            </div>
          </div>

          {/* Version History List */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-[#9CA1A8] uppercase tracking-wider flex items-center gap-1.5"> Historial de Reversiones & Builds
            </h4>

            <div className="space-y-3">
              {versions.map((ver) => (
                <div
                  key={ver.id}
                  className={`bg-[#1A1C1E] border rounded-xl p-4 transition-all ${
                    selectedVersion === ver.id
                      ? 'border-[#8A8F98] bg-[#8A8F98]/5'
                      : 'border-[#2A2C30] hover:border-[#A1A6AE]/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#E5E5E5] text-sm">{ver.version}</span>
                      {selectedVersion === ver.id && (
                        <span className="text-[10px] bg-[#8A8F98]/10 text-[#8A8F98] border border-[#8A8F98]/30 px-2 py-0.5 rounded-full font-bold">
                          ACTIVA EN PRODUCCIÓN
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-[#6B7076]">{ver.date} • {ver.author}</span>
                  </div>

                  <ul className="space-y-1 mb-3 text-[11px] text-[#9CA1A8] font-sans">
                    {ver.changes.map((c, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-[#8A8F98] font-bold">•</span> {c}
                      </li>
                    ))}
                  </ul>

                  {selectedVersion !== ver.id && (
                    <button
                      onClick={() => handleExportVersion(ver.id as any)}
                      className="px-3 py-1 bg-[#33363A] hover:bg-[#3A3D42] text-[#E5E5E5] border border-[#2A2C30] rounded-lg text-xs font-bold transition-colors"
                      title="Descarga un snapshot JSON real del estado actual con esta versión etiquetada"
                    >
                      Exportar snapshot
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
