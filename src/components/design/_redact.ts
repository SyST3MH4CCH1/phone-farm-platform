// TASK §8.3 / §24 — Redacción de secretos en la consola.
// Aplicada al renderizar log.message para evitar filtrar api_key/token/password/secret
// a usuarios con sesión activa.

const SECRET_RE =
  /\b(api[_-]?key|apikey|access[_-]?token|token|password|secret)\b\s*[:=]\s*[\w.\-]{6,}/gi;

/**
 * Sustituye cualquier par `clave=valor` o `clave: valor` cuyo clave sea uno
 * de los conocidos y el valor tenga >=6 chars alfanum/underscore/dash/dot.
 *
 * No es perfecto (no detecta JWTs en texto plano fuera de patrón) — es una
 * primera defensa. La verdadera defensa es NO LOGUEAR secretos; el backend
 * tiene un wrapper en server/passwords.ts y platform/phonefarm/audit.py que
 * ya no emiten estos pares.
 */
export function redactSecrets(input: string): string {
  if (typeof input !== 'string' || input.length === 0) return input;
  return input.replace(SECRET_RE, (_m, p1) => `${p1}=[REDACTED]`);
}