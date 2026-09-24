# Improvement Validation

## Required checks

Run targeted tests and type checks for each changed package. Run the full worker suite after changing worker tools, execution policy, or model-agent behavior.

## Current validated areas

- Core planning, evidence, objective audit, quality gates, simulation detection, blocker policy, and capability-policy tests.
- Worker model-agent, tool, browser runtime, and configuration tests.
- Core and worker TypeScript checks.

## Documentation rule

Every material improvement must update:

1. The relevant roadmap deliverable, board row, or current product document with status, scope, and
   remaining work.
2. An architecture or development document when the improvement changes a contract, runtime behavior, or operational constraint.
3. Tests that demonstrate the new rule or behavior.

Do not mark a backlog item complete when only a type, prompt, or adapter exists without being integrated into the relevant execution path.

Starter templates must declare capabilities, runnable checks, documentation, and explicit separation between examples and production behavior. Template validation is independent of any particular framework or domain.

Domain skills must declare bounded responsibilities, verification checks, and evidence guidance. Skills compose only when responsibilities do not conflict; domain labels are illustrative and non-exhaustive.
