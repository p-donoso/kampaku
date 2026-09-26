#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${KAMPAKU_DATA_DIR:-/tmp/kampaku-agents-smoke}"
export KAMPAKU_DATA_DIR="$DATA_DIR"
export KAMPAKU_WORKSPACE="$ROOT"
# The port block, so the smoke stack does not claim a port another service already holds.
# shellcheck source=ports.env
source "$ROOT/scripts/ports.env"
export KAMPAKU_CORE_PORT
export KAMPAKU_CORE_URL="http://127.0.0.1:$KAMPAKU_CORE_PORT"
export KAMPAKU_AGENT="${KAMPAKU_AGENT:-stub}"

rm -rf "$DATA_DIR"
mkdir -p "$DATA_DIR"

cd "$ROOT/apps/core"
node dist/cli.js bootstrap

node dist/cli.js serve &
CORE_PID=$!

cleanup() {
  kill "$CORE_PID" 2>/dev/null || true
}
trap cleanup EXIT

for _ in $(seq 1 30); do
  if curl -sf "$KAMPAKU_CORE_URL/api/v1/health" >/dev/null; then
    break
  fi
  sleep 0.5
done

node dist/cli.js chat --message "create a sub-agent named pr-reviewer that reviews pull requests"

OUTPUT="$(node dist/cli.js agents tree)"
echo "$OUTPUT"

echo "$OUTPUT" | grep -q "pr-reviewer"
echo "$OUTPUT" | grep -q "kampaku"

node dist/cli.js agents show pr-reviewer >/dev/null

echo "Agents smoke test passed."
