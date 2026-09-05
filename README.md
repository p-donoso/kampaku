# Kampaku

Kampaku is an open-source orchestration layer for persistent, autonomous AI
agents. A person provides intent and priorities; Kampaku plans, schedules,
governs, and observes execution across replaceable workers and model providers.

This is the canonical monorepo for the platform.

## Repository layout

- `apps/core` — durable control plane and CLI
- `apps/worker` — isolated execution plane
- `apps/web` — operator interface
- `packages/contracts` — machine-readable shared interfaces
- `docs` — architecture, product, security, and development documentation

## Quick start

```bash
npm install
npm run typecheck
npm test
npm run build
```

For a local full-stack run, configure `.env` from `.env.example` and use:

```bash
./scripts/kampaku dev
```

The default development mode uses deterministic stubs. Configure FreeLLMAPI
only when testing real model-backed planning or execution.

## Quality gates

```bash
npm run lint
npm run contracts:check
npm run test:e2e
npm run smoke
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and
`docs/` for architecture, operations, and contributor guidance.
