// ---------------------------------------------------------------------------
// Sesiones del panel. Almacén desacoplado (paso 1: memoria; paso 5: SQLite)
// con la misma interfaz: get/set/delete/cleanup + hashing de tokens.
// ---------------------------------------------------------------------------

import { createHash, randomBytes, timingSafeEqual } from "crypto";

export interface SessionUser {
  id: string;
  username: string;
  role: "admin" | "operator";
  email: string;
  expiresAt: number;
}

export const SESSION_COOKIE = "pf_session";
export const SESSION_MAX_AGE_SECONDS = 86400; // 24h

/** Comparación resistente a timing attacks. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class SessionStore {
  private map = new Map<string, SessionUser>(); // key = sha256(token)

  get(token: string | null): SessionUser | null {
    if (!token) return null;
    const s = this.map.get(hashToken(token));
    if (!s) return null;
    if (s.expiresAt < Date.now()) {
      this.map.delete(hashToken(token));
      return null;
    }
    return s;
  }

  set(token: string, user: SessionUser): void {
    this.map.set(hashToken(token), user);
  }

  delete(token: string | null): void {
    if (token) this.map.delete(hashToken(token));
  }

  /** Elimina sesiones expiradas. Devuelve cuántas quedan (para tests/límites). */
  cleanup(): number {
    const now = Date.now();
    for (const [k, s] of this.map) if (s.expiresAt < now) this.map.delete(k);
    return this.map.size;
  }

  get size(): number {
    return this.map.size;
  }
}

/** Crea una sesión nueva con token aleatorio (un token por login). */
export function newSessionToken(): string {
  return `token_pf_${randomBytes(18).toString("hex")}`;
}
