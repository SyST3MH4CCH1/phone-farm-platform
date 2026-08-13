// ---------------------------------------------------------------------------
// Backup cifrado .pfbackup (paso 10): envelope v1 compatible con Python.
// Clave derivada de la passphrase con scrypt (N=2^14, r=8, p=1) → HKDF-SHA256
// → AES-256-GCM. Cabeceras sin datos sensibles (solo salt/iv/tag/ciphertext).
// ---------------------------------------------------------------------------

import { createCipheriv, randomBytes, scryptSync, createHmac } from "crypto";

export interface BackupEnvelope {
  format: string;
  kdf: string;
  kdf_params: { n: number; r: number; p: number };
  info: string;
  pass_salt: string; // b64 salt scrypt (passphrase)
  salt: string; // b64 salt HKDF interno
  iv: string;
  tag: string;
  ciphertext: string;
}

const SCRYPT_N = 2 ** 14;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

function hkdfSha256(ikm: Buffer, salt: Buffer, info: string, length = 32): Buffer {
  const extract = createHmac("sha256", salt).update(ikm).digest();
  const infoBuf = Buffer.from(info, "utf8");
  return createHmac("sha256", extract).update(Buffer.concat([infoBuf, Buffer.from([1])])).digest().subarray(0, length);
}

export function encryptPassphraseEnvelope(passphrase: string, data: Buffer): BackupEnvelope {
  const passSalt = randomBytes(16);
  const key = scryptSync(passphrase, passSalt, 32, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  const hkdfSalt = randomBytes(16);
  const encKey = hkdfSha256(key, hkdfSalt, "pfbackup-passphrase-v1");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey, iv, { authTagLength: 16 });
  const ct = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    format: "v1",
    kdf: "scrypt",
    kdf_params: { n: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
    info: "pfbackup-passphrase-v1",
    pass_salt: passSalt.toString("base64"),
    salt: hkdfSalt.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ct.toString("base64"),
  };
}

export function envelopeToJson(envelope: BackupEnvelope): string {
  return JSON.stringify(envelope);
}
