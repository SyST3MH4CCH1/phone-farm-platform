// ---------------------------------------------------------------------------
// Acceso SQLite desde Express (better-sqlite3). El DUEÑO de las migraciones es
// Python (platform/phonefarm/db.py); este módulo solo abre la BD con los mismos
// PRAGMAs (WAL, foreign_keys, busy_timeout) y consulta los datos del panel
// (usuarios/sesiones — pasos 3/5).
// ---------------------------------------------------------------------------

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

export function defaultDbPath(): string {
  return (
    process.env.PHONEFARM_DB_PATH ||
    path.join(process.cwd(), "platform", "data", "phonefarm.db")
  );
}

export function openDb(dbPath: string = defaultDbPath()): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  return db;
}

export function countAdmins(db: Database.Database): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get() as { n: number };
  return row.n;
}

/** Guarda de arranque: el panel no arranca sin admin inicial (paso 3). */
export function assertAdminExists(db: Database.Database, dbPath: string = defaultDbPath()): void {
  if (!fs.existsSync(dbPath)) {
    throw new Error(
      "[FATAL] No existe la BD de usuarios. Crea el primer admin (esto inicializa la BD): " +
      "platform\\.venv\\Scripts\\python.exe -m phonefarm.admin create --username admin"
    );
  }
  let tables: unknown;
  try {
    tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
  } catch {
    tables = undefined;
  }
  if (!tables) {
    throw new Error(
      "[FATAL] La BD no está migrada. Ejecuta: " +
      "platform\\.venv\\Scripts\\python.exe -m phonefarm.admin create --username admin"
    );
  }
  if (countAdmins(db) === 0) {
    throw new Error(
      "[FATAL] No hay usuario admin en la BD. Crea el primero con: " +
      "platform\\.venv\\Scripts\\python.exe -m phonefarm.admin create --username admin"
    );
  }
}
