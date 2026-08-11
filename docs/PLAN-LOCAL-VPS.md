# Plan de división: Local (Mini PC) vs VPS

**Fecha:** 2026-08-10 · **Objetivo:** decidir qué corre en el Mini PC (con USB/ADB) y qué se mueve a una VPS (barata, 24/7), manteniendo todo interconectado.

---

## 1. Restricción física (la que manda)

Los **teléfonos Android están conectados por USB al Mini PC**. ADB solo puede hablar con ellos desde esa máquina (o vía ADB-over-WiFi/TCP, menos estable). Por tanto:

> **Todo lo que toca ADB, scrcpy, taktik-bot y las sesiones de Instagram vive en el Mini PC (local).**

La VPS no puede "ver" los teléfonos. Lo que sí puede hacer la VPS es: servir el panel al operador (HTTPS), correr MoneyPrinterTurbo (más CPU/RAM), y actuar de reverse-proxy/relay hacia el Mini PC.

---

## 2. Tabla de asignación definitiva

| Componente | Local (Mini PC) | VPS | Notas |
|---|---|---|---|
| ADB daemon :5037 | ✅ **local** | ❌ | USB físico |
| scrcpy (ventana nativa) | ✅ **local** | ❌ | necesita ADB + video |
| `/api/adb/screenshot` (screencap) | ✅ **local** | ➖ proxy | si la VPS es el front, reenvía a local |
| Flask `platform.py` :5000 | ✅ **local** | ➖ proxy | orquesta todo: ADB, taktik, publisher |
| MCP :5001 | ✅ **local** | ➖ proxy | controla taktik vía ADB |
| taktik-bot (Popen) | ✅ **local** | ❌ | subprocess que usa ADB |
| publisher (instagrapi) | ✅ **local** | ➖ | mejor local (misma red/IP que ADB); puede moverse a VPS si usas proxies |
| MoneyPrinterTurbo :8080 | ➖ recomendado local hoy | ✅ **VPS** | ffmpeg+LLM = CPU/RAM; la Mini PC (8GB) se ahoga |
| Express `server.ts` :3000 | ➖ opcional local | ✅ **VPS** | es solo SPA+proxy; muévelo si quieres acceso HTTPS externo |
| Panel `/panda` y SPA | como Express | ✅ **VPS** | misma app que Express |
| JSON de datos (`platform/*.json`) | ✅ **local** | ❌ | estado de cuentas/sesiones junto al orquestador |

**Leyenda:** ✅ debe estar ahí · ➖ puede estar (con relay/proxy) · ❌ no puede.

---

## 3. Arquitecturas concretas

### A. Todo local (estado actual — ya operativo)

```
┌─ Mini PC ─────────────────────────────────────────────┐
│ Navegador → Express:3000 → Flask:5000 ─┬→ MPT:8080    │
│                                        ├→ MCP:5001    │
│                                        └→ ADB:5037 → teléfonos USB
└────────────────────────────────────────────────────────┘
```
- **Pros:** sin latencia, sin exponer nada, 0€ extra.
- **Contras:** panel solo en la red local; MPT compite por RAM con los 8GB del Mini PC.
- **Cuándo:** desarrollo/operación diaria junto a los teléfonos.

### B. Panel en VPS + Mini PC como nodo ADB (recomendado para acceso remoto)

```
Navegador ─HTTPS─▶ [VPS] Express:3000 ──túnel──▶ [Mini PC] Flask:5000 ──▶ ADB/teléfonos
                          │                          ├→ MCP:5001
                          └──túnel──▶ [Mini PC] MPT:8080 (o MPT en VPS)
```
- El operador entra a `https://panel.tudominio.com` (VPS). La VPS reenvía a Flask del Mini PC.
- **Conexión VPS→Mini PC:** usa un túnel (WireGuard, Tailscale, o SSH reverse: `ssh -R 5000:localhost:5000 user@vps`). No abras el 5000/8080 a Internet directo.
- **Pros:** acceso desde cualquier sitio con HTTPS + auth; Mini PC solo hace de "brazo ADB".
- **Contras:** necesitas el túnel siempre arriba; si cae el túnel, el panel no llega al Mini PC.
- **Importante:** el botón **scrcpy** abre una ventana en la máquina donde corre Express. Si Express está en la VPS, scrcpy deberá usar **ADB-over-TCP** hacia el Mini PC (ver §4). Si no configuras eso, deja Express en local y usa la VPS solo como proxy inverso.

### C. Híbrido pesado (MPT en VPS, resto local)

```
Mini PC:  Express:3000 → Flask:5000 → ADB/teléfonos
                    │
                    └──────▶ [VPS] MPT:8080  (toda la generación de vídeo)
```
- Solo se mueve MPT a la VPS (la pieza que más CPU/RAM consume).
- **Pros:** el Mini PC deja de ahogarse generando vídeo; panel sigue local y rápido.
- **Contras:** los `.mp4` se generan en la VPS → hay que bajarlos al Mini PC para publicar/ver. Añade un step de sync (rsync/scp) o sirve `/videos` desde la VPS.

---

## 4. scrcpy y pantalla en vivo cuando Express está en la VPS

Si mueves el panel a la VPS pero los teléfonos siguen en el Mini PC, scrcpy necesita ADB TCP:

```powershell
# En el Mini PC (una vez por dispositivo), abre ADB-over-TCP en el puerto 5555:
adb -s <serial> tcpip 5555

# Desde la VPS (o cualquier máquina), conecta por IP del Mini PC:
adb connect <IP_MINI_PC>:5555
scrcpy -s <IP_MINI_PC>:5555
```

- `/api/adb/screenshot` seguirá funcionando igual (usa el adb daemon local de la VPS → Mini PC por TCP).
- Seguridad: abre 5555 **solo en la red del túnel** o por firewall; no expongas ADB TCP a Internet (no tiene auth fuerte).

---

## 5. Variables de entorno por escenario

| Variable | Local (A) | VPS front (B) | MPT en VPS (C) |
|---|---|---|---|
| `FLASK_BASE` (raíz `.env`) | `http://127.0.0.1:5000` | `http://127.0.0.1:5000` (vía túnel) | `http://127.0.0.1:5000` |
| `MPT_API_URL` | `http://127.0.0.1:8080` | `http://127.0.0.1:8080` | `http://<IP_VPS>:8080` |
| `PHONE_FARM_DATA_DIR` (platform/.env) | `platform/` | `platform/` | `platform/` (local) |
| `ADB_HOST` | `127.0.0.1` | `<IP_MINI_PC>` (si adb TCP) | `127.0.0.1` |
| `EXPOSE_SOURCE` | `false` | `false` | `false` |

> `FLASK_BASE` en el caso B apunta a `127.0.0.1:5000` **en la VPS** porque el túnel SSH `-R` hace que el puerto remoto 5000 sea el Flask local del Mini PC.

---

## 6. Recomendación efectiva (mi consejo)

1. **Hoy (ya operativo):** mantén **todo local (A)**. Es lo más estable con 3 teléfonos y 8GB de RAM.
2. **Próximo paso cuando necesites acceso remoto:** pasa a **B** con Express en una VPS de 1–2€ (Hetzner CX11 / OVH / Contabo) + túnel **Tailscale** (el más simple, sin abrir puertos). Deja Flask/MCP/ADB/MPT en el Mini PC.
3. **Si el Mini PC se queda corto generando vídeo:** añade **C** — mueve solo MPT a la VPS y sincroniza `videos/`.
4. **Nunca** expongas 5000/5001/8080/5037 directamente a Internet; siempre tras túnel + auth.

---

## 7. Checklist de migración (cuando lo hagas)

- [ ] Levantar Tailscale/WireGuard entre VPS y Mini PC.
- [ ] Mover Express a la VPS; `FLASK_BASE`/`MPT_API_URL` apuntando al túnel.
- [ ] Comprobar `GET /api/adb/devices` desde la VPS (debe listar los teléfonos del Mini PC vía ADB TCP o túnel).
- [ ] Abrir `/panda` en la VPS y verificar que los screenshots/flujo funcionan end-to-end.
- [ ] Si usas scrcpy desde la VPS: `adb -s <serial> tcpip 5555` + `adb connect` y firewall limitado.
- [ ] Mover MPT → MPT_API_URL actualizada; probar generación de 1 reel completo.
- [ ] Cerrar puertos en el Mini PC (solo loopback) y abrir solo lo del túnel.

---

*Ver `docs/INTERCONEXION.md` para el mapa de procesos/puertos actual (todo local).*
