# Contributing to Kampaku

Thank you for contributing. Kampaku is a TypeScript monorepo with separate
Core, Worker, and Web runtime boundaries.

## Before opening a pull request

```bash
npm ci
npm run check:docs
npm run typecheck
npm test
npm run test:eval
npm run test:coverage
npm run build
npm run lint
npm run contracts:check
```

`npm test` runs the Worker, Web, and Core test suites, including the evaluation tests. Run
`npm run test:eval` directly when changing an evaluation contract or its regression tests; CI also
runs it separately and publishes a JUnit report. `npm run test:coverage` enforces the configured
coverage thresholds.

Use `npm run test:e2e` when changing the Web/Core integration or a critical user journey. CI does
not run this command by default, so run it locally for those changes. Keep persisted artifacts, UI
copy, tests, and documentation in English.

## Branch workflow

Use `develop` as the integration branch. Create `feature/<short-description>`
branches from the latest `develop`, merge reviewed work back into `develop`, and
promote `develop` to `main` only after release checks pass. Do not develop
directly on `main` or `develop`; see
[`docs/development/branching-strategy.md`](docs/development/branching-strategy.md).

## Pull requests

- Explain the user or operator problem being solved.
- Include tests for behavior changes.
- Update contracts before consumers when an HTTP or event shape changes.
- Update documentation and an ADR when a boundary or persistence decision changes.
- Do not commit secrets, local databases, build output, or provider credentials.
- Keep commits focused and use clear imperative commit messages.

## Architecture rule

Web talks to Core through HTTP/SSE. Worker talks to Core through the Worker API.
Neither process may import another process's persistence or private internals.
