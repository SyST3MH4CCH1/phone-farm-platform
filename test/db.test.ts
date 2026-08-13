import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openDb, assertAdminExists, countAdmins } from "../server/db";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pf-db-"));
}

describe("db — guarda de arranque (paso 3)", () => {
  it("falla si la BD no existe en disco", () => {
    const db = openDb(":memory:");
    const missing = path.join(tmpDir(), "no-existe.db");
    expect(() => assertAdminExists(db, missing)).toThrow(/No existe la BD/);
    db.close();
  });

  it("falla si la BD no está migrada", () => {
    const p = path.join(tmpDir(), "phonefarm.db");
    const db = openDb(p); // crea el fichero vacío
    expect(() => assertAdminExists(db, p)).toThrow(/no está migrada/);
    db.close();
  });

  it("falla sin admin y pasa con admin creado", () => {
    const p = path.join(tmpDir(), "phonefarm.db");
    const db = openDb(p);
    db.exec(
      `CREATE TABLE users (
         id TEXT PRIMARY KEY,
         username TEXT NOT NULL UNIQUE,
         role TEXT NOT NULL,
         password_hash TEXT NOT NULL,
         created_at TEXT NOT NULL DEFAULT (datetime('now')),
         updated_at TEXT
       );`
    );
    expect(() => assertAdminExists(db, p)).toThrow(/admin/);
    db.prepare("INSERT INTO users (id, username, role, password_hash) VALUES (?,?,?,?)")
      .run("usr_1", "admin", "admin", "hash-placeholder");
    expect(countAdmins(db)).toBe(1);
    expect(() => assertAdminExists(db, p)).not.toThrow();
    db.close();
  });
});
