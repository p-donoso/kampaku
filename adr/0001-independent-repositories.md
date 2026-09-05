# ADR-0001: Use independent repositories for initial components

- Status: Accepted
- Date: 2026-08-28

## Context

Core, workers, shared contracts, and documentation have different deployment, compatibility, and access concerns. Managed private projects are runtime data and must not be embedded in the platform source tree.

## Decision

Create four independent private repositories under `kampaku-ai`: `kampaku-core`, `kampaku-worker`, `kampaku-contracts`, and `kampaku-docs`. Do not use a parent repository or Git submodules.

## Consequences

Each component can evolve independently. Cross-repository changes require explicit contract versioning and coordinated releases. Kampaku itself can later be registered as a multi-repository Project in its own database.
