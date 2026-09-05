#!/usr/bin/env bash
set -euo pipefail

# Install dependencies and build Kampaku Core and Worker.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_common.sh"

load_env

echo "Installing kampaku-core..."
cd "$ROOT/kampaku-core"
npm install
npm run build

echo "Installing kampaku-worker..."
cd "$ROOT/kampaku-worker"
npm install
npm run build

echo "Installing kampaku-web..."
cd "$ROOT/kampaku-web"
npm install
npm run build

echo "Bootstrapping local project registry..."
cd "$ROOT/kampaku-core"
npm run bootstrap

echo "Installing kampaku CLI..."
install_kampaku_cli

if [[ ! -f "$ROOT/.env" ]]; then
  echo ""
  echo "Tip: copy .env.example to .env and set your API keys:"
  echo "  cp $ROOT/.env.example $ROOT/.env"
fi

echo ""
echo "Install complete. Run: make up   (or: kampaku up)"
