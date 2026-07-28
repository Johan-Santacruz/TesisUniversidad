#!/usr/bin/env bash
set -euo pipefail

SIAD_PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SIAD_BACKEND="$SIAD_PROJECT_ROOT/Backend"
SIAD_FRONTEND="$SIAD_PROJECT_ROOT/frontend"
SIAD_OPENAPI_KEY=RUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUU=
SIAD_OPENAPI_JWT=SkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSko=

export SIAD_SIAD_ENV=test
export SIAD_ENCRYPTION_MASTER_KEY="$SIAD_OPENAPI_KEY"
export SIAD_JWT_SECRET_KEY="$SIAD_OPENAPI_JWT"
export PYTHONPATH="$SIAD_BACKEND"

if [[ "${1:-}" == "--check" ]]; then
  SIAD_CONTRACT_TMP="$(mktemp -d "${TMPDIR:-/tmp}/siad-contracts.XXXXXX")"
  trap 'rm -rf "$SIAD_CONTRACT_TMP"' EXIT
  "$SIAD_BACKEND/.venv/bin/python" "$SIAD_BACKEND/scripts/export_openapi.py" \
    --output "$SIAD_CONTRACT_TMP/openapi.json"
  (
    cd "$SIAD_FRONTEND"
    npx openapi-typescript "$SIAD_CONTRACT_TMP/openapi.json" \
      -o "$SIAD_CONTRACT_TMP/generated.ts"
  )
  cmp "$SIAD_CONTRACT_TMP/openapi.json" "$SIAD_BACKEND/openapi.json"
  cmp "$SIAD_CONTRACT_TMP/generated.ts" "$SIAD_FRONTEND/src/api/generated.ts"
  echo "Contratos sincronizados"
  exit 0
fi

"$SIAD_BACKEND/.venv/bin/python" "$SIAD_BACKEND/scripts/export_openapi.py" \
  --output "$SIAD_BACKEND/openapi.json"
(
  cd "$SIAD_FRONTEND"
  npm run contracts
)
