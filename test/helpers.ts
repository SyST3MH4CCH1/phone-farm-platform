// Helpers de test: BD SQLite en memoria con la migración v1 y usuarios scrypt.
import Database from "better-sqlite3";
import { loadConfig } from "../server/config";
import type { AppConfig } from "../server/config";
import { hashPassword } from "../server/passwords";

export const TEST_ADMIN_PW = "test-admin-password-123456";
export const TEST_OPERATOR_PW = "test-operator-password-1234";

/** Esquema mínimo (equivalente a la migración v1 de Python) para tests Node. */
export function seedDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('admin','operator')),
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );
    CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      window_start INTEGER NOT NULL
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      proxy_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      enc_password TEXT,
      meta TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE proxies (
      id TEXT PRIMARY KEY,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      protocol TEXT NOT NULL DEFAULT 'http',
      username TEXT,
      enc_password TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      meta TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      payload TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      idempotency_key TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );
    CREATE TABLE service_tokens (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      principal TEXT NOT NULL,
      scopes TEXT NOT NULL,
      expires_at INTEGER,
      revoked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE audit_log (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL DEFAULT (datetime('now')),
      actor TEXT, role TEXT, action TEXT NOT NULL, object TEXT,
      meta TEXT, request_id TEXT, prev_hash TEXT, hash TEXT
    );
  `);
  const ins = db.prepare("INSERT INTO users (id, username, role, password_hash) VALUES (?,?,?,?)");
  ins.run("usr_admin", "admin", "admin", hashPassword(TEST_ADMIN_PW));
  ins.run("usr_operator", "operator", "operator", hashPassword(TEST_OPERATOR_PW));
  return db;
}

export function testConfig(extra: Record<string, string> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: "test",
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD: TEST_ADMIN_PW,
    OPERATOR_USERNAME: "operator",
    OPERATOR_PASSWORD: TEST_OPERATOR_PW,
    PHONE_FARM_INTERNAL_TOKEN: ""test-token-placeholder"",
    ...extra,
  });
}
