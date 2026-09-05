# ADR-0003: Consolidate the platform into one monorepo

- Status: Accepted
- Date: 2026-09-05

## Context

Core, Worker, Web, Contracts, and platform documentation are developed and
released as one product. Their changes frequently cross process boundaries and
must be verified together. Separate repositories created avoidable drift in
contracts, setup instructions, tests, and release automation.

## Decision

Maintain the Kampaku platform in the canonical `kampaku-ai/kampaku` monorepo.
Keep `apps/core`, `apps/worker`, and `apps/web` as independently deployable
runtime applications. Keep `packages/contracts` as the shared interface source
of truth. Keep managed user projects in external repositories.

## Consequences

Cross-component changes use one pull request and one CI pipeline. Runtime and
security boundaries remain enforced by HTTP/SSE and Worker APIs; source layout
does not grant cross-process access. Releases may still publish separate images
or packages from the same commit.

The former component repositories remain archived migration references until
their retention period expires.
