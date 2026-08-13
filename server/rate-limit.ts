// ---------------------------------------------------------------------------
// Rate limit de login persistente (paso 5): 5 fallos/15 min por usuario+IP y
// 20/15 min por IP, con limpieza de ventanas (tabla rate_limits, sin Map sin
// límite). Se limpia perezosamente y con barrido periódico.
// ---------------------------------------------------------------------------

import type Database from "better-sqlite3";

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds?: number;
}

const WINDOW_MS = 15 * 60 * 1000;

export class LoginRateLimiter {
  constructor(
    private db: Database.Database,
    private opts: { userMax: number; ipMax: number; windowMs?: number } = { userMax: 5, ipMax: 20 }
  ) {}

  private windowMs(): number {
    return this.opts.windowMs ?? WINDOW_MS;
  }

  /** Comprueba el límite SIN contabilizar (para el mensaje 429). */
  check(username: string, ip: string): RateLimitResult {
    const now = Date.now();
    for (const key of [this.keyUser(username, ip), this.keyIp(ip)]) {
      const limit = key.startsWith("login:u:") ? this.opts.userMax : this.opts.ipMax;
      const row = this.db.prepare("SELECT count, window_start FROM rate_limits WHERE key = ?").get(key) as
        | { count: number; window_start: number }
        | undefined;
      if (row && row.window_start + this.windowMs() > now && row.count >= limit) {
        const retryAfterSeconds = Math.ceil((row.window_start + this.windowMs() - now) / 1000);
        return { ok: false, retryAfterSeconds };
      }
    }
    return { ok: true };
  }

  recordFailure(username: string, ip: string): void {
    const now = Date.now();
    for (const key of [this.keyUser(username, ip), this.keyIp(ip)]) {
      const row = this.db.prepare("SELECT count, window_start FROM rate_limits WHERE key = ?").get(key) as
        | { count: number; window_start: number }
        | undefined;
      if (!row || row.window_start + this.windowMs() <= now) {
        this.db
          .prepare("INSERT INTO rate_limits (key, count, window_start) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=1, window_start=excluded.window_start")
          .run(key, now);
      } else {
        this.db.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").run(key);
      }
    }
  }

  /** Login correcto: reinicia el contador usuario+IP (no el global por IP). */
  recordSuccess(username: string, ip: string): void {
    this.db.prepare("DELETE FROM rate_limits WHERE key = ?").run(this.keyUser(username, ip));
  }

  /** Barrido periódico de ventanas vencidas (acotado). */
  cleanup(): void {
    this.db.prepare("DELETE FROM rate_limits WHERE window_start + ? < ?").run(this.windowMs(), Date.now());
  }

  private keyUser(username: string, ip: string): string {
    return `login:u:${username.toLowerCase()}:${ip}`;
  }

  private keyIp(ip: string): string {
    return `login:ip:${ip}`;
  }
}
