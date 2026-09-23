#!/usr/bin/env bash
set -euo pipefail

# Start the full Kampaku stack (FreeLLMApi, Core, Worker, Web UI).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_common.sh"

load_env
ensure_run_dir

WEB_PORT="${KAMPAKU_WEB_PORT:-3002}"
export KAMPAKU_WEB_PORT="$WEB_PORT"
export KAMPAKU_CORE_URL="${KAMPAKU_CORE_URL:-http://127.0.0.1:8080}"
export NEXT_PUBLIC_KAMPAKU_API_URL="$KAMPAKU_CORE_URL"

if [[ ! -f "$ROOT/apps/core/dist/cli.js" ]] || [[ ! -f "$ROOT/apps/worker/dist/cli.js" ]]; then
  echo "Build output missing. Run: $SCRIPT_DIR/install.sh" >&2
  exit 1
fi

# Prints the pid listening on a TCP port, or nothing. Uses ss so it does not depend on lsof.
listening_pid() {
  local port="$1"
  ss -ltnp 2>/dev/null | awk -v p=":$port" '$4 ~ p {
    if (match($0, /pid=[0-9]+/)) print substr($0, RSTART + 4, RLENGTH - 4)
  }' | head -n 1
}

start_freellmapi() {
  if [[ "${KAMPAKU_START_FREELLMAPI:-auto}" == "false" ]]; then
    return 0
  fi

  if [[ "${KAMPAKU_PLANNER:-llm}" == "stub" && "${KAMPAKU_AGENT:-stub}" == "stub" && "${KAMPAKU_START_FREELLMAPI:-auto}" == "auto" ]]; then
    echo "Skipping FreeLLMApi (KAMPAKU_PLANNER=stub and KAMPAKU_AGENT=stub). Set KAMPAKU_START_FREELLMAPI=true to force start."
    return 0
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker not found; skipping FreeLLMApi." >&2
    return 0
  fi

  local existing_pid
  existing_pid="$(read_pid freellmapi || true)"
  if is_running "$existing_pid"; then
    echo "FreeLLMApi already running (pid $existing_pid)"
    return 0
  fi

  echo "Starting FreeLLMApi via docker compose..."
  cd "$ROOT"
  docker compose up -d freellmapi
  write_pid freellmapi "docker"
  echo "FreeLLMApi started on http://localhost:3001"
}

start_core() {
  local existing_pid
  existing_pid="$(read_pid core || true)"
  if is_running "$existing_pid"; then
    echo "Core already running (pid $existing_pid)"
    return 0
  fi

  echo "Starting Kampaku Core..."
  cd "$ROOT/apps/core"
  node dist/cli.js serve >>"$RUN_DIR/core.log" 2>&1 &
  write_pid core "$!"
  wait_for_core
  echo "Core listening at $KAMPAKU_CORE_URL (log: $RUN_DIR/core.log)"
}

start_worker() {
  local existing_pid
  existing_pid="$(read_pid worker || true)"
  if is_running "$existing_pid"; then
    echo "Worker already running (pid $existing_pid)"
    return 0
  fi

  echo "Starting Kampaku Worker (KAMPAKU_EXECUTOR=${KAMPAKU_EXECUTOR:-freellmapi})..."
  cd "$ROOT/apps/worker"
  node dist/cli.js run >>"$RUN_DIR/worker.log" 2>&1 &
  write_pid worker "$!"
  echo "Worker started (log: $RUN_DIR/worker.log)"
}

start_web() {
  if [[ "${KAMPAKU_START_WEB:-true}" == "false" ]]; then
    echo "Skipping apps/web (KAMPAKU_START_WEB=false)"
    return 0
  fi

  local existing_pid
  existing_pid="$(read_pid web || true)"
  if is_running "$existing_pid"; then
    echo "Web UI already running (pid $existing_pid)"
    return 0
  fi

  if [[ ! -d "$ROOT/apps/web" ]]; then
    echo "apps/web not found; skipping Web UI." >&2
    return 0
  fi

  if [[ ! -d "$ROOT/apps/web/node_modules" ]]; then
    echo "Installing apps/web dependencies..."
    cd "$ROOT/apps/web"
    npm install
  fi

  if [[ ! -d "$ROOT/apps/web/.next" ]]; then
    echo "Building apps/web..."
    cd "$ROOT/apps/web"
    npm run build
  fi

  echo "Starting apps/web on port $WEB_PORT..."
  cd "$ROOT/apps/web"
  npm run start -- -p "$WEB_PORT" >>"$RUN_DIR/web.log" 2>&1 &
  local web_pid="$!"
  write_pid web "$web_pid"

  # Assert the port is actually served by the process we just started.
  #
  # This used to print "Web UI at http://localhost:PORT" unconditionally, immediately after
  # backgrounding the process. Measured consequence: a stale Next.js server from an earlier start held
  # the port, the newly started process could not bind, and the script still reported the Web UI as
  # running — while the UI being served was not this stack's. `stop.sh` only kills by pid file, so a
  # process whose pid file was overwritten survives and keeps the port.
  local waited=0
  local owner=""
  while [[ $waited -lt 60 ]]; do
    owner="$(listening_pid "$WEB_PORT")"
    [[ -n "$owner" ]] && break
    is_running "$web_pid" || break
    sleep 0.5
    waited=$((waited + 1))
  done

  if [[ "$owner" == "$web_pid" ]]; then
    echo "Web UI at http://localhost:$WEB_PORT (pid $web_pid, log: $RUN_DIR/web.log)"
  elif [[ -n "$owner" ]]; then
    echo "WARNING: port $WEB_PORT is served by pid $owner, not by the web process this script started (pid $web_pid)." >&2
    echo "         The UI responding on that port is NOT this stack's. Stop the stale listener, then restart web:" >&2
    echo "           kill $owner" >&2
  elif ! is_running "$web_pid"; then
    echo "WARNING: apps/web exited during startup (pid $web_pid). See $RUN_DIR/web.log" >&2
  else
    echo "WARNING: apps/web (pid $web_pid) did not bind port $WEB_PORT within 30s. See $RUN_DIR/web.log" >&2
  fi
}

start_freellmapi
start_core
start_worker
start_web

echo ""
echo "Kampaku stack is running."
echo "  Web UI:  http://localhost:$WEB_PORT"
echo "  Core:    $KAMPAKU_CORE_URL"
echo "  Stop:    $SCRIPT_DIR/stop.sh"
