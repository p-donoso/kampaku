# Worker security boundary

Workers execute untrusted project content and model-directed tool calls. The sandbox is therefore a primary security boundary, not an optional implementation detail.

Initial requirements:

- deny undeclared filesystem and network access by default;
- issue short-lived, job-scoped credentials;
- enforce time, CPU, memory, storage, and output limits;
- redact secrets from logs and artifacts;
- distinguish worker identity from agent and user identity;
- make cancellation and lease expiry effective even for unhealthy jobs;
- retain an auditable record of granted capabilities and tool calls.
