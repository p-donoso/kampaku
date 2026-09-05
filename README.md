# Kampaku

Kampaku is a personal orchestration layer for persistent, autonomous AI agents.
This repository is the canonical monorepo for the control plane, execution plane,
web interface, shared contracts, and documentation.

## Repository layout

- `apps/core` — durable control plane and CLI
- `apps/worker` — isolated execution plane
- `apps/web` — operator interface
- `packages/contracts` — machine-readable shared interfaces
- `docs` — architecture, product, security, and development documentation

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

See the package READMEs and `docs/development/` for service-specific setup.
