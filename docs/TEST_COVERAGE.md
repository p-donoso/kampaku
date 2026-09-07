# Test Coverage

This repository maintains test coverage thresholds to ensure code quality.

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
