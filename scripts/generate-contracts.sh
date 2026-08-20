#!/usr/bin/env bash
set -euo pipefail

SENDA_PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SENDA_BACKEND="$SENDA_PROJECT_ROOT/Backend"
SENDA_FRONTEND="$SENDA_PROJECT_ROOT/frontend"
SENDA_OPENAPI_KEY=RUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUU=
SENDA_OPENAPI_JWT=SkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSko=

export SENDA_SENDA_ENV=test
export SENDA_ENCRYPTION_MASTER_KEY="$SENDA_OPENAPI_KEY"
export SENDA_JWT_SECRET_KEY="$SENDA_OPENAPI_JWT"
export PYTHONPATH="$SENDA_BACKEND"

if [[ "${1:-}" == "--check" ]]; then
  SENDA_CONTRACT_TMP="$(mktemp -d "${TMPDIR:-/tmp}/senda-contracts.XXXXXX")"
  trap 'rm -rf "$SENDA_CONTRACT_TMP"' EXIT
  "$SENDA_BACKEND/.venv/bin/python" "$SENDA_BACKEND/scripts/export_openapi.py" \
    --output "$SENDA_CONTRACT_TMP/openapi.json"
  (
    cd "$SENDA_FRONTEND"
    npx openapi-typescript "$SENDA_CONTRACT_TMP/openapi.json" \
      -o "$SENDA_CONTRACT_TMP/generated.ts"
  )
  cmp "$SENDA_CONTRACT_TMP/openapi.json" "$SENDA_BACKEND/openapi.json"
  cmp "$SENDA_CONTRACT_TMP/generated.ts" "$SENDA_FRONTEND/src/api/generated.ts"
  echo "Contratos sincronizados"
  exit 0
fi

"$SENDA_BACKEND/.venv/bin/python" "$SENDA_BACKEND/scripts/export_openapi.py" \
  --output "$SENDA_BACKEND/openapi.json"
(
  cd "$SENDA_FRONTEND"
  npm run contracts
)
