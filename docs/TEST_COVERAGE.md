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

Coverage thresholds are enforced in CI and will fail builds that don't meet them:

### Core (`apps/core`)
- Lines: 58%
- Functions: 65%
- Branches: 45%
- Statements: 55%

Note: Eval tests in `tests/eval/**` are excluded from coverage calculations.

### Web (`apps/web`)
- Lines: 32%
- Functions: 25%
- Branches: 25%
- Statements: 30%

### Worker (`apps/worker`)
- Lines: 70%
- Functions: 85%
- Branches: 55%
- Statements: 68%

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

Areas with low coverage that need attention:
- Core: CLI commands, some API routes, autonomous agent session
- Web: API client functions, many React components
- Worker: Job runner control, GitHub integration
