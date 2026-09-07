# ADR-0001: Use independent repositories for initial components

- Status: Superseded by [ADR-0003](0003-monorepo-platform.md)
- Date: 2026-08-28

## Context

Core, workers, shared contracts, and documentation have different deployment, compatibility, and access concerns. Managed private projects are runtime data and must not be embedded in the platform source tree.

## Decision

Create four independent private repositories under `kampaku-ai`: `apps/core`, `apps/worker`, `packages/contracts`, and `docs`. Do not use a parent repository or Git submodules.

## Consequences

Each component can evolve independently. Cross-repository changes require explicit contract versioning and coordinated releases.

## Supersession

The platform consolidated into the canonical `kampaku-ai/kampaku` monorepo (ADR-0003). Runtime and security boundaries remain process-level, not repository-level.
