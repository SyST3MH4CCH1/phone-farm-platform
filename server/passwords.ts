// ---------------------------------------------------------------------------
// Passwords del panel: formato scrypt idéntico al de platform/phonefarm/admin.py
//   "$scrypt$<N>$<r>$<p>$<salt_hex>$<hash_hex>"
// El login valida contra la tabla users (BD compartida), nunca contra .env.
// ---------------------------------------------------------------------------

import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SCRYPT_N = 2 ** 14;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const dk = scryptSync(password, salt, 32, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `$scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${dk.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 7 || parts[1] !== "scrypt") return false;
  const n = Number(parts[2]);
  const r = Number(parts[3]);
  const p = Number(parts[4]);
  const salt = Buffer.from(parts[5], "hex");
  const expected = Buffer.from(parts[6], "hex");
  if (!salt.length || !expected.length) return false;
  try {
    const dk = scryptSync(password, salt, expected.length, { N: n, r, p });
    return dk.length === expected.length && timingSafeEqual(dk, expected);
  } catch {
    return false;
  }
}
