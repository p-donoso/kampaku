#!/usr/bin/env bash
set -euo pipefail

# Run state, in the checkout and out of the operator's home.
#
# The trap this closes: every eval run created a directory in `$HOME` — `~/.kampaku-eval-01`, one per
# suite-07 run up to `~/.kampaku-eval-07r20`, plus the langprobe and language-run dirs — and nothing in
# the product or the scripts ever removed them. Measured 2026-09-29: **21 run dirs and 57 MB in the
# operator's home**, mixed in with what he keeps there by hand, and a `.env` still pointing at one of
# them months after the run it belonged to had closed (which is how the live instance came to be waiting
# on a directory that no longer existed).
#
# So run state has a declared home: `<checkout>/.kampaku/runs/<id>/`, inside the repository tree and
# ignored by `.gitignore` (`.kampaku/`). Nothing here is a project checkout, so the isolation rule — a
# project repository may not live inside the platform workspace — does not apply to it.
#
#   ./scripts/runs.sh new s08r1     # create a run dir, print the environment it needs
#   ./scripts/runs.sh env s08r1     # the same exports, for a run dir that already exists
#   ./scripts/runs.sh list          # every run dir, with its size
#   ./scripts/runs.sh path s08r1    # just the path
#   ./scripts/runs.sh rm s08r1      # delete one (refuses anything outside this checkout)
#
# A run dir holds `data/` (the Core data dir: `KAMPAKU_DATA_DIR`), `logs/` (run logs and captured output),
# and `run.env` (the exports below). Instrumentation an operator writes — an oracle script, a run env —
# belongs there too: `docs/eval/00-protocol.md` requires it to live outside the repository *tree* that gets
# committed, and `.kampaku/` is ignored, so this is outside the tree while staying out of `$HOME`.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNS_ROOT="${KAMPAKU_RUNS_ROOT:-$ROOT/.kampaku/runs}"

die() {
  echo "$*" >&2
  exit 1
}

# A run id becomes a directory name, so it may not escape the runs root.
check_id() {
  local id="${1:-}"
  [[ -n "$id" ]] || die "Usage: $0 ${COMMAND:-new} <run-id>   (for example: s08r1)"
  case "$id" in
    */*|*..*|.*) die "Invalid run id \"$id\": it must be a plain name, with no slashes or leading dot." ;;
  esac
}

run_dir() {
  check_id "${1:-}"
  echo "$RUNS_ROOT/$1"
}

print_env() {
  local dir="$1"
  local id
  id="$(basename "$dir")"
  echo "# Run \"$id\" — add these to the shell that drives the run, or: source $dir/run.env"
  echo "export KAMPAKU_DATA_DIR=\"$dir/data\""
  echo "export KAMPAKU_RUN_DIR=\"$dir/logs\""
}

write_run_env() {
  local dir="$1"
  local id
  id="$(basename "$dir")"
  cat > "$dir/run.env" <<EOF
# Run "$id" — created by scripts/runs.sh on $(date -Iseconds).
#
# Source this in the shell that drives the run:  set -a; source run.env; set +a
#
# The data dir is this run's own. The protocol's first rule is that a run uses a **new** data directory
# and never a personal one, and this is where new ones live.
export KAMPAKU_DATA_DIR="$dir/data"
export KAMPAKU_RUN_DIR="$dir/logs"

# The run's own ports, from the declared block in scripts/ports.env (docs/development/local-ports.md).
# Uncomment and set them per run: a run that shares a live instance's port measures somebody else's
# stack. ./scripts/ports.sh check
# export KAMPAKU_CORE_PORT=
# export KAMPAKU_WEB_PORT=
EOF
}

case "${1:-list}" in
  new)
    COMMAND=new
    dir="$(run_dir "${2:-}")"
    [[ -e "$dir" ]] && die "Run dir already exists: $dir. Pick another id, or reuse it with: $0 env $(basename "$dir")"
    mkdir -p "$dir/data" "$dir/logs"
    write_run_env "$dir"
    echo "Created $dir"
    echo
    print_env "$dir"
    ;;

  env)
    dir="$(run_dir "${2:-}")"
    [[ -d "$dir" ]] || die "No such run dir: $dir. Create it with: $0 new $(basename "$dir")"
    print_env "$dir"
    ;;

  path)
    run_dir "${2:-}"
    ;;

  list)
    if [[ ! -d "$RUNS_ROOT" ]]; then
      echo "No run dirs yet under $RUNS_ROOT"
      exit 0
    fi
    echo "Run dirs under $RUNS_ROOT"
    echo
    printf '%-20s %-10s %s\n' "RUN" "SIZE" "DATA DIR"
    for dir in "$RUNS_ROOT"/*/; do
      [[ -d "$dir" ]] || continue
      printf '%-20s %-10s %s\n' \
        "$(basename "$dir")" \
        "$(du -sh "$dir" 2>/dev/null | cut -f1)" \
        "${dir%/}/data"
    done
    ;;

  rm)
    dir="$(run_dir "${2:-}")"
    [[ -d "$dir" ]] || die "No such run dir: $dir"
    case "$dir" in
      "$RUNS_ROOT"/*) ;;
      *) die "Refusing to delete outside the runs root: $dir" ;;
    esac
    rm -rf "$dir"
    echo "Deleted $dir"
    ;;

  *)
    die "Usage: $0 {new|env|list|path|rm} [run-id]"
    ;;
esac
