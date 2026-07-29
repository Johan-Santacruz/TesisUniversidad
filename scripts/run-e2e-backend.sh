#!/usr/bin/env bash
set -euo pipefail

SIAD_PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SIAD_E2E_RUNTIME="$(mktemp -d "${TMPDIR:-/tmp}/siad-e2e.XXXXXX")"
SIAD_E2E_BACKEND_PORT="${SIAD_E2E_BACKEND_PORT:-18000}"
SIAD_E2E_FRONTEND_PORT="${SIAD_E2E_FRONTEND_PORT:-15173}"

cd "$SIAD_PROJECT_ROOT/Backend"
export SIAD_SIAD_ENV=test
export SIAD_DATABASE_URL=sqlite://
export SIAD_STORAGE_DIR="$SIAD_E2E_RUNTIME/storage"
export SIAD_FRONTEND_ORIGIN="http://127.0.0.1:${SIAD_E2E_FRONTEND_PORT}"
export SIAD_ENCRYPTION_MASTER_KEY=RUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUU=
export SIAD_JWT_SECRET_KEY=SkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSko=
export PYTHONPATH=.

exec .venv/bin/uvicorn app.main:create_app --factory --host 127.0.0.1 --port "$SIAD_E2E_BACKEND_PORT"
