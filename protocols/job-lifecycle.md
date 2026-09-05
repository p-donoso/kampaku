# Job lifecycle protocol

```text
queued -> leased -> running -> succeeded
                    |       -> failed
                    |       -> cancelled
                    +       -> expired
```

A lease grants one worker temporary authority to execute a job. Heartbeats may extend it. A result is accepted only for the current lease, but repeated delivery of the same result must be idempotent. Lease expiry may make the job eligible for retry; it does not prove the previous process stopped, so side-effecting tools require their own idempotency controls.
