#!/usr/bin/env bash
set -euo pipefail

# Ports, without guessing.
#
# The trap this closes: an agent that needs a port reaches for 3000 or 8080, finds a listener it did not
# start, and spends a turn on it. The block is declared in ports.env, so the answer is a command here
# rather than a guess.
#
#   ./scripts/ports.sh list        # the declared block
#   ./scripts/ports.sh check       # are the stack's ports free right now?
#   ./scripts/ports.sh check 28080 # is this port free?
#   ./scripts/ports.sh free 3      # print N free ports from inside the block
#
# This is a convenience for operators and agents on a single machine, not part of the endpoint contract.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ports.env
source "$SCRIPT_DIR/ports.env"

# The block's bounds. Kept here rather than in ports.env so that source stays a list of assignments,
# and low enough to stay outside the kernel's ephemeral range (32768-60999 on this machine).
BLOCK_START=28000
BLOCK_END=28099

# Prints the pid listening on a TCP port, or nothing.
listening_pid() {
  local port="$1"
  ss -ltnp 2>/dev/null | awk -v p=":$port" '$4 ~ p {
    if (match($0, /pid=[0-9]+/)) print substr($0, RSTART + 4, RLENGTH - 4)
  }' | head -n 1
}

is_free() {
  [[ -z "$(listening_pid "$1")" ]]
}

command="${1:-list}"

case "$command" in
  list)
    echo "The declared block (scripts/ports.env):"
    printf '  %-32s %-6s %s\n' "VARIABLE" "PORT" "STATE"
    for entry in \
      "KAMPAKU_CORE_PORT:$KAMPAKU_CORE_PORT" \
      "KAMPAKU_WEB_PORT:$KAMPAKU_WEB_PORT" \
      "KAMPAKU_MODEL_ENDPOINT_PORT:$KAMPAKU_MODEL_ENDPOINT_PORT" \
      "PLAYWRIGHT_CORE_PORT:$PLAYWRIGHT_CORE_PORT" \
      "PLAYWRIGHT_WEB_PORT:$PLAYWRIGHT_WEB_PORT"; do
      name="${entry%%:*}"
      port="${entry##*:}"
      if is_free "$port"; then
        printf '  %-32s %-6s %s\n' "$name" "$port" "free"
      else
        printf '  %-32s %-6s %s\n' "$name" "$port" "BUSY (pid $(listening_pid "$port"))"
      fi
    done
    echo ""
    echo "Why not 3000/8080: docs/development/local-ports.md"
    ;;

  check)
    shift || true
    ports=("$@")
    if [[ ${#ports[@]} -eq 0 ]]; then
      ports=("$KAMPAKU_CORE_PORT" "$KAMPAKU_WEB_PORT" "$PLAYWRIGHT_CORE_PORT" "$PLAYWRIGHT_WEB_PORT")
    fi

    busy=0
    for port in "${ports[@]}"; do
      pid="$(listening_pid "$port")"
      if [[ -z "$pid" ]]; then
        echo "free  $port"
      else
        echo "BUSY  $port (pid $pid)"
        busy=1
      fi
    done

    if [[ $busy -eq 1 ]]; then
      echo ""
      echo "A busy port is not a failure by itself: it may be this stack, already running." >&2
      echo "Pick another port from the block rather than killing a process you did not start." >&2
      exit 1
    fi
    ;;

  free)
    shift || true
    want="${1:-1}"
    found=0
    for ((port = BLOCK_START; port <= BLOCK_END; port++)); do
      [[ $found -ge $want ]] && break
      if is_free "$port"; then
        echo "$port"
        found=$((found + 1))
      fi
    done
    if [[ $found -lt $want ]]; then
      echo "Only $found free port(s) in the block $BLOCK_START-$BLOCK_END." >&2
      exit 1
    fi
    ;;

  *)
    echo "Usage: $0 [list|check [port...]|free [count]]" >&2
    exit 2
    ;;
esac
