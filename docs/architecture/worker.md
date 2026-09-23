# Worker architecture

```text
Core Worker API
      |
  Worker API client <-> Job Runner -> Executor session
                           |              |
                       heartbeat     model-agent / echo / github
                                          |
                                   Sandbox workspace
                                          |
                        Coding and verification tools
                        (files, checks, artifacts, media,
                         browser, endpoint, dataset)
```

Workers are bounded execution hosts. They register with Core, lease compatible jobs, run tools inside
an ephemeral sandbox, and return idempotent terminal results. Policy and durable state remain in Core.

A worker is the factory's **line**: it is where artifacts are actually produced, and the only place
where the project's files are touched.

## Module map (`apps/worker/src`)

| Module | Responsibility |
|--------|----------------|
| `job-runner/` | Poll/lease loop, pause/cancel control signals, orphan recovery |
| `worker-api/` | HTTP client for Core worker endpoints |
| `executor/` | Job dispatch (`session`), the model agent loop, echo/github executors, chat helpers |
| `tools/` | LLM-callable file tools, mutation outcome, required-check verification, deliverable inspection, browser runtime |
| `sandbox/` | Ephemeral workspace and path policy (allowed folders, write gates) |

## Job lifecycle

1. Register identity, version, and capabilities with Core.
2. Lease a compatible job using a bounded lease.
3. Materialize only the approved project inputs in an ephemeral workspace.
4. Run the selected executor under sandbox and path policy.
5. Stream heartbeats and structured progress events.
6. Evaluate mutation and required-check completion gates before claiming success.
7. Return an idempotent result; destroy or quarantine the workspace per retention policy.

Workers may run on a personal computer, a VPS, or a cloud host while implementing the same contracts.

## Toolchain neutrality

Worker execution uses an OpenAI-compatible model protocol with generic configuration names, and the
verification tools are **toolchain-shaped, not language-shaped**: a check is a command the project
declares, an artifact is a file the project produced, and a capability is a kind of observation rather
than a framework.

The capabilities the worker provides, and the ones it deliberately refuses, are listed in
[worker capabilities](../development/worker-capabilities.md). Two properties matter for the factory's
promises:

- **A capability that cannot be provided fails closed.** A verification that needs an engine the
  worker does not have raises `INSPECTION_UNSUPPORTED` rather than returning an approximation. That is
  what makes an honest "unverified" state possible.
- **Metadata inspection is never content verification.** Duration, codec, and signal statistics are
  metadata; a criterion about produced audio needs a round-trip. This distinction is the subject of
  [BOARD F-009](../eval/results/BOARD.md), where a structurally valid but silent audio file passes
  every metadata check.

## Isolation

The sandbox is the primary security boundary, not an implementation detail: undeclared filesystem and
network access is denied by default, credentials are job-scoped, secrets are scanned on write, and
cancellation and lease expiry take effect even for unhealthy jobs. See
[security model](../security/security-model.md).

Known limitation: the bootstrap filesystem settings grant a broad writable root, so isolation between
projects is policy rather than enforced containment
([BOARD F-015](../eval/results/BOARD.md)).

## Related docs

- [Security model](../security/security-model.md)
- [Worker capabilities](../development/worker-capabilities.md)
- [Core–worker protocol](../protocols/control-worker.md)
- [Architecture overview](overview.md)
- [Execution assurance](execution-assurance.md)
