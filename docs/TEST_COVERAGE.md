# Test Coverage

This repository maintains high test coverage to ensure code quality and prevent regressions.

## Current Coverage (September 2026)

| Package | Statements | Branches | Functions | Lines | Status |
|---------|------------|----------|-----------|-------|--------|
| **Worker** | **97.09%** | **90.77%** | **98.21%** | **97.62%** | ✅ **Complete** |
| **Web** | 48.71% | 39.01% | 42.65% | 49.27% | 🚧 In progress |
| **Core** | 58.74% | 48.91% | 67.02% | 61.28% | 🚧 In progress |

**Worker** has achieved 90%+ coverage on all metrics and enforces these thresholds in CI.

## Running tests with coverage

```bash
# Run all tests with coverage reports
npm run test:coverage

# Run tests for individual packages
cd apps/core && npm run test:coverage
cd apps/web && npm run test:coverage
cd apps/worker && npm run test:coverage
```

## Coverage thresholds

Coverage thresholds are enforced in CI via Vitest and will fail builds that don't meet them:

### Worker (`apps/worker`) ✅ Complete
- Lines: **90%**
- Functions: **90%**
- Branches: **90%**
- Statements: **90%**

Worker has achieved 97%+ measured coverage and enforces 90% thresholds.

### Core (`apps/core`) 🚧 In progress
- Lines: 58%
- Functions: 67%
- Branches: 48%
- Statements: 58%

Target: 90% on all metrics. Thresholds track measured coverage and will rise as tests are added.

Note: Eval tests in `tests/eval/**` are excluded from coverage calculations.

### Web (`apps/web`) 🚧 In progress
- Lines: 48%
- Functions: 42%
- Branches: 39%
- Statements: 48%

Target: 90% on all metrics. Thresholds track measured coverage and will rise as tests are added.

## Coverage reports

After running tests with coverage, HTML reports are generated in:
- `apps/core/coverage/index.html`
- `apps/web/coverage/index.html`
- `apps/worker/coverage/index.html`

## Adding new tests

When adding tests, follow the existing patterns:
- Core: See `apps/core/tests/` for examples of application logic, API, and persistence tests
- Web: See `apps/web/tests/` for component and utility tests
- Worker: See `apps/worker/tests/` for executor and tool tests

## Known gaps

### Worker ✅
Worker coverage is complete at 97%+ on all metrics. All major execution paths are tested.

### Web 🚧
Areas needing test coverage (to reach 90% target):
- React components (~50 files): Agent views, project views, wiki UI, settings UI, conversation UI
- Complex hooks: `useRosterSync`, state management hooks
- Layout components: App shell, navigation, authentication wrappers

Tests exist for: All API clients, roster utilities, formatting utilities, chat streaming, API error handling.

### Core 🚧
Areas needing test coverage (to reach 90% target):
- Application layer: `projects.ts`, `agents.ts`, `skills.ts` (require DB store mocking)
- Bootstrap logic: `kampaku-project.ts`, `kampaku-agent.ts`, `kampaku-platform-team.ts`
- CLI commands: `serve.ts`, `dev.ts`, `run.ts`, `chat.ts` (require full CLI environment)
- Persistence stores: All `*-store.ts` files (require DB fixtures)
- Delegator: `plan-and-delegate.ts`, `decompose-intent.ts`, `match-agent.ts` (require LLM mocking)

Tests exist for: PM utilities, agent runtime, wiki utilities, CLI utilities, client error handling, delegator planning, complexity analysis.
