# Security model

Primary risks include prompt injection from managed repositories, excessive agent authority, credential leakage, unsafe tool execution, compromised workers, dependency or model-provider compromise, denial of wallet, and silent corruption of durable plans or memory.

This document is a starting point, not a security certification.

## Controls

- least-privilege identities and job-scoped credentials;
- deny-by-default worker sandboxes and path policy;
- policy and approval gates for consequential actions;
- immutable audit events and traceable causation;
- input provenance and untrusted-content labeling;
- spend, time, and resource budgets;
- secret redaction and external secret storage;
- lease-based work, cancellation, and bounded retries;
- explicit retention and deletion policies;
- runtime tool authorization by actor, project, parent work item, and skill (prompt text is not a grant).

## Worker boundary

Workers execute untrusted project content and model-directed tool calls. The sandbox is a primary security boundary, not an optional implementation detail.

Requirements:

- deny undeclared filesystem and network access by default;
- issue short-lived, job-scoped credentials;
- enforce time, CPU, memory, storage, and output limits;
- redact secrets from logs and artifacts;
- distinguish worker identity from agent and user identity;
- make cancellation and lease expiry effective even for unhealthy jobs;
- retain an auditable record of granted capabilities and tool calls;
- evaluate mutation and required-check completion gates before reporting success.

See also [Worker architecture](../architecture/worker.md) and [Core–worker protocol](../protocols/control-worker.md).
