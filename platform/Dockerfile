# Phone Farm Platform — imagen del controlador Flask + taktik-bot
FROM python:3.11-slim

# ffmpeg: generación de vídeos (MPT) y demo mode; adb: control de dispositivos;
# fonts-dejavu-core: fuente para drawtext del demo mode
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        fonts-dejavu-core \
        android-tools-adb \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencias de la plataforma
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# taktik-bot (clonado en el build context por scripts/deploy.ps1)
COPY third_party/taktik-bot /app/taktik-bot
RUN pip install --no-cache-dir -r /app/taktik-bot/requirements.txt

ENV PYTHONPATH=/app:/app/taktik-bot
ENV IN_DOCKER=1

COPY . .
RUN chmod +x /app/scripts/docker-entrypoint.sh

EXPOSE 5000

ENTRYPOINT ["bash", "/app/scripts/docker-entrypoint.sh"]
