# Test coverage

Core and Worker expose `npm run test:coverage`. Reports use Vitest's V8 provider and write text, JSON summary, and LCOV output under each package's `coverage/` directory.

The Worker baseline is enforced at 60% lines and statements, 80% functions, and 50% branches. This protects the execution path while allowing integration-only adapters to grow with dedicated tests. Current Worker coverage is 64.37% lines, 61.94% statements, 82.85% functions, and 52.81% branches.

Coverage is a signal, not proof of behavior. Critical gaps should be addressed by tests for failure paths and external boundaries, especially `job-runner/control.ts`, `executor/github.ts`, `tools/public-source.ts`, and `tools/browser-runtime.ts`.
