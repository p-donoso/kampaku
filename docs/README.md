# Kampaku Documentation

Kampaku is a personal orchestration layer for persistent, autonomous AI agents. A person provides intent and priorities; Kampaku plans, schedules, governs, and observes execution across replaceable workers and model providers.

Platform source lives in this monorepo under `apps/`, `packages/`, and `docs/`. Projects managed by Kampaku are runtime records that reference external repositories.

## Documentation map

| Area | Path | Contents |
|------|------|----------|
| Architecture | [`architecture/`](architecture/) | System overview, worker, agent hierarchy, data ownership, monorepo layout |
| Concepts | [`concepts/`](concepts/) | Domain vocabulary and skills catalog |
| Security | [`security/`](security/) | Threat model and worker sandbox boundary ([security-model.md](security/security-model.md)) |
| Protocols | [`protocols/`](protocols/) | Core–worker lease and result protocol |
| ADRs | [`adr/`](adr/) | Architectural decision records |
| Development | [`development/`](development/) | Branching strategy and contribution principles |
| Product | [`product/`](product/) | Vision and roadmap |
| Design | [`design/`](design/) | UI guidelines |
| Branding | [`branding/`](branding/) | Voice, logo foundations, palette previews |
| Evaluation | [`eval/`](eval/) | Product eval suite protocols (`00`–`19`); run board/learnings in [`eval/results/`](eval/results/) |

## Branching

`develop` is the integration branch. Feature branches start from `develop`. `main` is the stable release line. Details: [`development/branching-strategy.md`](development/branching-strategy.md).

## Related roots

- Root [`README.md`](../README.md) — install and start
- [`packages/contracts`](../packages/contracts/) — machine-readable interfaces
- [`.cursor/rules/`](../.cursor/rules/) — agent operating rules (English-only, branching, brand)
