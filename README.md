<p align="center">
  <img src="docs/branding/previews/ume-test.png" alt="Kampaku imperial seal" width="128" />
</p>

<h1 align="center">Kampaku</h1>

<p align="center">
  <strong>Personal control plane for persistent, autonomous AI agents.</strong><br />
  You set intent and priorities. Kampaku plans, governs, and keeps the work moving.
</p>

<p align="center">
  <a href="https://github.com/kampaku-ai/kampaku/actions/workflows/ci.yml"><img src="https://github.com/kampaku-ai/kampaku/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://github.com/kampaku-ai/kampaku/actions/workflows/contracts.yml"><img src="https://github.com/kampaku-ai/kampaku/actions/workflows/contracts.yml/badge.svg?branch=main" alt="Contracts" /></a>
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white" alt="Node.js 22+" />
  <img src="https://img.shields.io/badge/Next.js-App%20Router-000000?logo=nextdotjs&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" />
</p>

<p align="center">
  <a href="#why-kampaku">Why</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#repository-layout">Layout</a> ·
  <a href="#documentation">Docs</a> ·
  <a href="#contributing">Contributing</a>
</p>

---

## Why Kampaku

Most agent demos die when the chat window closes. Kampaku is built for work that must survive overnight:

- **Intent over micromanagement** — state the outcome; the hierarchy plans and delegates
- **Durable by default** — work items, leases, journals, and wiki survive restarts and model swaps
- **Three surfaces, one truth** — chat, CLI, and web agree on the same IDs and state
- **Bounded autonomy** — least privilege, sandboxed workers, human gates when decisions are missing
- **Provider-portable** — FreeLLMAPI (or stubs) today; swap models without rewriting the control plane

> The person defines intent and priorities. Kampaku manages execution while preserving visibility and control.

## Architecture

```text
  Operator (Web · CLI · Chat)
              │
         Core API (Hono)
              │
     ┌────────┴────────┐
     │                 │
 Model Broker     BaseStore (SQLite)
     │                 │
     └────────┬────────┘
              │
        Worker API
              │
   Sandboxed executors + coding tools
```

| Plane | Package | Role |
|-------|---------|------|
| Control | `apps/core` | Durable state, agent runtime, planner, CLI |
| Execution | `apps/worker` | Leased jobs, sandbox, filesystem tools |
| Interface | `apps/web` | Operator dashboard and conversational workspace |
| Contracts | `packages/contracts` | OpenAPI, schemas, skill catalog |

Managed projects stay in **external repositories**. This monorepo is the platform — not a dump of private work.

## Quick start

**Requirements:** Node.js 22+, npm.

```bash
git clone https://github.com/kampaku-ai/kampaku.git
cd kampaku
npm install
cp .env.example .env   # adjust data dir / FreeLLMAPI if needed
```

Quality gates:

```bash
npm run typecheck
npm test
npm run build
```

Full local stack (Core + Worker + Web; stubs by default):

```bash
./scripts/kampaku dev
```

| Surface | Default |
|---------|---------|
| Core API | `http://127.0.0.1:8080` |
| Web UI | `http://127.0.0.1:3002` |
| FreeLLMAPI (optional) | `http://127.0.0.1:3001` |

Deterministic stub mode is the default for development. Point env at FreeLLMAPI when you want real model-backed planning and execution.

## Repository layout

```text
kampaku/
├── apps/
│   ├── core/          # Control plane + CLI (kampaku)
│   ├── worker/        # Execution plane
│   └── web/           # Next.js operator UI
├── packages/
│   └── contracts/     # Shared schemas, skills, tool specs
├── docs/              # Architecture, product, security, evals
├── scripts/           # install / start / stop / smoke
└── .github/workflows/ # CI, contracts, security, release
```

## Documentation

| Guide | Path |
|-------|------|
| Documentation hub | [`docs/README.md`](docs/README.md) |
| Architecture overview | [`docs/architecture/overview.md`](docs/architecture/overview.md) |
| Product vision | [`docs/product/vision.md`](docs/product/vision.md) |
| Security model | [`docs/security/security-model.md`](docs/security/security-model.md) |
| Brand foundations | [`docs/branding/foundations.md`](docs/branding/foundations.md) |
| Product evaluation suites | [`docs/eval/README.md`](docs/eval/README.md) |
| Contributing | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| Security policy | [`SECURITY.md`](SECURITY.md) |

## Quality gates

```bash
npm run lint
npm run contracts:check
npm run test:e2e
npm run smoke
```

CI runs typecheck, unit tests, build, lint, and contract validation on `main` and `develop`.

## Contributing

1. Branch from `develop` as `feature/<short-description>`
2. Keep UI copy, docs, tests, and commits in **English**
3. Update contracts before consumers when HTTP shapes change
4. Open a PR into `develop`; promote to `main` only after release checks

See [`docs/development/branching-strategy.md`](docs/development/branching-strategy.md) for the full workflow.

## License

[MIT](LICENSE) © Kampaku contributors
