# Phone Farm Platform — imagen del controlador Flask + taktik-bot
# Paso 13: imagen base por digest (python 3.11.11 slim-bookworm, verificado
# 2026-08-13), usuario no-root, sin capabilities y read-only en runtime.
FROM python:3.11.11-slim-bookworm@sha256:081075da77b2b55c23c088251026fb69a7b2bf92471e491ff5fd75c192fd38e5

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
COPY phonefarm/ /app/phonefarm/
RUN chmod +x /app/scripts/docker-entrypoint.sh

# Directorios de runtime: se montan como volúmenes (data/templates) o tmpfs.
RUN mkdir -p /app/data /app/tmp && chown -R nobody:nogroup /app/data /app/tmp

# Usuario NO-root (paso 13): el proceso corre como nobody; los volúmenes del
# host se montan con :ro cuando es posible y los temporales van a tmpfs.
USER nobody

EXPOSE 5000

ENTRYPOINT ["bash", "/app/scripts/docker-entrypoint.sh"]
