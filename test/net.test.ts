import { describe, it, expect } from "vitest";
import { isBlockedIp, guardInternalUrl, EgressError, INTERNAL_HOSTS } from "../server/net";

describe("política de egress — isBlockedIp", () => {
  it("bloquea IPv4 privadas/loopback/link-local/reservadas", () => {
    for (const ip of ["10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1", "127.0.0.1", "169.254.169.254", "0.0.0.0", "224.0.0.1", "255.255.255.255"]) {
      expect(isBlockedIp(ip), `IPv4 ${ip} debería bloquearse`).toBe(true);
    }
  });

  it("permite IPv4 públicas", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "192.169.1.1"]) {
      expect(isBlockedIp(ip), `IPv4 ${ip} debería permitirse`).toBe(false);
    }
  });

  it("bloquea IPv4-mapped IPv6 de rangos privados/loopback/metadata (EXP-02)", () => {
    for (const ip of ["::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:192.168.1.1", "::ffff:169.254.169.254", "::ffff:172.16.0.1"]) {
      expect(isBlockedIp(ip), `${ip} debería bloquearse (IPv4 embebida privada)`).toBe(true);
    }
    // forma compat (sin ffff)
    expect(isBlockedIp("::10.0.0.1")).toBe(true);
  });

  it("permite IPv4-mapped IPv6 de IP pública", () => {
    expect(isBlockedIp("::ffff:8.8.8.8")).toBe(false);
    expect(isBlockedIp("::ffff:1.1.1.1")).toBe(false);
  });

  it("bloquea IPv6 especiales", () => {
    for (const ip of ["::1", "::", "fe80::1", "fc00::1", "fd00::1"]) {
      expect(isBlockedIp(ip), `${ip} debería bloquearse`).toBe(true);
    }
  });

  it("rechaza IPs mal formadas", () => {
    expect(isBlockedIp("no-es-ip")).toBe(true);
    expect(isBlockedIp("999.1.1.1")).toBe(true);
  });
});

describe("política de egress — guardInternalUrl", () => {
  it("acepta hosts de la allowlist interna", () => {
    for (const host of INTERNAL_HOSTS) {
      expect(guardInternalUrl(`http://${host}:8080/ping`).hostname).toBe(host);
    }
  });

  it("rechaza hosts fuera de la allowlist y esquemas no http(s)", () => {
    expect(() => guardInternalUrl("http://evil.example/api")).toThrow(EgressError);
    expect(() => guardInternalUrl("https://api.pexels.com/videos")).toThrow(EgressError);
    expect(() => guardInternalUrl("file:///etc/passwd")).toThrow(EgressError);
    expect(() => guardInternalUrl("ftp://127.0.0.1/x")).toThrow(EgressError);
  });

  it("rechaza credenciales en la URL", () => {
    expect(() => guardInternalUrl("http://user:pass@127.0.0.1:5000/api")).toThrow(EgressError);
  });
});
