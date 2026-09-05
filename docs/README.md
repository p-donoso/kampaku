# Kampaku Documentation

Kampaku is a personal orchestration layer for persistent, autonomous AI agents. A person provides intent and priorities; Kampaku plans, schedules, governs, and observes execution across replaceable workers and model providers.

This directory contains cross-cutting architecture, decisions, concepts, security guidance, protocols, development practices, product direction, and brand foundations. Component-specific implementation notes live beside their applications, while machine-readable shared interfaces live in `packages/contracts`.

## Documentation map

- [`architecture/`](architecture/) — system context, components, and data ownership
- [`adr/`](adr/) — architectural decision records
- [`concepts/`](concepts/) — stable domain vocabulary
- [`security/`](security/) — trust model, threats, and controls
- [`protocols/`](protocols/) — human-readable cross-component behavior
- [`development/`](development/) — contribution and repository practices
- [`product/`](product/) — vision, principles, and roadmap
- [`branding/`](branding/) — name, voice, and future visual identity

## Repository boundaries

Kampaku's platform source lives in this monorepo under `apps/`, `packages/`, and `docs/`. Projects managed by Kampaku are runtime records in its database that reference external repositories; private project content is not stored here.
