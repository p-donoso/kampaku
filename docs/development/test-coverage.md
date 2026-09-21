# Test coverage

Core, Web, and Worker expose `npm run test:coverage`. Reports use Vitest's V8 provider and write text, JSON summary, and LCOV output under each package's `coverage/` directory.

Thresholds are enforced by `npm run test:coverage` and fail the run when coverage regresses.

| Package | Lines | Functions | Branches | Statements |
|---------|-------|-----------|----------|------------|
| `apps/core` | 58% | 65% | 45% | 55% |
| `apps/web` | 32% | 25% | 25% | 30% |
| `apps/worker` | 60% | 80% | 50% | 60% |

Eval tests under `apps/core/tests/eval/**` are excluded from coverage collection because they assert cross-cutting product contracts; they still run in the default `npm test` gate.

Coverage is a signal, not proof of behavior. Critical gaps should be addressed by tests for failure paths and external boundaries, especially `job-runner/control.ts`, `executor/github.ts`, `tools/public-source.ts`, and `tools/browser-runtime.ts`. Current known gaps: Core CLI commands and several API routes, Web API client functions and many React components, Worker job-runner control and GitHub integration.
