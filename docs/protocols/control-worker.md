# Core–worker protocol

Workers register identity, version, supported contract versions, capabilities, and capacity. Core leases compatible jobs for a bounded period. Workers heartbeat leases, publish progress, and submit idempotent terminal results. Core remains authoritative for work-item and job state.

Network loss, duplicated messages, expired leases, and delayed results are normal protocol conditions. Tool side effects require stable idempotency keys where possible.

Machine-readable shapes live in `packages/contracts` (OpenAPI + schemas). Human-readable worker architecture and security controls live in:

- [Worker architecture](../architecture/worker.md)
- [Security model](../security/security-model.md)
