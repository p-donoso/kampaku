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
      if [[ -n "${KAMPAKU_DEV_ENDPOINT_SERVICE:-}" ]]; then
        echo "Stopping the local endpoint service ($KAMPAKU_DEV_ENDPOINT_SERVICE)..."
        cd "$ROOT"
        docker compose stop "$KAMPAKU_DEV_ENDPOINT_SERVICE" 2>/dev/null || true
      fi
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

# Prints the pid listening on a TCP port, or nothing.
listening_pid() {
  local port="$1"
  ss -ltnp 2>/dev/null | awk -v p=":$port" '$4 ~ p {
    if (match($0, /pid=[0-9]+/)) print substr($0, RSTART + 4, RLENGTH - 4)
  }' | head -n 1
}

stop_process worker
stop_process web
stop_process core
stop_process endpoint

# Verify the ports are actually free before claiming the stack stopped.
#
# stop_process only knows the pid it wrote last. A process whose pid file was overwritten by a later
# start survives, keeps the port, and silently makes every subsequent start unable to bind. Measured:
# the start script reported the Web UI as running while a stale Next.js server owned port 3002.
CORE_PORT="${KAMPAKU_CORE_PORT:-8080}"
WEB_PORT="${KAMPAKU_WEB_PORT:-3002}"
stale=""
for entry in "core:$CORE_PORT" "web:$WEB_PORT"; do
  name="${entry%%:*}"
  port="${entry##*:}"
  pid="$(listening_pid "$port")"
  if [[ -n "$pid" ]]; then
    stale="${stale}${name} (port ${port}, pid ${pid}); "
  fi
done

if [[ -n "$stale" ]]; then
  echo "WARNING: something is still listening: $stale" >&2
  echo "         Those processes were not started by this run (or their pid file was overwritten)," >&2
  echo "         so stop.sh cannot know they are yours. Kill them explicitly before restarting." >&2
  echo "Kampaku stopped what it tracked; ports are NOT all free."
  exit 1
fi

echo "Kampaku stopped."
