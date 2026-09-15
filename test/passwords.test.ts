import { describe, it, expect } from "vitest";
import { randomBytes, scryptSync } from "crypto";
import { verifyPassword, hashPassword, needsRehash, OWASP_SCRYPT_N } from "../server/passwords";

// ponytail: minimal self-check — no fixture framework needed
describe("passwords — scrypt N upgrade", () => {
  // Manually build a legacy hash with N=2^14 (before OWASP-17 upgrade)
  const LEGACY_HASH = (() => {
    const N = 2 ** 14, R = 8, P = 1;
    const salt = randomBytes(16);
    const dk = scryptSync("test-password-legacy", salt, 32, { N, r: R, p: P });
    return `$scrypt$${N}$${R}$${P}$${salt.toString("hex")}$${dk.toString("hex")}`;
  })();

  // Current machine hash (N=2^14 — machine can't do N=2^17 due to OpenSSL memory limit)
  const CURRENT_HASH = hashPassword("test-password-current");

  // Fake OWASP-target hash for needsRehash parsing test (N=2^17, verifyPassword not tested)
  const FAKE_OWASP_HASH = `$scrypt$${OWASP_SCRYPT_N}$${8}$${1}$${randomBytes(16).toString("hex")}$${"a".repeat(64)}`;

  it("legacy N=2^14 hash verifies OK", () => {
    expect(verifyPassword("test-password-legacy", LEGACY_HASH)).toBe(true);
  });

  it("legacy N=2^14 hash needsRehash=true", () => {
    expect(needsRehash(LEGACY_HASH)).toBe(true);
  });

  it("current N=2^14 machine hash verifies OK", () => {
    expect(verifyPassword("test-password-current", CURRENT_HASH)).toBe(true);
  });

  it("current N=2^14 machine hash needsRehash=true (below OWASP target)", () => {
    expect(needsRehash(CURRENT_HASH)).toBe(true);
  });

  it("OWASP-target N=2^17 needsRehash=false", () => {
    // verifyPassword not called: N=2^17 exceeds machine memory; parsing is sufficient
    expect(needsRehash(FAKE_OWASP_HASH)).toBe(false);
  });

  it("wrong password on legacy hash → false", () => {
    expect(verifyPassword("wrong-password", LEGACY_HASH)).toBe(false);
  });

  it("malformed hash → needsRehash=false (safe default)", () => {
    expect(needsRehash("not-a-scrypt-hash")).toBe(false);
  });
});
