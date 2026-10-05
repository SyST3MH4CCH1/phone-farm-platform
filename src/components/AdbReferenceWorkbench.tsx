import { useState } from 'react';
import { Battery, RefreshCw, Search, Settings2, Smartphone, Terminal } from 'lucide-react';
import type { Account, LogEntry } from '../types';

export type AdbReferenceDevice = {
  serial: string;
  model?: string;
  state?: string;
  status?: string;
  battery_pct?: number | null;
};

type Props = {
  devices: AdbReferenceDevice[];
  accounts: Account[];
  logs: LogEntry[];
  onRefresh: () => void;
  onConfigure: () => void;
};

export function AdbReferenceWorkbench({ devices, accounts, logs, onRefresh, onConfigure }: Props) {
  const [query, setQuery] = useState('');
  const [selectedSerial, setSelectedSerial] = useState<string | null>(null);
  const [diagnosticTab, setDiagnosticTab] = useState<'terminal' | 'events' | 'metrics'>('terminal');
  const selected = devices.find(device => device.serial === selectedSerial) ?? devices[0];
  const owner = accounts.find(account => account.device_serial === selected?.serial);
  const filtered = devices.filter(device => `${device.serial} ${device.model || ''} ${accounts.find(account => account.device_serial === device.serial)?.username || ''}`.toLowerCase().includes(query.toLowerCase()));
  const online = (device: AdbReferenceDevice) => device.state === 'device' || device.status === 'device';

  return <div className="ref-adb-layout">
    <section className="ref-section ref-adb-devices">
      <header className="ref-section-head"><h2>DISPOSITIVOS ({devices.length})</h2><button className="ref-icon-button" aria-label="Actualizar dispositivos" onClick={onRefresh}><RefreshCw size={16}/></button></header>
      <div className="ref-filters"><label className="ref-search"><Search size={15}/><input aria-label="Buscar dispositivo" placeholder="Buscar dispositivo o alias..." value={query} onChange={event => setQuery(event.target.value)}/></label></div>
      <div className="ref-adb-device-list">{filtered.map((device, index) => {
        const account = accounts.find(item => item.device_serial === device.serial);
        return <button className={`ref-adb-device ${selected?.serial === device.serial ? 'selected' : ''}`} key={device.serial} onClick={() => setSelectedSerial(device.serial)}>
          <span className="ref-adb-device-number">{index + 1}</span>
          <span className={`ref-adb-dot ${online(device) ? 'online' : ''}`}/>
          <span className="ref-adb-device-icon"><Smartphone size={28}/></span>
          <span className="ref-adb-device-copy"><strong>{account ? `@${account.username}` : device.model || device.serial}</strong><small>{device.model || 'Android'}</small><small>{device.serial}</small></span>
          <span className="ref-adb-device-meta"><span><Battery size={15}/> {device.battery_pct == null ? '—' : `${device.battery_pct}%`}</span><small>{online(device) ? 'ADB Online' : device.state || device.status || 'Sin conexión'}</small></span>
        </button>;
      })}{filtered.length === 0 && <p className="ref-empty">{devices.length ? 'No hay dispositivos que coincidan con la búsqueda.' : 'No hay dispositivos ADB detectados. Conecta un teléfono y actualiza la lista.'}</p>}</div>
    </section>

    <div className="ref-adb-center">
      <section className="ref-section ref-adb-diagnostics"><header className="ref-section-head"><h2>Diagnósticos y eventos</h2><span>{selected?.serial || 'Sin dispositivo'}</span></header>
        <div className="ref-tabs" role="tablist" aria-label="Diagnósticos ADB">
          <button role="tab" aria-selected={diagnosticTab === 'terminal'} className={diagnosticTab === 'terminal' ? 'active' : ''} onClick={() => setDiagnosticTab('terminal')}>Terminal ADB</button>
          <button role="tab" aria-selected={diagnosticTab === 'events'} className={diagnosticTab === 'events' ? 'active' : ''} onClick={() => setDiagnosticTab('events')}>Eventos en vivo</button>
          <button role="tab" aria-selected={diagnosticTab === 'metrics'} className={diagnosticTab === 'metrics' ? 'active' : ''} onClick={() => setDiagnosticTab('metrics')}>Métricas</button>
        </div>
        {diagnosticTab === 'terminal' && <div className="ref-adb-terminal"><p><Terminal size={14}/> Estado informado por el servidor ADB</p>{selected ? <><code>serial: {selected.serial}</code><code>modelo: {selected.model || 'No disponible'}</code><code>estado: {selected.state || selected.status || 'No disponible'}</code><code>batería: {selected.battery_pct == null ? 'No disponible' : `${selected.battery_pct}%`}</code></> : <span>Conecta un dispositivo para ver sus diagnósticos.</span>}</div>}
        {diagnosticTab === 'events' && <div className="ref-adb-terminal">{logs.slice(-12).reverse().map(log => <code key={log.id}>[{log.timestamp}] [{log.level}] {log.message}</code>)}{logs.length === 0 && <span>El servidor aún no ha registrado eventos.</span>}</div>}
        {diagnosticTab === 'metrics' && <div className="ref-adb-terminal"><code>Dispositivos detectados: {devices.length}</code><code>Dispositivos conectados: {devices.filter(online).length}</code><code>Batería del dispositivo: {selected?.battery_pct == null ? 'Sin dato' : `${selected.battery_pct}%`}</code><code>Latencia ADB: Sin dato del servidor</code></div>}
        <div className="ref-adb-diagnostic-actions"><button className="ref-secondary" onClick={onRefresh}><RefreshCw size={15}/> Actualizar diagnóstico</button><button className="ref-secondary" onClick={onConfigure}><Settings2 size={15}/> Configurar conexión</button></div>
      </section>
      <section className="ref-section ref-adb-connection"><header className="ref-section-head"><h2>Calidad de conexión</h2><span>{selected?.serial || 'Sin dispositivo'}</span></header><div className="ref-adb-connection-body"><div><strong>Estado ADB</strong><span className={selected && online(selected) ? 'ref-status ref-status-green' : 'ref-status ref-status-yellow'}>{selected ? (online(selected) ? 'Conectado' : 'Sin conexión') : 'Sin dispositivo'}</span></div><div><strong>Latencia ADB</strong><span>Sin telemetría</span></div><div><strong>Batería</strong><span>{selected?.battery_pct == null ? 'Sin dato' : `${selected.battery_pct}%`}</span></div></div></section>
    </div>

    <div className="ref-adb-right"><section className="ref-section ref-adb-selected"><header className="ref-section-head"><h2>Dispositivo seleccionado</h2><span className={selected && online(selected) ? 'ref-status ref-status-green' : 'ref-status ref-status-yellow'}>{selected ? (online(selected) ? 'Online' : 'Offline') : 'Sin señal'}</span></header>
      <div className="ref-adb-selected-body"><div className="ref-adb-selected-hero">{selected && online(selected) ? <img src={`/api/adb/screenshot/${encodeURIComponent(selected.serial)}`} alt={`Pantalla real de ${selected.model || selected.serial}`} onError={event => { event.currentTarget.style.display = 'none'; }}/> : <Smartphone size={55}/>}<div><strong>{owner ? `@${owner.username}` : selected?.model || 'Sin dispositivo'}</strong><small>{selected?.model || 'Android'}</small><small>{selected?.serial || 'Conecta un dispositivo ADB'}</small></div></div>
      <div className="ref-adb-selected-facts"><span>Batería <b>{selected?.battery_pct == null ? '—' : `${selected.battery_pct}%`}</b></span><span>Estado <b>{selected?.state || selected?.status || '—'}</b></span><span>Cuenta <b>{owner ? `@${owner.username}` : 'Sin asignar'}</b></span><span>Proxy <b>{owner?.proxy_id || '—'}</b></span></div>
      <h3>Acciones rápidas</h3><div className="ref-adb-quick-actions"><button className="ref-secondary" onClick={onRefresh}><RefreshCw size={16}/> Actualizar</button><button className="ref-secondary" onClick={onConfigure}><Settings2 size={16}/> Configurar ADB</button></div>
      </div></section></div>
  </div>;
}
