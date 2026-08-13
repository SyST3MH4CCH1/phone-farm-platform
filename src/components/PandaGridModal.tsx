import { useEffect, useState } from 'react';
import { apiFetch } from '../api';

export interface PandaDevice {
  serial: string;
  status: 'device' | 'unauthorized' | string;
  product?: string;
  model?: string;
  battery_pct?: number | null;
  charging?: boolean | null;
  resolution?: string | null;
  android_version?: string | null;
  uptime?: string | null;
}

interface PandaGridModalProps {
  onClose: () => void;
}

/** Formatea el uptime crudo de Android ("up 23:12" / "up 3 days, 11:52"). */
function fmtUptime(raw?: string | null): string {
  if (!raw) return '—';
  const m = raw.match(/up ([\d]+ days?, )?([\d:]+)/);
  if (!m) return raw.slice(0, 30);
  return (m[1] || '') + m[2];
}

/** Dispositivos ADB: grid de datos + control scrcpy (manejo) por dispositivo. */
export const PandaGridModal: React.FC<PandaGridModalProps> = ({ onClose }) => {
  const [devices, setDevices] = useState<PandaDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mirrorMsg, setMirrorMsg] = useState<Record<string, string>>({});

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch('/api/adb/devices', { signal: AbortSignal.timeout(8000) });
        const data = await res.json();
        if (res.ok) {
          setDevices(data.devices || []);
          setError(null);
        } else {
          setError(data.error || `HTTP ${res.status}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  // Manejo nativo: abre la ventana scrcpy del teléfono (control táctil real).
  const openMirror = async (serial: string) => {
    setMirrorMsg((m) => ({ ...m, [serial]: 'abriendo…' }));
    try {
      const res = await apiFetch('/api/adb/mirror', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial }),
      });
      const data = await res.json().catch(() => ({}));
      setMirrorMsg((m) => ({ ...m, [serial]: res.ok ? '✓ scrcpy abierto' : (data.error || `HTTP ${res.status}`) }));
      setTimeout(() => setMirrorMsg((m) => ({ ...m, [serial]: '' })), 4000);
    } catch {
      setMirrorMsg((m) => ({ ...m, [serial]: 'error de red' }));
    }
  };

  // Abre la vista live (/panda) filtrada a este dispositivo en otra ventana.
  const openLive = (serial: string) => {
    window.open(`/panda?solo=${encodeURIComponent(serial)}`, '_blank', 'noopener,width=520,height=860');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-shell w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#E5E5E5] uppercase tracking-widest font-mono">Dispositivos ADB</h3>
            <p className="text-[11px] text-[#6B7076] font-mono mt-0.5">
              {devices.length} teléfono{devices.length !== 1 ? 's' : ''} · datos reales de adb (refresh 5s)
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-[11px] font-mono ${devices.length ? 'text-[#6FBF73]' : 'text-[#E05B5B]'}`}>
              {devices.length ? 'conectado' : 'desconectado'}
            </span>
            <button onClick={onClose} className="btn-close font-bold" title="Cerrar">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && <div className="py-12 text-center text-[#6B7076] font-mono text-xs">Escaneando dispositivos adb...</div>}
          {!loading && error && (
            <div className="bg-[#1A1C1E] border border-[#2A2C30] rounded-lg px-4 py-6 text-center text-[#E05B5B] font-mono text-xs">{error}</div>
          )}
          {!loading && !error && devices.length === 0 && (
            <div className="border border-dashed border-[#2A2C30] rounded-lg px-4 py-14 text-center text-[#6B7076] font-mono text-xs">
              No hay teléfonos conectados. Conecta un dispositivo por USB y acepta el diálogo de depuración.
            </div>
          )}
          {!loading && !error && devices.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {devices.map((dev) => {
                const authorized = dev.status === 'device';
                const pct = dev.battery_pct ?? 0;
                const low = authorized && pct <= 20;
                return (
                  <div key={dev.serial} className="bg-[#1A1C1E] border border-[#2A2C30] rounded-lg p-3.5 font-mono text-[12px]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-[#E5E5E5]">{dev.model || dev.product || 'Android'}</span>
                      <span className={`text-[11px] ${authorized ? 'text-[#6FBF73]' : 'text-[#D4A84B]'}`}>
                        {authorized ? 'autorizado' : 'sin autorizar'}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#6B7076] mb-2">{dev.serial}</div>
                    <div className="space-y-1.5 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-[#6B7076]">batería</span>
                        <span className={low ? 'text-[#E05B5B] font-bold' : dev.charging ? 'text-[#6FBF73]' : 'text-[#E5E5E5]'}>
                          {dev.battery_pct != null ? `${pct}%${dev.charging ? ' (cargando)' : ''}` : '—'}
                        </span>
                      </div>
                      {dev.battery_pct != null && (
                        <div className="h-1 bg-[#2A2C30] rounded-full overflow-hidden">
                          <div
                            className={`h-full ${low ? 'bg-[#E05B5B]' : dev.charging ? 'bg-[#6FBF73]' : 'bg-[#8A8F98]'}`}
                            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                          />
                        </div>
                      )}
                      <div className="flex justify-between"><span className="text-[#6B7076]">resolución</span><span className="text-[#E5E5E5]">{dev.resolution || '—'}</span></div>
                      <div className="flex justify-between"><span className="text-[#6B7076]">android</span><span className="text-[#E5E5E5]">{dev.android_version || '—'}</span></div>
                      <div className="flex justify-between"><span className="text-[#6B7076]">uptime</span><span className="text-[#E5E5E5]">{fmtUptime(dev.uptime)}</span></div>
                    </div>
                    {authorized && (
                      <div className="pt-2.5 space-y-1.5">
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => openMirror(dev.serial)}
                            className="flex-1 bg-[#8A8F98] hover:bg-[#9AA0A9] text-[#1E2023] font-bold py-1.5 px-2 rounded text-[11px] transition-colors"
                            title="Abrir ventana nativa scrcpy (control táctil)"
                          >
                            Manejar (scrcpy)
                          </button>
                          <button
                            onClick={() => openLive(dev.serial)}
                            className="flex-1 bg-[#33363A] hover:bg-[#3A3D42] text-[#E5E5E5] font-bold py-1.5 px-2 rounded text-[11px] transition-colors"
                            title="Ver pantalla en vivo en ventana nueva"
                          >
                            Ver live ↗
                          </button>
                        </div>
                        {mirrorMsg[dev.serial] && (
                          <div className="text-center text-[10px] text-[#6FBF73]">{mirrorMsg[dev.serial]}</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
