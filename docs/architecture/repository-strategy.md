# Repository strategy

Kampaku is maintained as one canonical monorepo. Runtime boundaries remain explicit even though source code, contracts, documentation, and CI share one Git history.

- `apps/core` — durable control plane and CLI
- `apps/worker` — isolated execution plane
- `apps/web` — operator interface
- `packages/contracts` — shared machine-readable interfaces
- `docs` — architecture, product, security, and contributor documentation

Projects managed by Kampaku remain external repositories. They are referenced by runtime project records and are never copied into this platform repository.

The monorepo uses npm workspaces for installation and coordinated checks. Core, Worker, and Web still build and deploy as separate processes.
