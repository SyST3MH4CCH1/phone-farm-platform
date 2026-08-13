// ---------------------------------------------------------------------------
// Política central de egress/SSRF de Express (paso 9).
// - interno: solo http/https hacia hosts de la allowlist (loopback/MPT/Flask).
// - externo: sin credenciales en URL; resolución DNS que caiga en IP privada/
//   loopback/link-local se rechaza (anti SSRF/DNS rebinding).
// ---------------------------------------------------------------------------

import { lookup } from "dns/promises";
import net from "net";

export const INTERNAL_HOSTS = new Set(["127.0.0.1", "localhost", "moneyprinter", "host.docker.internal"]);

export class EgressError extends Error {}

function parse(url: string): URL {
  try {
    return new URL(url);
  } catch {
    throw new EgressError("URL mal formada");
  }
}

function isBlockedIp(ip: string): boolean {
  if (net.isIP(ip) === 0) return true;
  const parts = ip.split(".").map(Number);
  if (parts.length === 4) {
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true; // link-local
    if (parts[0] === 0 || parts[0] >= 224) return true; // unspecified/multicast/reserved
  }
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    if (v === "::1" || v.startsWith("fe80") || v.startsWith("fc") || v.startsWith("fd") || v === "::") return true;
  }
  return false;
}

export function guardInternalUrl(url: string, allowedHosts: Set<string> = INTERNAL_HOSTS): URL {
  const u = parse(url);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new EgressError("esquema no permitido");
  if (u.username || u.password) throw new EgressError("credenciales en URL no permitidas");
  const host = u.hostname.toLowerCase();
  if (!allowedHosts.has(host)) throw new EgressError(`host interno no permitido: ${host}`);
  return u;
}

export async function guardExternalUrl(url: string): Promise<URL> {
  const u = parse(url);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new EgressError("esquema no permitido");
  if (u.username || u.password) throw new EgressError("credenciales en URL no permitidas");
  const host = u.hostname.toLowerCase();
  if (net.isIP(host) !== 0) {
    if (isBlockedIp(host)) throw new EgressError(`IP bloqueada: ${host}`);
    return u;
  }
  const records = await lookup(host, { all: true });
  for (const r of records) {
    if (isBlockedIp(r.address)) throw new EgressError(`IP bloqueada (${r.address}) para ${host}`);
  }
  return u;
}

/** GET interno seguro: misma política + redirects que cambien host/esquema → rechazo. */
export async function safeFetchInternal(url: string, init: RequestInit = {}, allowedHosts: Set<string> = INTERNAL_HOSTS): Promise<Response> {
  guardInternalUrl(url, allowedHosts);
  const res = await fetch(url, { ...init, redirect: "manual" });
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location") || "";
    if (location.startsWith("http")) guardInternalUrl(location, allowedHosts);
  }
  return res;
}
