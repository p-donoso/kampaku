---
name: kampaku-cli
description: Operate and inspect a local Kampaku instance through the repository CLI, including isolated evaluation runs. Use when a contributor needs to discover CLI commands, start or inspect the local stack, or prepare run state safely.
---

# Use the Kampaku CLI

Use the repository's public CLI as an operator would. Do not infer command syntax from implementation details;
check the current help and the linked docs first.

## Find the commands

From the monorepo root:

```bash
./scripts/kampaku --help
./scripts/kampaku <command> --help
```

The wrapper runs the TypeScript CLI when source is present and falls back to the compiled CLI. If it reports
missing dependencies or build output, follow the root [README](../../../README.md),
[`apps/core/README.md`](../../../apps/core/README.md), and [`scripts/README.md`](../../../scripts/README.md).
The CLI command table in the Core README is a useful map; the live CLI help is authoritative when they differ.

## Start and inspect a local instance

1. Follow the root [README quickstart](../../../README.md) for prerequisites, environment setup, build, and
   bootstrap.
2. Before starting services, run `./scripts/ports.sh list` or `./scripts/ports.sh check`. Use ports from
   [`docs/development/local-ports.md`](../../../docs/development/local-ports.md); never kill a process you
   did not start. Choose another declared port if one is occupied.
3. Start the local stack with the documented command (`./scripts/kampaku dev` for the Core and worker
   development process). Use `./scripts/kampaku --help` to confirm available operational commands, then
   inspect status and health through the CLI or documented operator endpoints.
4. Stop only the processes started for this task, using the documented lifecycle script where applicable.

Keep secrets in the local environment; do not print or copy API keys into run notes, commits, or artifacts.

## Isolate evaluation runs

When running an evaluation, follow [`docs/eval/00-protocol.md`](../../../docs/eval/00-protocol.md). Create a
fresh run directory instead of pointing the CLI at a personal or live data directory:

```bash
./scripts/runs.sh new <run-id>
source .kampaku/runs/<run-id>/run.env
./scripts/ports.sh check
```

The run environment isolates `KAMPAKU_DATA_DIR` and `KAMPAKU_RUN_DIR`. Assign free ports from the declared
block when the run needs its own server; never share a live instance's port. Keep raw logs and run-specific
instrumentation in that ignored run directory. Remove it with `./scripts/runs.sh rm <run-id>` when the run
closes, after preserving any selected evidence according to the archive policy.

## Keep the skill in scope

This is repository contributor guidance. Product-facing agent capabilities belong in
`packages/contracts/skills/`; this skill does not change or define those runtime skills.
