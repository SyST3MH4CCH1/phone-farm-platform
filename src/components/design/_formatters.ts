// TASK §22 + §6 — formatters compartidos.
// Política: cuando el valor es null/undefined/NaN/Infinity se renderiza `—` (em-dash).
// Esto preserva el principio "no mostrar cifras inventadas".

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Porcentaje 0–100 con clamp. Null/undefined/NaN → `—`. */
export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (!isFiniteNumber(value)) return '—';
  const clamped = Math.max(0, Math.min(100, value));
  return `${clamped.toFixed(digits)}%`;
}

/** Latencia en ms (<1000) o s (>=1000). Null/undefined/NaN → `—`. */
export function formatLatency(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return '—';
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

/** Bytes con unidad legible (B / KB / MB / GB). */
export function formatBytes(value: number | null | undefined): string {
  if (!isFiniteNumber(value) || value === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = value;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Tiempo relativo compacto ("hace 5s", "hace 2min", "en 1h"). */
export function formatRelativeTime(input: string | number | Date | null | undefined, now: Date = new Date()): string {
  if (!input) return '—';
  const t = input instanceof Date ? input : new Date(input);
  const ms = t.getTime() - now.getTime();
  if (!Number.isFinite(ms)) return '—';
  const past = ms < 0;
  const absMs = Math.abs(ms);
  const future = !past;
  const sign = past ? '-' : '+';
  let value: number;
  let unit: string;
  if (absMs < 1000) { return past ? 'ahora' : 'ahora'; }
  if (absMs < 60_000) { value = Math.floor(absMs / 1000); unit = 's'; }
  else if (absMs < 3_600_000) { value = Math.floor(absMs / 60_000); unit = 'min'; }
  else if (absMs < 86_400_000) { value = Math.floor(absMs / 3_600_000); unit = 'h'; }
  else { value = Math.floor(absMs / 86_400_000); unit = 'd'; }
  // si futuro: "en +3h"; si pasado: "hace 3h"
  return future ? `en ${value}${unit}` : `hace ${value}${unit}`;
  // `sign` reserved for future "+/-3h" preference.
  void sign;
}

/** Timestamp `YYYY-MM-DD HH:MM:SS` en local time. Null/undefined → `—`. */
export function formatTimestamp(input: string | number | Date | null | undefined): string {
  if (!input) return '—';
  const d = input instanceof Date ? input : new Date(input);
  if (!Number.isFinite(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}