#!/usr/bin/env bash
# Shared helpers for Kampaku workspace scripts.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="${KAMPAKU_RUN_DIR:-${KAMPAKU_DATA_DIR:-$HOME/.kampaku}/run}"

# The local port block, from its one declaration. Everything that binds a port defaults to these, so the
# stack cannot claim 3000/8080 and fight whatever else is on the machine.
# See docs/development/local-ports.md.
#
# It is a **default**, and that word has to survive this file. `ports.env` is a list of assignments, so
# sourcing it overwrote whatever the caller had exported — while `docs/development/local-ports.md` says
# *"Any of these can be overridden per run by the environment; the block is only the default, so a run with
# its own `run.env` still wins"* and `scripts/runs.sh` writes exactly that ("Uncomment and set them per run:
# a run that shares a live instance's port measures somebody else's stack").
#
# Measured 2026-10-04 while opening suite 08's fourth re-run: `KAMPAKU_CORE_PORT=28082 scripts/start.sh`
# brought Core up on **28080** — the previous run's port, released minutes earlier by hand. The trap the
# block exists to close (an eval run measuring somebody else's instance because two runs shared a port) was
# armed by the block itself, and the eval protocol's isolation rule rested on a hand-stopped stack.
#
# So the caller's values are kept across the source. Source, then restore.
_ports_preset_names=(KAMPAKU_CORE_PORT KAMPAKU_WEB_PORT KAMPAKU_MODEL_ENDPOINT_PORT PLAYWRIGHT_CORE_PORT PLAYWRIGHT_WEB_PORT)
_ports_preset_values=()
for _name in "${_ports_preset_names[@]}"; do
  if [[ -n "${!_name+x}" ]]; then
    _ports_preset_values+=("${!_name}")
  else
    _ports_preset_values+=("")
  fi
done
# shellcheck source=ports.env
source "$ROOT/scripts/ports.env"
for _index in "${!_ports_preset_names[@]}"; do
  _value="${_ports_preset_values[$_index]}"
  [[ -n "$_value" ]] && export "${_ports_preset_names[$_index]}=$_value"
done
unset _name _value _index _ports_preset_names _ports_preset_values
export KAMPAKU_CORE_PORT KAMPAKU_WEB_PORT KAMPAKU_MODEL_ENDPOINT_PORT PLAYWRIGHT_CORE_PORT PLAYWRIGHT_WEB_PORT

load_env() {
  if [[ -f "$ROOT/.env" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      [[ -z "$line" || "$line" == \#* || "$line" != *=* ]] && continue
      key="${line%%=*}"
      value="${line#*=}"
      key="${key//[[:space:]]/}"
      [[ -n "${!key+x}" ]] && continue
      export "$key=$value"
    done < "$ROOT/.env"
  fi

  export KAMPAKU_WORKSPACE="${KAMPAKU_WORKSPACE:-$ROOT}"
  # Inside the checkout, not in the operator's home.
  #
  # It was `$HOME/.kampaku`, which is the product's own default and a reasonable one for an installed
  # instance — but this script drives a **development checkout**, and on this operator's machine the home
  # folder accumulated 21 run dirs and 57 MB of closed eval runs before anyone counted them (measured
  # 2026-09-29). `.kampaku/` is ignored by `.gitignore`, so a stack started here leaves its state in the
  # repository tree and nowhere else. An explicit `KAMPAKU_DATA_DIR` still wins, which is what a run with
  # its own run dir (`scripts/runs.sh`) sets.
  export KAMPAKU_DATA_DIR="${KAMPAKU_DATA_DIR:-$ROOT/.kampaku/data}"
  export KAMPAKU_CORE_URL="${KAMPAKU_CORE_URL:-http://127.0.0.1:$KAMPAKU_CORE_PORT}"
  export KAMPAKU_RUN_DIR="${KAMPAKU_RUN_DIR:-$KAMPAKU_DATA_DIR/run}"
  RUN_DIR="$KAMPAKU_RUN_DIR"
}

ensure_run_dir() {
  mkdir -p "$RUN_DIR"
}

pid_file() {
  echo "$RUN_DIR/$1.pid"
}

write_pid() {
  ensure_run_dir
  echo "$2" > "$(pid_file "$1")"
}

read_pid() {
  local file
  file="$(pid_file "$1")"
  if [[ -f "$file" ]]; then
    cat "$file"
  fi
}

is_running() {
  local pid="${1:-}"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

wait_for_core() {
  local url="${KAMPAKU_CORE_URL}/api/v1/health"
  for _ in $(seq 1 60); do
    if curl -sf "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  echo "Core did not become healthy at $url" >&2
  return 1
}

kampaku_cli() {
  if command -v kampaku >/dev/null 2>&1; then
    command kampaku "$@"
    return
  fi

  if [[ -x "$ROOT/scripts/kampaku" ]]; then
    "$ROOT/scripts/kampaku" "$@"
    return
  fi

  echo "kampaku CLI not found. Run: $ROOT/scripts/install.sh" >&2
  return 1
}

# Waits until Core reports at least one online worker. Prints nothing; the caller reports.
#
# Why this is not `kill -0`: a worker that refuses its own configuration exits in the same second it is
# started, and a process-table check cannot tell that from a worker that is up. Measured 2026-09-29 while
# opening suite 08 (BOARD F-073): the workspace `.env` still carried the pre-11 value
# an executor value roadmap 11 § Part A removed, the worker rejected it by name and exited within a few
# milliseconds, and
# `start.sh` printed "Worker started" followed by "Kampaku stack is running." A Core-only boot is a project
# whose jobs never move, and the worker is the one service an operator has no other way to notice.
#
# So the check reads the product's own public surface — `GET /api/v1/runtime/status`, whose `workersOnline`
# is the same number the web UI's runtime card shows — rather than the process table. What is asserted is
# "registered with Core", which is what execution actually needs.
wait_for_worker_registration() {
  local timeout_s="${1:-30}"
  local url="${KAMPAKU_CORE_URL}/api/v1/runtime/status"
  local deadline=$((SECONDS + timeout_s))
  local body online

  while ((SECONDS < deadline)); do
    body="$(curl -sf --max-time 2 "$url" 2>/dev/null || true)"
    online="$(printf '%s' "$body" | grep -o '"workersOnline"[[:space:]]*:[[:space:]]*[0-9]\+' | grep -o '[0-9]\+$' || true)"
    if [[ -n "$online" ]] && ((online >= 1)); then
      return 0
    fi
    sleep 0.5
  done

  return 1
}

# Prints the notice a started stack needs when Core holds no default project, and nothing when it does.
#
# Starting the stack is not opening a work order. Measured on a fresh data dir (BOARD F-110, run `s01r8`):
# `GET /api/v1/projects` answered `{"projects":[]}`, `bootstrap_state` held no `default_project`, and every
# surface said the stack was healthy (`/api/v1/health` ok, `workersOnline: 1`) while `kampaku chat` refused
# every turn with `No project found. Run `kampaku bootstrap` first.` — which is the product being **right**
# about a state nothing on the start path had named.
#
# So this reads the product's own surface (`GET /api/v1/projects/default`; a 404 is the absence) and names
# the command. It deliberately does **not** create the project: the eval protocol reads a fresh instance's
# contents, and a start path that quietly wrote a container would change what suite 01 measures. It also
# cannot fail the start — the stack is genuinely useful without a project (a project can be created from the
# UI or REST), so this prints and returns 0 either way.
warn_if_no_default_project() {
  local url="${KAMPAKU_CORE_URL}/api/v1/projects/default"
  local code

  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" 2>/dev/null || true)"

  if [[ "$code" == "200" ]]; then
    return 0
  fi

  echo "" >&2
  if [[ -z "$code" || "$code" == "000" ]]; then
    echo "WARNING: could not read $url (Core answered nothing)." >&2
  else
    echo "WARNING: no default project on $KAMPAKU_CORE_URL (GET /api/v1/projects/default returned $code)." >&2
  fi
  echo "         A chat turn is refused until one exists: 'No project found. Run \`kampaku bootstrap\` first.'" >&2
  echo "         Run: $ROOT/scripts/kampaku bootstrap" >&2
  echo "" >&2

  return 0
}

install_kampaku_cli() {
  local bin_dir="${KAMPAKU_BIN_DIR:-$HOME/.local/bin}"
  local wrapper="$ROOT/scripts/kampaku"
  local target="$bin_dir/kampaku"

  chmod +x "$wrapper"
  mkdir -p "$bin_dir"
  ln -sfn "$wrapper" "$target"

  echo "Installed kampaku CLI at $target"

  case ":$PATH:" in
    *":$bin_dir:"*) ;;
    *)
      echo ""
      echo "Add this to your shell profile (~/.bashrc or ~/.profile):"
      echo "  export PATH=\"$bin_dir:\$PATH\""
      echo ""
      echo "Or run once in this shell:"
      echo "  export PATH=\"$bin_dir:\$PATH\""
      ;;
  esac
}
