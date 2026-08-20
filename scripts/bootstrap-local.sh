#!/usr/bin/env bash
set -euo pipefail

SENDA_PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SENDA_BACKEND="$SENDA_PROJECT_ROOT/Backend"
SENDA_FRONTEND="$SENDA_PROJECT_ROOT/frontend"

if ! command -v python3.12 >/dev/null 2>&1; then
  echo "Se requiere Python 3.12."
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Se requiere Node.js."
  exit 1
fi
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "Se requiere FFmpeg."
  exit 1
fi

cd "$SENDA_BACKEND"
if [[ ! -x .venv/bin/python ]]; then
  python3.12 -m venv .venv
fi
.venv/bin/python -m pip install --upgrade pip
.venv/bin/pip install -e ".[test]"
mkdir -p data/storage

if [[ ! -f .env ]]; then
  SENDA_BOOTSTRAP_AES="$(openssl rand -base64 32 | tr '/+' '_-')"
  SENDA_BOOTSTRAP_JWT="$(openssl rand -base64 32 | tr '/+' '_-')"
  {
    echo "SENDA_SENDA_ENV=development"
    echo "SENDA_DATABASE_URL=sqlite:///./data/senda.db"
    echo "SENDA_STORAGE_DIR=./data/storage"
    echo "SENDA_FRONTEND_ORIGIN=http://localhost:5173"
    echo "SENDA_ENCRYPTION_MASTER_KEY=$SENDA_BOOTSTRAP_AES"
    echo "SENDA_JWT_SECRET_KEY=$SENDA_BOOTSTRAP_JWT"
    echo "SENDA_DEMO_USERS_ENABLED=true"
  } > .env
  chmod 600 .env
fi

set -a
source .env
set +a
.venv/bin/alembic upgrade head
.venv/bin/senda sources seed

cd "$SENDA_FRONTEND"
npm ci

"$SENDA_PROJECT_ROOT/scripts/generate-contracts.sh"

echo
echo "SENDA quedó preparado."
echo "Backend: make backend"
echo "Frontend: make frontend"
echo "Acceso demo: admin@senda.local / Cambiar-Esta-Clave-2026!"
