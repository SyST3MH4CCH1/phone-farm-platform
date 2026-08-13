// Cliente API del panel: añade automáticamente el token CSRF (doble envío)
// a las mutaciones y fija credentials=same-origin. Toda llamada fetch de la
// SPA debería pasar por aquí (paso 2 — CSRF; paso 10 — redacción/errores).

export function csrfToken(): string {
  const m = document.cookie.match(/(?:^|; )pf_csrf=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : "";
}

export function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const method = (init.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD" && !headers.has("X-CSRF-Token")) {
    headers.set("X-CSRF-Token", csrfToken());
  }
  return fetch(url, { ...init, headers, credentials: "same-origin" });
}
