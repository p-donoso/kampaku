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
cp .env.example .env
# Edit .env: set FREELLMAPI_API_KEY if using llm mode, and prefer an absolute
# KAMPAKU_DATA_DIR for a clean instance (example: /home/you/.kampaku-dev).
npm run typecheck
npm test
npm run build
```

Start the local stack (core + worker + web). First boot seeds the default
project and platform team into `KAMPAKU_DATA_DIR`:

```bash
./scripts/kampaku dev
```

`.env.example` defaults to `KAMPAKU_AGENT=llm` and `KAMPAKU_PLANNER=llm` via
FreeLLMAPI (`FREELLMAPI_BASE_URL`, usually `http://localhost:3001/v1`). Set both
to `stub` for deterministic offline runs without a model router.

## Quality gates

```bash
npm run lint
npm run contracts:check
npm run test:e2e
npm run smoke
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and
`docs/` for architecture, operations, and contributor guidance.
