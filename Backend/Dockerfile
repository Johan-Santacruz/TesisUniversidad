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

# El encoder base de BETO se descarga aquí, al construir, y no al arrancar.
# `AutoModel.from_pretrained` va a HuggingFace la primera vez: en un servidor
# sin salida a internet la aplicación levanta igual, pero el clasificador queda
# como no disponible y el fallo solo se ve al analizar un testimonio. Bajarlo
# ahora hace el arranque reproducible y sin red.
RUN python -c "\
from transformers import AutoModel, AutoTokenizer; \
m='dccuchile/bert-base-spanish-wwm-cased'; \
AutoModel.from_pretrained(m); \
AutoTokenizer.from_pretrained(m); \
print('BETO en cache')"

COPY . .

# Los pesos AFINADOS (model_categoria.pt y model_subcategoria.pt) sí quedan
# fuera: pesan 840 MB y se montan como volumen desde el servidor. Lo que la
# imagen trae es solo el encoder base que ambos comparten.
ENV SENDA_BETO_ARTIFACT_DIR=/app/ml-artifacts/violencia_classifier_artifacts \
    PYTHONUNBUFFERED=1

EXPOSE 8000

# La migración corre al arrancar y no al construir: la base vive en un volumen
# que en tiempo de construcción todavía no existe.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000"]
