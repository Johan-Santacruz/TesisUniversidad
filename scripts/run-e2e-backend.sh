#!/usr/bin/env bash
set -euo pipefail

SIAD_PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SIAD_E2E_RUNTIME="$(mktemp -d "${TMPDIR:-/tmp}/siad-e2e.XXXXXX")"

cd "$SIAD_PROJECT_ROOT/Backend"
export SIAD_SIAD_ENV=test
export SIAD_DATABASE_URL=sqlite://
export SIAD_STORAGE_DIR="$SIAD_E2E_RUNTIME/storage"
export SIAD_FRONTEND_ORIGIN=http://127.0.0.1:5173
export SIAD_ENCRYPTION_MASTER_KEY=RUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUU=
export SIAD_JWT_SECRET_KEY=SkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSko=
export PYTHONPATH=.

exec .venv/bin/uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000
