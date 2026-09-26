#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${KAMPAKU_DATA_DIR:-/tmp/kampaku-smoke}"
export KAMPAKU_DATA_DIR="$DATA_DIR"
export KAMPAKU_WORKSPACE="$ROOT"
# The port block, so the smoke stack does not claim a port another service already holds.
# shellcheck source=ports.env
source "$ROOT/scripts/ports.env"
export KAMPAKU_CORE_PORT
export KAMPAKU_CORE_URL="http://127.0.0.1:$KAMPAKU_CORE_PORT"
export KAMPAKU_PLANNER="${KAMPAKU_PLANNER:-stub}"
export KAMPAKU_EXECUTOR="${KAMPAKU_EXECUTOR:-echo}"

rm -rf "$DATA_DIR"
mkdir -p "$DATA_DIR"

cd "$ROOT/apps/core"
node dist/cli.js bootstrap

node dist/cli.js serve &
CORE_PID=$!
WORKER_PID=""

cleanup() {
  kill "$CORE_PID" "$WORKER_PID" 2>/dev/null || true
}
trap cleanup EXIT

for _ in $(seq 1 30); do
  if curl -sf "$KAMPAKU_CORE_URL/api/v1/health" >/dev/null; then
    break
  fi
  sleep 0.5
done

cd "$ROOT/apps/worker"
node dist/cli.js run &
WORKER_PID=$!

sleep 1

cd "$ROOT/apps/core"
timeout 120s node dist/cli.js run "Add a smoke test marker comment to the Kampaku README"

echo "Smoke test passed."
