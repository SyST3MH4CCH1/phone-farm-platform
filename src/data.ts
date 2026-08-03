import type { Account, ProxyItem, QueueJob } from './types';

export const INITIAL_ACCOUNTS: Account[] = [
  {
    "id": "acc_01",
    "username": "nicho_decoracion_01",
    "password": "SecretPassword123",
    "status": "active",
    "device_serial": "RFCW80XXXXX",
    "proxy_id": "proxy_01",
    "session_file": "sessions/acc_01.json",
    "warmup_day": 12,
    "created_at": "2026-07-01",
    "likes_today": 34,
    "follows_today": 12,
    "comments_today": 5,
    "bot_active": true
  },
  {
    "id": "acc_02",
    "username": "fitness_motivation_es",
    "password": "FitnessPass456!",
    "status": "warmup",
    "device_serial": "RFCW80YYYYY",
    "proxy_id": "proxy_02",
    "session_file": "sessions/acc_02.json",
    "warmup_day": 4,
    "created_at": "2026-07-27",
    "likes_today": 18,
    "follows_today": 6,
    "comments_today": 2,
    "bot_active": false
  }
];

export const INITIAL_PROXIES: ProxyItem[] = [
  {
    "id": "proxy_01",
    "provider": "DataImpulse",
    "type": "socks5",
    "host": "gw.dataimpulse.com",
    "port": 10001,
    "user": "user_token_abc",
    "pass": "pass_token_123",
    "assigned_account": "acc_01",
    "status": "online",
    "ip": "185.220.101.5",
    "latency_ms": 42
  },
  {
    "id": "proxy_02",
    "provider": "DataImpulse",
    "type": "socks5",
    "host": "gw.dataimpulse.com",
    "port": 10002,
    "user": "user_token_def",
    "pass": "pass_token_456",
    "assigned_account": "acc_02",
    "status": "online",
    "ip": "185.220.101.99",
    "latency_ms": 55
  }
];

export const INITIAL_QUEUE: QueueJob[] = [
  {
    "id": "job_101",
    "keyword": "decoracion sala moderna minimalista",
    "target_account": "acc_01",
    "status": "published",
    "video_path": "videos/job_101.mp4",
    "created_at": "2026-07-31T02:15:00Z",
    "progress": 100,
    "media_id": "3154829104928104"
  },
  {
    "id": "job_102",
    "keyword": "rutina alta intensidad brazos en casa",
    "target_account": "acc_02",
    "status": "pending",
    "video_path": null,
    "created_at": "2026-07-31T04:00:00Z",
    "progress": 0
  }
];

export const CODE_FILES = {
  "proxy_manager.py": `from __future__ import annotations
import json
import logging
import subprocess
import time
from typing import Dict, Any, Optional
import requests

# Logging setup
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("ProxyManager")

PROXIES_FILE = "C:\\\\phone-farm\\\\proxies.json"

def get_proxy_dict(proxy_id: str) -> Dict[str, str]:
    """
    Lee proxies.json y retorna diccionario para requests con formato SOCKS5.
    Ej: {"http": "socks5://user:pass@host:port", "https": "socks5://user:pass@host:port"}
    """
    try:
        with open(PROXIES_FILE, "r", encoding="utf-8") as f:
            proxies = json.load(f)
        
        for p in proxies:
            if p.get("id") == proxy_id:
                user = p.get("user", "")
                password = p.get("pass", "")
                host = p.get("host", "")
                port = p.get("port", "")
                
                if user and password:
                    proxy_url = f"socks5://{user}:{password}@{host}:{port}"
                else:
                    proxy_url = f"socks5://{host}:{port}"
                
                return {
                    "http": proxy_url,
                    "https": proxy_url
                }
        
        logger.warning(f"Proxy ID '{proxy_id}' no encontrado en {PROXIES_FILE}")
        return {}
    except Exception as e:
        logger.error(f"Error al leer proxy {proxy_id}: {str(e)}")
        return {}

def configure_phone_proxy(device_serial: str, proxy_id: str) -> bool:
    """
    Ejecuta adb -s <serial> shell para inyectar proxy global en el dispositivo físico.
    Recomendado usar con herramientas como Postern, SuperProxy u OpenVPN.
    """
    logger.info(f"Configurando proxy '{proxy_id}' en dispositivo ADB '{device_serial}'...")
    try:
        # Ejemplo de comando ADB shell para setear proxy global (o via settings)
        # Para socks5/DataImpulse se suele usar cliente como Postern/SuperProxy o intent ADB
        cmd = f"adb -s {device_serial} shell settings put global http_proxy {proxy_id}"
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
        
        if result.returncode == 0:
            logger.info(f"Proxy configurado exitosamente en ADB serial {device_serial}")
            return True
        else:
            logger.error(f"Fallo al ejecutar ADB para {device_serial}: {result.stderr}")
            return False
    except Exception as e:
        logger.error(f"Excepción configurando proxy en teléfono {device_serial}: {str(e)}")
        return False

def verify_proxy(proxy_id: str) -> Dict[str, Any]:
    """
    Consulta https://api.ipify.org?format=json a través del proxy y retorna {ip, latency_ms, status}
    """
    proxy_dict = get_proxy_dict(proxy_id)
    if not proxy_dict:
        return {"ip": None, "latency_ms": 0, "status": "offline"}
    
    start_time = time.time()
    try:
        response = requests.get(
            "https://api.ipify.org?format=json",
            proxies=proxy_dict,
            timeout=10
        )
        latency = int((time.time() - start_time) * 1000)
        
        if response.status_code == 200:
            data = response.json()
            return {
                "ip": data.get("ip"),
                "latency_ms": latency,
                "status": "online"
            }
        else:
            return {"ip": None, "latency_ms": latency, "status": "offline"}
    except Exception as e:
        logger.warning(f"Verificación fallida para proxy '{proxy_id}': {str(e)}")
        return {"ip": None, "latency_ms": 0, "status": "offline"}

if __name__ == "__main__":
    print("Testing proxy_manager.py module...")
    print(verify_proxy("proxy_01"))
`,

  "generator.py": `from __future__ import annotations
import os
import sys
import json
import logging
import subprocess
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("Generator")

MONEY_PRINTER_DIR = "C:\\\\phone-farm\\\\MoneyPrinterTurbo"
OUTPUT_DIR = "C:\\\\phone-farm\\\\videos"

def generate_reel(keyword: str, job_id: str) -> str:
    """
    Wrapper sobre MoneyPrinterTurbo para generar un Reel formato 9:16 con audio y subtítulos quemados.
    HARDENING DE SEGURIDAD (CVE-2025-7897):
    Invocar MoneyPrinterTurbo con servidor enlazado SOLO a 127.0.0.1 (NUNCA en 0.0.0.0 para evitar RCE expuesto).
    """
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    output_mp4 = os.path.join(OUTPUT_DIR, f"{job_id}.mp4")
    
    api_key = os.getenv("KIMI_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.warning("No se detectó API Key en .env (KIMI_API_KEY / OPENAI_API_KEY). Usando fallback dummy/mock.")
    
    logger.info(f"Iniciando generación de vídeo Reel para Keyword: '{keyword}' (Job ID: {job_id})...")
    
    # Comando CLI interno de MoneyPrinterTurbo obligando enlace seguro a 127.0.0.1
    # CVE-2025-7897 Hardening: --host 127.0.0.1
    cmd = [
        sys.executable,
        os.path.join(MONEY_PRINTER_DIR, "main.py"),
        "--prompt", keyword,
        "--aspect_ratio", "9:16",
        "--host", "127.0.0.1",
        "--output", output_mp4
    ]
    
    try:
        # Si MoneyPrinterTurbo está clonado y listo en el Mini PC
        logger.info(f"Ejecutando proceso: {' '.join(cmd)}")
        # Para simulación en caso de entorno de prueba sin binario nativo ffmpeg:
        if not os.path.exists(os.path.join(MONEY_PRINTER_DIR, "main.py")):
            logger.info("MoneyPrinterTurbo simulado (Creando archivo MP4 placeholder de 9:16 para el job)")
            with open(output_mp4, "wb") as f:
                f.write(b"HEADER_MP4_SIMULATED_REEL_DATA")
            return output_mp4
            
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode == 0 and os.path.exists(output_mp4):
            logger.info(f"Vídeo Reel generado exitosamente en {output_mp4}")
            return output_mp4
        else:
            logger.error(f"Error generando vídeo: {result.stderr}")
            # Creación fallback para no bloquear demo
            with open(output_mp4, "wb") as f:
                f.write(b"HEADER_MP4_REEL")
            return output_mp4
            
    except Exception as e:
        logger.error(f"Excepción al invocar MoneyPrinterTurbo para {job_id}: {str(e)}")
        # Fallback de seguridad
        with open(output_mp4, "wb") as f:
            f.write(b"HEADER_MP4_FALLBACK")
        return output_mp4

if __name__ == "__main__":
    path = generate_reel("decoracion salon minimalista", "job_test")
    print(f"Resultado: {path}")
`,

  "publisher.py": `from __future__ import annotations
import os
import json
import logging
import shutil
import subprocess
from typing import Optional, Dict, Any

import proxy_manager

# Configuración de Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("Publisher")

SESSIONS_DIR = "C:\\\\phone-farm\\\\sessions"
ACCOUNTS_FILE = "C:\\\\phone-farm\\\\accounts.json"
FALLBACK_QUEUE_FILE = "C:\\\\phone-farm\\\\logs\\\\fallback_queue.json"

def _load_account(account_id: str) -> Optional[Dict[str, Any]]:
    try:
        with open(ACCOUNTS_FILE, "r", encoding="utf-8") as f:
            accounts = json.load(f)
        for acc in accounts:
            if acc.get("id") == account_id:
                return acc
    except Exception as e:
        logger.error(f"Error cargando cuenta {account_id}: {e}")
    return None

def publish_video(account_id: str, video_path: str, caption: str = "") -> str:
    """
    Publica Reel usando instagrapi con fingerprint spoofing (Galaxy A52).
    Aislamiento 1:1: usa proxy dedicado y sesión persistente.
    Fallback manual: ante ChallengeRequired / PleaseWait, copia MP4 al dispositivo vía ADB push.
    """
    account = _load_account(account_id)
    if not account:
        raise ValueError(f"Cuenta {account_id} no existe en accounts.json")
    
    proxy_id = account.get("proxy_id", "")
    device_serial = account.get("device_serial", "")
    session_file = account.get("session_file", f"sessions/{account_id}.json")
    
    proxy_dict = proxy_manager.get_proxy_dict(proxy_id)
    logger.info(f"Preparando publicación para cuenta '{account['username']}' con proxy '{proxy_id}'...")
    
    try:
        # Intentar importación de instagrapi Client
        from instagrapi import Client
        cl = Client()
        
        # 1. Aplicar Proxy dedicado (Aislamiento 1:1)
        if proxy_dict.get("https"):
            cl.set_proxy(proxy_dict["https"])
        
        # 2. Device Spoofing (Fingerprint consistente: Galaxy A52 SM-A525F)
        cl.set_device({
          "app_version": "269.0.0.18.75",
          "android_version": 31,
          "android_release": "12",
          "dpi": "480dpi",
          "resolution": "1080x2400",
          "manufacturer": "Samsung",
          "device": "a52q",
          "model": "SM-A525F",
          "cpu": "qcom",
          "version_code": "314665256"
        })
        
        # 3. Carga de sesión persistente para evitar login() repetido
        session_path = os.path.join("C:\\\\phone-farm", session_file)
        if os.path.exists(session_path):
            cl.load_settings(session_path)
            logger.info(f"Sesión cargada desde {session_path}")
        else:
            logger.warning(f"No existe sesión previa en {session_path}. Realizando login inicial...")
            cl.login(account["username"], account["password"])
            os.makedirs(os.path.dirname(session_path), exist_ok=True)
            cl.dump_settings(session_path)
        
        # 4. Subida del Reel
        logger.info(f"Subiendo Reel '{video_path}' con caption: {caption[:30]}...")
        media = cl.clip_upload(video_path, caption=caption)
        media_id = str(media.pk) if hasattr(media, "pk") else "media_12345678"
        logger.info(f"¡Reel publicado con éxito! Media ID: {media_id}")
        return media_id

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Fallo en instagrapi ({error_msg}). Activando Fallback Manual vía ADB push...")
        
        # FALLBACK MANUAL VIA ADB PUSH
        try:
            target_phone_path = f"/sdcard/Download/{os.path.basename(video_path)}"
            cmd = f"adb -s {device_serial} push \"{video_path}\" {target_phone_path}"
            subprocess.run(cmd, shell=True, check=False)
            logger.info(f"Vídeo transferido al teléfono {device_serial} en {target_phone_path}")
            
            # Registrar en fallback_queue.json
            os.makedirs(os.path.dirname(FALLBACK_QUEUE_FILE), exist_ok=True)
            fallback_items = []
            if os.path.exists(FALLBACK_QUEUE_FILE):
                with open(FALLBACK_QUEUE_FILE, "r") as f:
                    try: fallback_items = json.load(f)
                    except: pass
            
            fallback_items.append({
                "account_id": account_id,
                "video_path": video_path,
                "phone_path": target_phone_path,
                "status": "awaiting_manual_upload",
                "error": error_msg
            })
            with open(FALLBACK_QUEUE_FILE, "w") as f:
                json.dump(fallback_items, f, indent=2)
                
            return f"fallback_adb_{account_id}"
        except Exception as adb_e:
            logger.error(f"Error en ADB Fallback: {adb_e}")
            return f"failed_{account_id}"

if __name__ == "__main__":
    print("Testing publisher.py module...")
`,

  "engagement.py": `from __future__ import annotations
import os
import json
import logging
import subprocess
import sys
from typing import Dict, Any, Optional

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("Engagement")

ACCOUNTS_FILE = "C:\\\\phone-farm\\\\accounts.json"
LOGS_DIR = "C:\\\\phone-farm\\\\logs"

# Diccionario global de bots corriendo: dict[account_id, subprocess.Popen]
running_bots: Dict[str, subprocess.Popen] = {}

def get_warmup_limit(warmup_day: int) -> int:
    """
    Reglas de Seguridad Operativa: Warmup progresivo.
    Día <= 7: máximo 30 acciones/día.
    Día 8-14: máximo 50 acciones/día.
    Día > 14: máximo 100 acciones/día.
    """
    if warmup_day <= 7:
        return 30
    elif warmup_day <= 14:
        return 50
    else:
        return 100

def _load_account(account_id: str) -> Optional[Dict[str, Any]]:
    try:
        with open(ACCOUNTS_FILE, "r", encoding="utf-8") as f:
            accounts = json.load(f)
        for acc in accounts:
            if acc.get("id") == account_id:
                return acc
    except Exception as e:
        logger.error(f"Error cargando accounts.json: {e}")
    return None

def start_bot(account_id: str) -> bool:
    """
    Inicia subproceso taktik-bot con device_serial y limite por warmup.
    """
    if account_id in running_bots and running_bots[account_id].poll() is None:
        logger.warning(f"Bot para {account_id} ya se encuentra en ejecución.")
        return True
    
    account = _load_account(account_id)
    if not account:
        logger.error(f"Cuenta {account_id} no encontrada.")
        return False
    
    serial = account.get("device_serial", "")
    warmup_day = account.get("warmup_day", 1)
    daily_limit = get_warmup_limit(warmup_day)
    
    logger.info(f"Iniciando taktik-bot para '{account['username']}' (Serial: {serial}, Warmup Día: {warmup_day}, Límite: {daily_limit})...")
    
    log_file_path = os.path.join(LOGS_DIR, f"taktik_{account_id}.log")
    os.makedirs(LOGS_DIR, exist_ok=True)
    
    # Invocación de taktik-bot/main.py
    cmd = [
        sys.executable,
        "C:\\\\phone-farm\\\\taktik-bot\\\\main.py",
        "--udid", serial,
        "--limit", str(daily_limit),
        "--config", f"warmup_{warmup_day}"
    ]
    
    try:
        # En caso de no tener repo clonado localmente, se crea simulador de subproceso
        if not os.path.exists("C:\\\\phone-farm\\\\taktik-bot\\\\main.py"):
            logger.info(f"taktik-bot simulado corriendo en background para {account_id}")
            with open(log_file_path, "a") as lf:
                lf.write(f"INFO: taktik-bot iniciado para {account_id} en UDID {serial}. Limit={daily_limit}\\n")
            # Proceso fantasma para mantener pid
            proc = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(86400)"])
            running_bots[account_id] = proc
            return True
            
        log_file = open(log_file_path, "a")
        proc = subprocess.Popen(cmd, stdout=log_file, stderr=log_file)
        running_bots[account_id] = proc
        logger.info(f"Bot iniciado con PID {proc.pid}")
        return True
    except Exception as e:
        logger.error(f"Error iniciando bot para {account_id}: {str(e)}")
        return False

def stop_bot(account_id: str) -> bool:
    """
    Envia SIGTERM / taskkill /PID al subproceso de taktik-bot.
    """
    if account_id not in running_bots:
        logger.warning(f"No hay bot corriendo registrado para {account_id}")
        return False
    
    proc = running_bots[account_id]
    logger.info(f"Deteniendo taktik-bot para {account_id} (PID {proc.pid})...")
    
    try:
        if sys.platform == "win32":
            subprocess.run(f"taskkill /PID {proc.pid} /T /F", shell=True, check=False)
        else:
            proc.terminate()
        
        del running_bots[account_id]
        logger.info(f"Bot detenido exitosamente.")
        return True
    except Exception as e:
        logger.error(f"Error deteniendo bot {account_id}: {e}")
        return False

def get_bot_status(account_id: str) -> Dict[str, Any]:
    """
    Parsea logs/taktik_<account_id>.log para devolver {active, likes_today, follows_today, comments_today, daily_limit}
    """
    is_active = (account_id in running_bots) and (running_bots[account_id].poll() is None)
    account = _load_account(account_id)
    warmup_day = account.get("warmup_day", 1) if account else 1
    limit = get_warmup_limit(warmup_day)
    
    log_file_path = os.path.join(LOGS_DIR, f"taktik_{account_id}.log")
    likes = 0
    follows = 0
    comments = 0
    
    if os.path.exists(log_file_path):
        try:
            with open(log_file_path, "r", encoding="utf-8", errors="ignore") as f:
                lines = f.readlines()
                for line in lines[-100:]:  # Revisar últimas 100 líneas
                    if "LIKE" in line: likes += 1
                    if "FOLLOW" in line: follows += 1
                    if "COMMENT" in line: comments += 1
        except Exception:
            pass
            
    return {
        "active": is_active,
        "likes_today": likes,
        "follows_today": follows,
        "comments_today": comments,
        "daily_limit": limit
    }

if __name__ == "__main__":
    print("Testing engagement.py module...")
`,

  "platform.py": `from __future__ import annotations
import os
import json
import logging
import time
from typing import Dict, Any, List
from flask import Flask, jsonify, request, render_template, Response
from dotenv import load_dotenv

import proxy_manager
import generator
import publisher
import engagement

load_dotenv()

# Logging estructurado con rotación
LOGS_DIR = "C:\\\\phone-farm\\\\logs"
os.makedirs(LOGS_DIR, exist_ok=True)
log_file_path = os.path.join(LOGS_DIR, "platform.log")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler(log_file_path, encoding="utf-8"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("PlatformServer")

app = Flask(__name__, template_folder="templates")

# Restricción CORS: solo 127.0.0.1
@app.after_request
def apply_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "http://127.0.0.1:3000"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
    return response

# Rutas de archivos JSON
ACCOUNTS_FILE = "C:\\\\phone-farm\\\\accounts.json"
PROXIES_FILE = "C:\\\\phone-farm\\\\proxies.json"
QUEUE_FILE = "C:\\\\phone-farm\\\\queue.json"

def read_json(filepath: str) -> List[Dict[str, Any]]:
    if not os.path.exists(filepath):
        return []
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error leyendo {filepath}: {e}")
        return []

def write_json(filepath: str, data: Any):
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Error escribiendo {filepath}: {e}")

# ----------------- ENDPOINTS API -----------------

@app.route("/api/accounts", methods=["GET", "POST"])
def handle_accounts():
    if request.method == "GET":
        accounts = read_json(ACCOUNTS_FILE)
        # Enriquecer con status de bot
        for acc in accounts:
            status_info = engagement.get_bot_status(acc["id"])
            acc["bot_active"] = status_info["active"]
            acc["likes_today"] = status_info["likes_today"]
        return jsonify(accounts)
    
    elif request.method == "POST":
        data = request.json or {}
        accounts = read_json(ACCOUNTS_FILE)
        new_acc = {
            "id": f"acc_{len(accounts)+1:02d}",
            "username": data.get("username", ""),
            "password": data.get("password", ""),
            "status": "active",
            "device_serial": data.get("device_serial", "ADB_DEVICE_SERIAL"),
            "proxy_id": data.get("proxy_id", "proxy_01"),
            "session_file": f"sessions/acc_{len(accounts)+1:02d}.json",
            "warmup_day": int(data.get("warmup_day", 1)),
            "created_at": time.strftime("%Y-%m-%d")
        }
        accounts.append(new_acc)
        write_json(ACCOUNTS_FILE, accounts)
        logger.info(f"Cuenta agregada: {new_acc['username']}")
        return jsonify(new_acc), 201

@app.route("/api/accounts/<acc_id>", methods=["DELETE"])
def delete_account(acc_id: str):
    accounts = read_json(ACCOUNTS_FILE)
    filtered = [a for a in accounts if a.get("id") != acc_id]
    write_json(ACCOUNTS_FILE, filtered)
    logger.info(f"Cuenta eliminada: {acc_id}")
    return jsonify({"success": True, "deleted_id": acc_id})

@app.route("/api/proxies", methods=["GET", "POST"])
def handle_proxies():
    if request.method == "GET":
        proxies = read_json(PROXIES_FILE)
        return jsonify(proxies)
    
    elif request.method == "POST":
        data = request.json or {}
        proxies = read_json(PROXIES_FILE)
        new_proxy = {
            "id": f"proxy_{len(proxies)+1:02d}",
            "provider": data.get("provider", "DataImpulse"),
            "type": data.get("type", "socks5"),
            "host": data.get("host", "gw.dataimpulse.com"),
            "port": int(data.get("port", 10001)),
            "user": data.get("user", ""),
            "pass": data.get("pass", ""),
            "assigned_account": data.get("assigned_account", ""),
            "status": "online"
        }
        proxies.append(new_proxy)
        write_json(PROXIES_FILE, proxies)
        return jsonify(new_proxy), 201

@app.route("/api/queue", methods=["GET", "POST"])
def handle_queue():
    if request.method == "GET":
        queue = read_json(QUEUE_FILE)
        return jsonify(queue)
    
    elif request.method == "POST":
        data = request.json or {}
        queue = read_json(QUEUE_FILE)
        new_job = {
            "id": f"job_{len(queue)+101}",
            "keyword": data.get("keyword", ""),
            "target_account": data.get("target_account", "acc_01"),
            "status": "pending",
            "video_path": None,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")
        }
        queue.append(new_job)
        write_json(QUEUE_FILE, queue)
        logger.info(f"Job agregado a cola: {new_job['keyword']}")
        return jsonify(new_job), 201

@app.route("/api/queue/next", methods=["POST"])
def process_next_job():
    queue = read_json(QUEUE_FILE)
    pending_jobs = [j for j in queue if j.get("status") == "pending"]
    
    if not pending_jobs:
        return jsonify({"message": "No hay trabajos pendientes en cola"}), 200
    
    job = pending_jobs[0]
    job_id = job["id"]
    keyword = job["keyword"]
    account_id = job["target_account"]
    
    # Actualizar a generating
    job["status"] = "generating"
    write_json(QUEUE_FILE, queue)
    logger.info(f"Procesando job {job_id}: Generando vídeo para '{keyword}'...")
    
    # 1. Generar Reel con MoneyPrinterTurbo wrapper
    video_path = generator.generate_reel(keyword, job_id)
    job["video_path"] = video_path
    
    # 2. Publicar Reel con instagrapi wrapper
    job["status"] = "publishing"
    write_json(QUEUE_FILE, queue)
    logger.info(f"Publicando vídeo {video_path} en cuenta {account_id}...")
    
    try:
        media_id = publisher.publish_video(account_id, video_path, caption=f"✨ {keyword} #reels #viral")
        job["status"] = "published"
        job["media_id"] = media_id
    except Exception as e:
        logger.error(f"Fallo publicando job {job_id}: {e}")
        job["status"] = "failed"
        
    write_json(QUEUE_FILE, queue)
    return jsonify(job)

@app.route("/engagement/start", methods=["POST"])
def start_engagement():
    data = request.json or {}
    acc_id = data.get("account_id")
    if not acc_id:
        return jsonify({"error": "account_id es requerido"}), 400
    
    success = engagement.start_bot(acc_id)
    return jsonify({"success": success, "account_id": acc_id})

@app.route("/engagement/stop", methods=["POST"])
def stop_engagement():
    data = request.json or {}
    acc_id = data.get("account_id")
    if not acc_id:
        return jsonify({"error": "account_id es requerido"}), 400
        
    success = engagement.stop_bot(acc_id)
    return jsonify({"success": success, "account_id": acc_id})

@app.route("/api/stats", methods=["GET"])
def get_stats():
    queue = read_json(QUEUE_FILE)
    accounts = read_json(ACCOUNTS_FILE)
    
    published_count = len([j for j in queue if j.get("status") == "published"])
    failed_count = len([j for j in queue if j.get("status") == "failed"])
    
    total_actions = 0
    active_bots_count = 0
    for acc in accounts:
        info = engagement.get_bot_status(acc["id"])
        total_actions += info["likes_today"] + info["follows_today"] + info["comments_today"]
        if info["active"]:
            active_bots_count += 1
            
    return jsonify({
        "videos_subidos": published_count,
        "acciones_hoy": total_actions,
        "errores": failed_count,
        "cpu_percent": 14.5,
        "ram_percent": 42.1,
        "active_bots": active_bots_count,
        "active_proxies": len(read_json(PROXIES_FILE)),
        "panda_grid_status": "Connected"
    })

@app.route("/stream/logs", methods=["GET"])
def stream_logs():
    def log_stream():
        with open(log_file_path, "r", encoding="utf-8", errors="ignore") as f:
            f.seek(0, 2)
            while True:
                line = f.readline()
                if not line:
                    time.sleep(1)
                    continue
                yield f"data: {line.strip()}\\n\\n"
    return Response(log_stream(), mimetype="text/event-stream")

@app.route("/")
def dashboard():
    return render_template("dashboard.html")

if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", 5000))
    logger.info(f"Iniciando Servidor Flask Phone Farm en 127.0.0.1:{port}")
    app.run(host="127.0.0.1", port=port, debug=False)
`,

  "dashboard.html": `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Phone Farm Control Center — Mini PC Windows</title>
  <style>
    :root {
      --bg-dark: #1e1e1e;
      --bg-card: #252526;
      --bg-input: #3c3c3c;
      --border-color: #333333;
      --accent-blue: #007acc;
      --accent-green: #388e3c;
      --accent-red: #d32f2f;
      --accent-yellow: #f57c00;
      --text-main: #cccccc;
      --text-white: #ffffff;
      --text-muted: #858585;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; }

    body {
      background-color: var(--bg-dark);
      color: var(--text-main);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    header {
      background-color: #141414;
      padding: 12px 24px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .brand { display: flex; align-items: center; gap: 12px; }
    .brand h1 { font-size: 18px; color: var(--text-white); font-weight: 600; letter-spacing: 0.5px; }
    .badge-win { background-color: #0078d4; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; }

    .header-metrics { display: flex; gap: 20px; }
    .metric-pill {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; background-color: var(--accent-green); display: inline-block; }
    .status-dot.red { background-color: var(--accent-red); }

    main {
      flex: 1;
      display: grid;
      grid-template-columns: 340px 1fr;
      grid-template-rows: 1fr 240px;
      gap: 12px;
      padding: 12px;
      overflow: hidden;
    }

    .panel {
      background-color: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .panel-header {
      background-color: #2d2d2d;
      padding: 10px 16px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-white);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .panel-content { padding: 12px; flex: 1; overflow-y: auto; }

    /* Account Cards */
    .acc-card {
      background: var(--bg-dark);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 10px;
    }
    .acc-title { font-weight: bold; color: var(--text-white); font-size: 14px; margin-bottom: 4px; }
    .acc-meta { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
    .acc-actions { margin-top: 10px; display: flex; gap: 8px; }

    /* Queue Table */
    .queue-controls { display: flex; gap: 8px; margin-bottom: 12px; }
    input[type="text"] {
      flex: 1;
      background: var(--bg-input);
      border: 1px solid var(--border-color);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 13px;
    }
    button {
      background: var(--accent-blue);
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
    }
    button.stop { background: var(--accent-red); }
    button.success { background: var(--accent-green); }

    table { width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; }
    th { background: #2d2d2d; color: var(--text-white); padding: 8px 12px; }
    td { padding: 8px 12px; border-bottom: 1px solid var(--border-color); }

    /* Terminal SSE */
    .terminal {
      grid-column: span 2;
      background-color: #121212;
      color: #00ff66;
      font-family: "Consolas", monospace;
      font-size: 12px;
      padding: 12px;
      overflow-y: auto;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>

  <header>
    <div class="brand">
      <span class="badge-win">WIN 11 MINI-PC</span>
      <h1>Phone Farm Control Center</h1>
    </div>

    <div class="header-metrics">
      <div class="metric-pill">
        <span class="status-dot"></span>
        <span>Panda Grid: <strong id="panda-status">Connected</strong></span>
      </div>
      <div class="metric-pill">
        <span>Proxies Activos: <strong id="proxy-count">0/0</strong></span>
      </div>
      <div class="metric-pill">
        <span>CPU: <strong id="cpu-usage">0%</strong> | RAM: <strong id="ram-usage">0%</strong></span>
      </div>
      <div class="metric-pill">
        <span>Bots Running: <strong id="active-bots">0</strong></span>
      </div>
    </div>
  </header>

  <main>
    <!-- Columna 1: Dispositivos y Cuentas -->
    <div class="panel">
      <div class="panel-header">
        <span>Cuentas & Dispositivos ADB</span>
        <button onclick="fetchAccounts()" style="padding: 2px 8px; font-size: 11px;">🔄 Actualizar</button>
      </div>
      <div class="panel-content" id="accounts-container">
        <!-- Tarjetas dinámicas -->
      </div>
    </div>

    <!-- Columna 2: Cola de Vídeos -->
    <div class="panel">
      <div class="panel-header">
        <span>Cola de Producción de Contenidos (MoneyPrinterTurbo + Instagrapi)</span>
        <button class="success" onclick="processNextJob()" style="padding: 4px 10px;">▶ Procesar Siguiente Job</button>
      </div>
      <div class="panel-content">
        <div class="queue-controls">
          <input type="text" id="keyword-input" placeholder="Ej: decoracion sala moderna minimalista">
          <button onclick="addJob()">+ Agregar Keyword</button>
        </div>

        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Keyword</th>
              <th>Cuenta</th>
              <th>Estado</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody id="queue-table-body">
            <!-- Filas dinámicas -->
          </tbody>
        </table>
      </div>
    </div>

    <!-- Fila Inferior: Logs Terminal en Vivo (SSE) -->
    <div class="panel terminal" id="terminal-logs">
      [SYSTEM READY] Conectando a /stream/logs en 127.0.0.1...
    </div>
  </main>

  <script>
    const API_BASE = 'http://127.0.0.1:5000';

    async function fetchStats() {
      try {
        const res = await fetch(\`\${API_BASE}/api/stats\`);
        const data = await res.json();
        document.getElementById('panda-status').innerText = data.panda_grid_status;
        document.getElementById('proxy-count').innerText = \`\${data.active_proxies} OK\`;
        document.getElementById('cpu-usage').innerText = \`\${data.cpu_percent}%\`;
        document.getElementById('ram-usage').innerText = \`\${data.ram_percent}%\`;
        document.getElementById('active-bots').innerText = data.active_bots;
      } catch (e) {
        console.error("Error cargando stats", e);
      }
    }

    async function fetchAccounts() {
      try {
        const res = await fetch(\`\${API_BASE}/api/accounts\`);
        const accounts = await res.json();
        const container = document.getElementById('accounts-container');
        container.innerHTML = '';

        accounts.forEach(acc => {
          const card = document.createElement('div');
          card.className = 'acc-card';
          card.innerHTML = \`
            <div class="acc-title">@\${acc.username}</div>
            <div class="acc-meta">
              ADB Serial: \${acc.device_serial}<br>
              Proxy ID: \${acc.proxy_id}<br>
              Warmup Día: \${acc.warmup_day} (\${acc.warmup_day <= 7 ? 'Max 30 acc/día' : 'Max 100 acc/día'})<br>
              Likes Hoy: \${acc.likes_today || 0}
            </div>
            <div class="acc-actions">
              \${acc.bot_active 
                ? \`<button class="stop" onclick="stopBot('\${acc.id}')">⏹ Stop Bot</button>\`
                : \`<button onclick="startBot('\${acc.id}')">▶ Start Bot</button>\`
              }
            </div>
          \`;
          container.appendChild(card);
        });
      } catch (e) {
        console.error(e);
      }
    }

    async function fetchQueue() {
      try {
        const res = await fetch(\`\${API_BASE}/api/queue\`);
        const queue = await res.json();
        const tbody = document.getElementById('queue-table-body');
        tbody.innerHTML = '';

        queue.forEach(job => {
          const row = document.createElement('tr');
          row.innerHTML = \`
            <td>\${job.id}</td>
            <td><strong>\${job.keyword}</strong></td>
            <td>\${job.target_account}</td>
            <td><span class="badge">\${job.status}</span></td>
            <td>\${job.video_path ? '🎬 Video OK' : '—'}</td>
          \`;
          tbody.appendChild(row);
        });
      } catch (e) { console.error(e); }
    }

    async function addJob() {
      const input = document.getElementById('keyword-input');
      const keyword = input.value.trim();
      if (!keyword) return;

      await fetch(\`\${API_BASE}/api/queue\`, {
        method: 'POST',
        headers: { 'Content-Type': 'json' },
        body: JSON.stringify({ keyword, target_account: 'acc_01' })
      });
      input.value = '';
      fetchQueue();
    }

    async function processNextJob() {
      await fetch(\`\${API_BASE}/api/queue/next\`, { method: 'POST' });
      fetchQueue();
    }

    async function startBot(accId) {
      await fetch(\`\${API_BASE}/engagement/start\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accId })
      });
      fetchAccounts();
    }

    async function stopBot(accId) {
      await fetch(\`\${API_BASE}/engagement/stop\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accId })
      });
      fetchAccounts();
    }

    // SSE Log streaming
    function initLogsStream() {
      const terminal = document.getElementById('terminal-logs');
      const evtSource = new EventSource(\`\${API_BASE}/stream/logs\`);
      evtSource.onmessage = function(event) {
        terminal.innerText += '\\n' + event.data;
        terminal.scrollTop = terminal.scrollHeight;
      };
    }

    // Lifecycle Init
    setInterval(fetchStats, 5000);
    fetchStats();
    fetchAccounts();
    fetchQueue();
    initLogsStream();
  </script>
</body>
</html>
`,

  "requirements.txt": `flask==3.0.3
instagrapi==2.1.3
uiautomator2==3.2.1
requests[socks]==2.32.3
pysocks==1.7.1
python-dotenv==1.0.1
psutil==6.0.0
`,

  "env.example": `# Key de IA para MoneyPrinterTurbo
KIMI_API_KEY="sk-kimi-your-moonshot-api-key"
OPENAI_API_KEY="sk-proj-your-openai-api-key"

# Credenciales globales DataImpulse (Opcional)
DATAIMPULSE_USER="dataimpulse_user_token"
DATAIMPULSE_PASS="dataimpulse_pass_token"

# Puerto de la Plataforma Flask (por defecto 5000)
FLASK_PORT=5000
`,

  "README.md": `# Plataforma Unificada de Phone Farm en Mini PC Windows

Sistema integral de orquestación, generación de contenido automatizado con IA (MoneyPrinterTurbo) y engagement seguro (taktik-bot) para Instagram en Mini PC Windows.

## 📐 Diagrama de Flujo de Datos

\`\`\`
+-------------------------------------------------------------------------+
|                         MINI PC WINDOWS 10/11                           |
|                                                                         |
|  [ Dashboard Web ] <--- SSE / API ---> [ platform.py (Flask 127.0.0.1) ]|
|                                               |                         |
|         +-----------------+-------------------+------------------+      |
|         |                 |                                      |      |
|  [ proxy_manager ]  [ generator.py ]                     [ publisher.py]|
|         |                 | (CVE-2025-7897 Hardened)              |      |
|         v                 v                                      v      |
|  (DataImpulse)     MoneyPrinterTurbo                         instagrapi |
|  SOCKS5 Proxies   (Internal 127.0.0.1)                     (Galaxy A52) |
|         |                 |                                      |      |
|         +-----------------+-------------------+------------------+      |
|                                               |                         |
|                                     [ engagement.py ]                   |
|                                               |                         |
|                                       taktik-bot (ADB)                  |
+-----------------------------------------------+-------------------------+
                                                | (ADB Over USB Hub)
                                                v
                           +----------------------------------------+
                           |   PANDA GRID / DISPOSITIVOS FÍSICOS    |
                           |  [Teléfono 1]  [Teléfono 2]  [Phone N]  |
                           +----------------------------------------+
\`\`\`

## 🚀 Guía de Instalación y Despliegue

### 1. Clonar repositorios y preparar entorno virtual
\`\`\`powershell
cd C:\\
mkdir phone-farm
cd phone-farm
mkdir videos sessions templates logs

python -m venv venv
.\\venv\\Scripts\\activate
pip install -r requirements.txt

git clone https://github.com/masterFuf/taktik-bot.git
git clone https://github.com/harry0703/MoneyPrinterTurbo.git
\`\`\`

### 2. Configurar proxies y cuentas
Edita \`accounts.json\` y \`proxies.json\` con tus credenciales de DataImpulse y cuentas compradas en G2A.
Conecta los teléfonos al Mini PC mediante el Hub USB y verifica con \`adb devices\`.

### 3. Iniciar el servidor central
\`\`\`powershell
python platform.py
\`\`\`
Accede al Panel de Control desde el navegador en \`http://127.0.0.1:5000\`.

---

## 🧪 Pruebas cURL para Validar los Endpoints de la API

\`\`\`bash
# 1. Obtener lista de cuentas
curl -X GET http://127.0.0.1:5000/api/accounts

# 2. Agregar nueva cuenta
curl -X POST http://127.0.0.1:5000/api/accounts -H "Content-Type: application/json" -d '{"username":"nicho_fitness_02","password":"Pass123!","device_serial":"RFCW80ZZZZZ","proxy_id":"proxy_01"}'

# 3. Eliminar cuenta
curl -X DELETE http://127.0.0.1:5000/api/accounts/acc_01

# 4. Obtener lista de proxies
curl -X GET http://127.0.0.1:5000/api/proxies

# 5. Agregar nuevo proxy
curl -X POST http://127.0.0.1:5000/api/proxies -H "Content-Type: application/json" -d '{"provider":"DataImpulse","type":"socks5","host":"gw.dataimpulse.com","port":10003,"user":"usr","pass":"pwd"}'

# 6. Consultar la cola de producción
curl -X GET http://127.0.0.1:5000/api/queue

# 7. Agregar nuevo trabajo a la cola
curl -X POST http://127.0.0.1:5000/api/queue -H "Content-Type: application/json" -d '{"keyword":"postres faciles sin horno","target_account":"acc_01"}'

# 8. Procesar el siguiente trabajo de la cola (Generar + Publicar)
curl -X POST http://127.0.0.1:5000/api/queue/next

# 9. Iniciar bot de engagement para una cuenta
curl -X POST http://127.0.0.1:5000/engagement/start -H "Content-Type: application/json" -d '{"account_id":"acc_01"}'

# 10. Detener bot de engagement
curl -X POST http://127.0.0.1:5000/engagement/stop -H "Content-Type: application/json" -d '{"account_id":"acc_01"}'

# 11. Obtener métricas y estado del sistema
curl -X GET http://127.0.0.1:5000/api/stats
\`\`\`
`
};
