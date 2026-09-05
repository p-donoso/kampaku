#!/usr/bin/env bash
set -euo pipefail

# Stop Kampaku services started by scripts/start.sh.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_common.sh"

load_env
ensure_run_dir

stop_process() {
  local name="$1"
  local pid
  pid="$(read_pid "$name" || true)"

  if [[ -z "$pid" ]]; then
    return 0
  fi

  if [[ "$pid" == "docker" ]]; then
    if command -v docker >/dev/null 2>&1; then
      echo "Stopping FreeLLMApi..."
      cd "$ROOT"
      docker compose stop freellmapi 2>/dev/null || true
    fi
    rm -f "$(pid_file "$name")"
    return 0
  fi

  if is_running "$pid"; then
    echo "Stopping $name (pid $pid)..."
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 10); do
      is_running "$pid" || break
      sleep 0.2
    done
    if is_running "$pid"; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi

  rm -f "$(pid_file "$name")"
}

stop_process worker
stop_process web
stop_process core
stop_process freellmapi

echo "Kampaku stopped."
