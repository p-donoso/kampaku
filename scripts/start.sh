#!/usr/bin/env bash
set -euo pipefail

# Start the full Kampaku stack (the model endpoint, Core, Worker, Web UI).

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

# Starts a LOCAL endpoint service, when the operator names one.
#
# This is a convenience and not part of the endpoint contract. The contract is
# KAMPAKU_MODEL_BASE_URL: if the endpoint is already running, or hosted elsewhere, or a local process the
# operator manages themselves, this step is skipped entirely. `KAMPAKU_DEV_ENDPOINT_SERVICE` names the
# docker compose service to bring up; with it unset there is nothing to start and nothing is started.
start_endpoint() {
  if [[ -z "${KAMPAKU_DEV_ENDPOINT_SERVICE:-}" ]]; then
    return 0
  fi

  if [[ "${KAMPAKU_PLANNER:-llm}" == "stub" && "${KAMPAKU_AGENT:-stub}" == "stub" ]]; then
    echo "Skipping the local endpoint service (KAMPAKU_PLANNER=stub and KAMPAKU_AGENT=stub)."
    return 0
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker not found; skipping the local endpoint service." >&2
    return 0
  fi

  local existing_pid
  existing_pid="$(read_pid endpoint || true)"
  if is_running "$existing_pid"; then
    echo "the local endpoint service is already running (pid $existing_pid)"
    return 0
  fi

  echo "Starting the local endpoint service ($KAMPAKU_DEV_ENDPOINT_SERVICE) via docker compose..."
  cd "$ROOT"
  docker compose up -d "$KAMPAKU_DEV_ENDPOINT_SERVICE"
  write_pid endpoint "docker"
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

  echo "Starting Kampaku Worker (KAMPAKU_EXECUTOR=${KAMPAKU_EXECUTOR:-openai-compatible})..."
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

  # Note anything already serving the port before we start, so adopting a stale listener is explicit
  # rather than silent.
  local pre_owner
  pre_owner="$(listening_pid "$WEB_PORT")"
  if [[ -n "$pre_owner" ]]; then
    echo "WARNING: port $WEB_PORT was already served by pid $pre_owner before this start." >&2
    echo "         That listener is not from this run; the new web process cannot bind while it lives." >&2
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

  if [[ -n "$owner" && "$owner" != "$web_pid" ]]; then
    # `npm run start` spawns `next start`, which spawns next-server: `$!` is the npm wrapper, so the
    # pid this script used to record was the wrapper, and killing it left next-server holding the port.
    # That is where the orphaned listeners came from — every stop left one behind, the next start could
    # not bind, and start still reported the Web UI as up. Record the process that actually owns the
    # port, so stop.sh can stop the thing that must stop.
    write_pid web "$owner"
  fi

  if [[ "$owner" == "$web_pid" ]]; then
    echo "Web UI at http://localhost:$WEB_PORT (pid $web_pid, log: $RUN_DIR/web.log)"
  elif [[ -n "$owner" ]]; then
    if [[ "$owner" == "$pre_owner" ]]; then
      echo "WARNING: port $WEB_PORT is still served by the pre-existing pid $owner; this stack's web process" >&2
      echo "         (pid $web_pid) never bound it. The UI on that port is a stale server." >&2
    else
      echo "Web UI at http://localhost:$WEB_PORT (pid $owner, log: $RUN_DIR/web.log)"
    fi
  elif ! is_running "$web_pid"; then
    echo "WARNING: apps/web exited during startup (pid $web_pid). See $RUN_DIR/web.log" >&2
  else
    echo "WARNING: apps/web (pid $web_pid) did not bind port $WEB_PORT within 30s. See $RUN_DIR/web.log" >&2
  fi
}

start_endpoint
start_core
start_worker
start_web

echo ""
echo "Kampaku stack is running."
echo "  Web UI:  http://localhost:$WEB_PORT"
echo "  Core:    $KAMPAKU_CORE_URL"
echo "  Stop:    $SCRIPT_DIR/stop.sh"
