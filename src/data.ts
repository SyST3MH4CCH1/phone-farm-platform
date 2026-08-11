import type { Account, ProxyItem, QueueJob } from './types';

// Estado inicial VACÍO — los datos REALES vienen del backend Flask
// (platform/accounts.json, proxies.json, queue.json vía el proxy de server.ts).
// Prohibido seedear valores de ejemplo: la UI debe reflejar SOLO el estado real.

export const INITIAL_ACCOUNTS: Account[] = [];
export const INITIAL_PROXIES: ProxyItem[] = [];
export const INITIAL_QUEUE: QueueJob[] = [];

// Archivos del CodeViewer: se cargan en vivo desde GET /api/source (código real del backend).
// Aquí se deja vacío intencionadamente: CodeViewerModal hace fetch a
// GET /api/source (lista) y GET /api/source/<file> (contenido).
// El contenido ya NO se hardcodea aquí.
export const CODE_FILES: Record<string, string> = {};
