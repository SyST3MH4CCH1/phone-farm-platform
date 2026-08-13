// ---------------------------------------------------------------------------
// Sesiones del panel sobre SQLite (paso 5): solo hashes de tokens, TTL 24h,
// revocación en logout y al cambiar el password. Sobreviven a reinicios.
// ---------------------------------------------------------------------------

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type Database from "better-sqlite3";

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
  constructor(private db: Database.Database) {}

  get(token: string | null): SessionUser | null {
    if (!token) return null;
    const row = this.db
      .prepare(
        `SELECT s.token_hash, s.expires_at, s.revoked, u.id, u.username, u.role
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ?`
      )
      .get(hashToken(token)) as
      | { token_hash: string; expires_at: number; revoked: number; id: string; username: string; role: "admin" | "operator" }
      | undefined;
    if (!row || row.revoked) return null;
    if (row.expires_at < Date.now()) {
      this.deleteByHash(row.token_hash);
      return null;
    }
    return {
      id: row.id,
      username: row.username,
      role: row.role,
      email: `${row.username}@phonefarm.local`,
      expiresAt: row.expires_at,
    };
  }

  set(token: string, user: SessionUser): void {
    this.db
      .prepare(
        `INSERT INTO sessions (token_hash, user_id, expires_at, created_at, revoked)
         VALUES (?,?,?,?,0)`
      )
      .run(hashToken(token), user.id, user.expiresAt, Date.now());
  }

  delete(token: string | null): void {
    if (token) this.deleteByHash(hashToken(token));
  }

  deleteByHash(tokenHash: string): void {
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
  }

  /** Revoca todas las sesiones de un usuario (cambio de password). */
  revokeAllForUser(userId: string): void {
    this.db.prepare("UPDATE sessions SET revoked = 1 WHERE user_id = ?").run(userId);
  }

  /** Elimina sesiones expiradas/revocadas. Devuelve cuántas quedan activas. */
  cleanup(): number {
    this.db.prepare("DELETE FROM sessions WHERE expires_at < ? OR revoked = 1").run(Date.now());
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE expires_at >= ? AND revoked = 0").get(Date.now()) as { n: number };
    return row.n;
  }

  get size(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number };
    return row.n;
  }
}

/** Crea un token de sesión nuevo (un token por login). */
export function newSessionToken(): string {
  return `token_pf_${randomBytes(18).toString("hex")}`;
}
