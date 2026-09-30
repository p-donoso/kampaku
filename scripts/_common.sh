#!/usr/bin/env bash
# Shared helpers for Kampaku workspace scripts.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="${KAMPAKU_RUN_DIR:-${KAMPAKU_DATA_DIR:-$HOME/.kampaku}/run}"

# The local port block, from its one declaration. Everything that binds a port defaults to these, so the
# stack cannot claim 3000/8080 and fight whatever else is on the machine.
# See docs/development/local-ports.md.
# shellcheck source=ports.env
source "$ROOT/scripts/ports.env"
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
