#!/usr/bin/env bash
# Shared helpers for Kampaku workspace scripts.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="${KAMPAKU_RUN_DIR:-${KAMPAKU_DATA_DIR:-$HOME/.kampaku}/run}"

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
  export KAMPAKU_DATA_DIR="${KAMPAKU_DATA_DIR:-$HOME/.kampaku}"
  export KAMPAKU_CORE_URL="${KAMPAKU_CORE_URL:-http://127.0.0.1:8080}"
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
