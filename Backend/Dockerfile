# FFmpeg y FFprobe no son opcionales: el análisis extrae el audio del
# testimonio y el cierre de memoria renderiza el video derivado. Sin ellos la
# aplicación levanta y falla después, en mitad de un análisis.
FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Las dependencias se instalan antes que el código y se leen del propio
# pyproject.toml, que sigue siendo la única fuente: duplicarlas en un
# requirements.txt es garantía de que un día dejen de coincidir.
#
# No se instala el paquete en sí (`pip install .`) porque uvicorn lo importa
# desde el directorio de trabajo. Así, mientras pyproject.toml no cambie,
# editar un archivo no vuelve a bajar torch, que son más de 2 GB.
COPY pyproject.toml ./
RUN python - <<'PY' \
    && pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r /tmp/requisitos.txt
import tomllib
proyecto = tomllib.load(open("pyproject.toml", "rb"))["project"]
dependencias = list(proyecto["dependencies"])
dependencias += proyecto.get("optional-dependencies", {}).get("ml", [])
open("/tmp/requisitos.txt", "w").write("\n".join(dependencias) + "\n")
PY

COPY . .

# Los pesos de BETO no viajan en la imagen: pesan 840 MB y se montan como
# volumen desde el servidor (véase docs/despliegue.md).
ENV SENDA_BETO_ARTIFACT_DIR=/app/ml-artifacts/violencia_classifier_artifacts \
    PYTHONUNBUFFERED=1

EXPOSE 8000

# La migración corre al arrancar y no al construir: la base vive en un volumen
# que en tiempo de construcción todavía no existe.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000"]
