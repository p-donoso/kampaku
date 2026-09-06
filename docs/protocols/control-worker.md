# Core–worker protocol

Workers register identity, version, supported contract versions, capabilities, and capacity. Core leases compatible Jobs for a bounded period. Workers heartbeat leases, publish progress, and submit idempotent terminal results. Core remains authoritative for Task and Job state.

Network loss, duplicated messages, expired leases, and delayed results are normal protocol conditions. Tool side effects require stable idempotency keys where possible.

## Interrupt, restart, and cancel (operator)

1. Start or use a durable interruptible job (chat `start_durable_execution`, or an existing worker job id).
2. Watch status: `kampaku jobs show <jobId>` / `GET /api/v1/jobs/:id` / web job controls.
3. **Hard kill** the stack, then restart Core (`kampaku serve` / `./scripts/kampaku dev`). On startup, orphan `running`/`leased` jobs are marked **expired** (lost) — not left as a silent still-running green.
4. Ask chat for state (`inspect_execution_state`) or read CLI/API — expect `expired`/`cancelled`/`succeeded`/`failed`, never a green lie.
5. **Cancel for real**: `kampaku jobs cancel <jobId>` or `POST /api/v1/jobs/:id/cancel` (or web Cancel). Interruptible batch executors stop further writes after cancel.
