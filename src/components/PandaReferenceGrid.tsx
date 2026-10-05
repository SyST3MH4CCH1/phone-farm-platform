import React, { useEffect, useState } from 'react';
import { Activity, Battery, Expand, MonitorSmartphone, Play, RefreshCw, Smartphone, Wifi } from 'lucide-react';
import { apiFetch } from '../api';
import type { Account, SystemStats } from '../types';
import type { PandaDevice } from './PandaGridModal';

export function PandaReferenceGrid({ accounts, stats, onOpenLive }: { accounts: Account[]; stats: SystemStats; onOpenLive: () => void }) {
  const [devices, setDevices] = useState<PandaDevice[]>([]);
  const [selected, setSelected] = useState(accounts[0]?.device_serial || '');
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const response = await apiFetch('/api/adb/devices', { signal: AbortSignal.timeout(8000) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        if (mounted) { setDevices(data.devices || []); setError(''); }
      } catch (cause) { if (mounted) setError(cause instanceof Error ? cause.message : String(cause)); }
    };
    refresh(); const interval = window.setInterval(refresh, 5000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, []);
  const cards = accounts.filter((account) => account.device_serial).slice(0, 4);
  const selectedAccount = cards.find((account) => account.device_serial === selected) ?? cards[0];
  const selectedDevice = devices.find((device) => device.serial === selectedAccount?.device_serial);
  return <>
    <div className="ref-panda-layout"><div className="ref-panda-grid">
      {cards.map((account) => {
        const device = devices.find((entry) => entry.serial === account.device_serial);
        const online = device?.status === 'device';
        return <section className={`ref-section ref-panda-card ${selectedAccount?.id === account.id ? 'selected' : ''}`} key={account.id} onClick={() => setSelected(account.device_serial)}><header className="ref-panda-card-head"><div><span className="ref-panda-user-icon">◉</span><strong>@{account.username}<small>{account.device_serial} · {account.proxy_id || 'Sin proxy'}</small></strong></div><span className={online ? 'ref-status ref-status-green' : 'ref-status ref-status-yellow'}>{online ? 'En vivo' : 'Sin señal'}</span></header><div className="ref-panda-phone"><div className="ref-panda-notch">13:34 ▪ ▪ ▪</div>{online ? <img src={`/api/adb/screenshot/${encodeURIComponent(account.device_serial)}`} alt={`Pantalla real de ${account.device_serial}`} loading="lazy"/> : <div className="ref-panda-offline"><Smartphone size={39}/><p>{error ? 'No se puede conectar al dispositivo' : 'Dispositivo sin señal ADB'}</p></div>}</div><footer className="ref-panda-card-footer"><MonitorSmartphone size={16}/><span>{online ? device?.model || 'Pantalla en vivo' : 'Sin pantalla'}</span><small>{online ? 'Conectado' : 'Desconectado'}</small></footer></section>;
      })}
      {cards.length === 0 && <section className="ref-section ref-panda-empty"><Smartphone size={37}/><p>No hay cuentas vinculadas a dispositivos.</p><button className="ref-blue-button" onClick={onOpenLive}>Abrir Panda Live</button></section>}
    </div><aside className="ref-section ref-panda-selected"><header className="ref-section-head"><h2>Dispositivo seleccionado</h2><span className={selectedDevice?.status === 'device' ? 'ref-status ref-status-green' : 'ref-status ref-status-yellow'}>{selectedDevice?.status === 'device' ? 'En vivo' : 'Sin señal'}</span></header><div className="ref-panda-selected-user"><span>◉</span><div><strong>{selectedAccount ? `@${selectedAccount.username}` : 'Sin dispositivo'}</strong><small>{selectedAccount?.device_serial || '—'} · {selectedAccount?.proxy_id || 'Sin proxy'}</small></div></div><dl className="ref-dl"><dt>Dispositivo</dt><dd>{selectedDevice?.model || '—'}</dd><dt>Estado ADB</dt><dd>{selectedDevice?.status || 'Desconectado'}</dd><dt>Batería</dt><dd>{selectedDevice?.battery_pct == null ? '—' : `${selectedDevice.battery_pct}%`}</dd><dt>Resolución</dt><dd>{selectedDevice?.resolution || '—'}</dd><dt>Android</dt><dd>{selectedDevice?.android_version || '—'}</dd><dt>Proxy</dt><dd>{selectedAccount?.proxy_id || '—'}</dd></dl><button className="ref-blue-button" onClick={onOpenLive} disabled={!selectedAccount}><Expand size={15}/> Ver en grande</button><div className="ref-panda-controls"><button onClick={onOpenLive}><Play size={14}/> Tomar control</button><button onClick={onOpenLive}><RefreshCw size={14}/> Abrir consola</button></div></aside></div>
    <div className="ref-panda-lower"><section className="ref-section"><header className="ref-section-head"><h2><Activity size={15}/> Eventos en tiempo real</h2></header><p className="ref-empty">{error || 'Abre Panda Live para consultar los eventos en tiempo real.'}</p></section><section className="ref-section"><header className="ref-section-head"><h2>Recursos del sistema (servidor)</h2></header><div className="ref-panda-resources"><div><Activity size={20}/><strong>{stats.cpu_percent}%</strong><span>CPU</span></div><div><Battery size={20}/><strong>{stats.ram_percent}%</strong><span>RAM</span></div><div><Wifi size={20}/><strong>{devices.length}</strong><span>ADB</span></div></div></section></div>
  </>;
}
