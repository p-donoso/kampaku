# Worker architecture

```text
Core Worker API
      |
  Worker API client <-> Job Runner -> Executor session
                           |              |
                       heartbeat     freellm-agent / echo / github
                                          |
                                   Sandbox workspace
                                          |
                              Coding tools (list/read/write/check)
```

Workers are bounded execution hosts. They register with Core, lease compatible jobs, run tools inside an ephemeral sandbox, and return idempotent terminal results. Policy and durable state remain in Core.

## Module map (`apps/worker/src`)

| Module | Responsibility |
|--------|----------------|
| `job-runner/` | Poll/lease loop, pause/cancel control signals |
| `worker-api/` | HTTP client for Core worker endpoints |
| `executor/` | Job dispatch (`session`), FreeLLM agent loop, echo/github executors, chat helpers |
| `tools/` | LLM-callable coding tools (`file-tools`), mutation outcome, required-check verification |
| `sandbox/` | Ephemeral workspace + path policy (allowed folders, write gates) |

## Job lifecycle

1. Register identity, version, and capabilities with Core.
2. Lease a compatible job using a bounded lease.
3. Materialize only approved project inputs in an ephemeral workspace.
4. Run the selected executor under sandbox and path policy.
5. Stream heartbeats and structured progress events.
6. Evaluate mutation/check completion gates before claiming success.
7. Return an idempotent result; destroy or quarantine the workspace per retention policy.

Workers may run on a personal computer, VPS, or cloud host while implementing the same contracts.

## Related docs

- [Security model](../security/security-model.md)
- [Core–worker protocol](../protocols/control-worker.md)
- [Architecture overview](overview.md)
