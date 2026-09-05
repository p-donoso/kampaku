# Worker architecture

```text
Core Worker API
      |
  Worker API <-> Job Runner -> Executor -> Tool adapter
                     |            |
                 heartbeat     Sandbox
                                  |
                         ephemeral workspace
```

## Job lifecycle

1. Register identity, version, and capabilities with Core.
2. Lease a compatible job using a bounded lease.
3. Materialize only the approved project inputs in an ephemeral workspace.
4. Run tools under sandbox and policy controls.
5. Stream heartbeats and structured progress events.
6. Upload declared artifacts and return an idempotent result.
7. Destroy or quarantine the workspace according to retention policy.

Workers may run on a personal computer, VPS, or cloud host while implementing the same contracts.
