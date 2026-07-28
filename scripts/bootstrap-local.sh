#!/usr/bin/env bash
set -euo pipefail

SIAD_PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SIAD_BACKEND="$SIAD_PROJECT_ROOT/Backend"
SIAD_FRONTEND="$SIAD_PROJECT_ROOT/frontend"

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

cd "$SIAD_BACKEND"
if [[ ! -x .venv/bin/python ]]; then
  python3.12 -m venv .venv
fi
.venv/bin/python -m pip install --upgrade pip
.venv/bin/pip install -e ".[test]"
mkdir -p data/storage

if [[ ! -f .env ]]; then
  SIAD_BOOTSTRAP_AES="$(openssl rand -base64 32 | tr '/+' '_-')"
  SIAD_BOOTSTRAP_JWT="$(openssl rand -base64 32 | tr '/+' '_-')"
  {
    echo "SIAD_SIAD_ENV=development"
    echo "SIAD_DATABASE_URL=sqlite:///./data/siad.db"
    echo "SIAD_STORAGE_DIR=./data/storage"
    echo "SIAD_FRONTEND_ORIGIN=http://localhost:5173"
    echo "SIAD_ENCRYPTION_MASTER_KEY=$SIAD_BOOTSTRAP_AES"
    echo "SIAD_JWT_SECRET_KEY=$SIAD_BOOTSTRAP_JWT"
    echo "SIAD_REAL_DATA_ENABLED=false"
    echo "SIAD_OPENAI_ZDR_CONFIRMED=false"
    echo "SIAD_ANTHROPIC_ZDR_CONFIRMED=false"
    echo "SIAD_INSTITUTIONAL_AUTHORIZATION_ID="
    echo "SIAD_DEMO_USERS_ENABLED=true"
  } > .env
  chmod 600 .env
fi

set -a
source .env
set +a
.venv/bin/alembic upgrade head
.venv/bin/siad sources seed

cd "$SIAD_FRONTEND"
npm ci
npx playwright install chromium

"$SIAD_PROJECT_ROOT/scripts/generate-contracts.sh"

echo
echo "SIAD quedó preparado."
echo "Backend: make backend"
echo "Frontend: make frontend"
echo "Acceso demo: admin@siad.local / Cambiar-Esta-Clave-2026!"
echo "Los testimonios reales permanecen bloqueados."
