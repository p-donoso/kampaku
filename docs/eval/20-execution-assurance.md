# 20 — Execution assurance

## Promise tested

Project work reaches a truthful outcome only when explicit requirements, scope decisions, blockers, and verification evidence are represented in generic, inspectable records.

## Oracle

- Completion is rejected when required checks or evidence are missing, unverified, or unreferenced.
- Critical objective requirements cannot be silently omitted.
- Deferred or rejected scope requires a reason.
- Blocker recovery cannot requeue work while another active job exists.
- Verification and evidence use capability and subject types that are independent of a domain or model provider.

## Automated tests

- `apps/core/tests/eval/eval-execution-assurance.test.ts`

## Pass

Green when the automated eval passes and the implementation preserves the product-agnostic behavior above.
