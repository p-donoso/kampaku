# Kampaku Documentation

Kampaku is a **personal software factory**: a production line between one person's intent and shipped
software. A person opens a work order; Kampaku plans it, staffs a line, builds it, verifies it
against the project's own toolchain, and reports what actually shipped.

The product knows the deliverable is software. It assumes nothing else about the work — not the
language, not the project type, not the architecture. Those three agnosticisms are permanent
invariants with dedicated documents and eval suites.

Platform source lives in this monorepo under `apps/`, `packages/`, and `docs/`. Projects the factory
works on are runtime records that reference external repositories.

## Start here

| If you want to know… | Read |
|----------------------|------|
| What the product is and what it refuses | [`product/software-factory.md`](product/software-factory.md) |
| The short version | [`product/vision.md`](product/vision.md) |
| What it will be able to do and in what order | [`roadmap/`](roadmap/) |
| The three invariants in testable detail | [`concepts/agnosticism-invariants.md`](concepts/agnosticism-invariants.md) |
| What a turn is allowed to spend, and why it is the product's problem | [`concepts/token-economy.md`](concepts/token-economy.md) |
| How it is scored | [`eval/README.md`](eval/README.md) |

## Documentation map

| Area | Path | Contents |
|------|------|----------|
| Product | [`product/`](product/) | Statute, vision, roadmap |
| Concepts | [`concepts/`](concepts/) | Domain vocabulary, invariants, the skill model (the catalog itself is [`packages/contracts/skills/`](../packages/contracts/skills/)), and the [token economy](concepts/token-economy.md) |
| Architecture | [`architecture/`](architecture/) | Overview, worker, agent hierarchy, data ownership, execution assurance, risk register |
| Security | [`security/`](security/) | Threat model and worker sandbox boundary ([security-model.md](security/security-model.md)) |
| Protocols | [`protocols/`](protocols/) | Core–worker lease and result protocol |
| ADRs | [`adr/`](adr/) | Architectural decision records |
| Development | [`development/`](development/) | Branching, principles, validation, worker capabilities, [local ports](development/local-ports.md) |
| Design | [`design/`](design/) | UI guidelines |
| Branding | [`branding/`](branding/) | Voice, positioning, logo foundations, palette previews |
| Evaluation | [`eval/`](eval/) | Suite protocols, factory contract, probe protocol, run records; board/learnings in [`eval/results/`](eval/results/) |
| Roadmap | [`roadmap/`](roadmap/) | Product philosophy, factory flow, model, skills, and adoption phases |

## Decisions that define the product

| ADR | Decision |
|-----|----------|
| [0002](adr/0002-mvp-implementation-stack.md) | MVP stack; amended for provider neutrality and software scope |
| [0003](adr/0003-monorepo-platform.md) | One monorepo, separately deployable runtime apps |
| [0004](adr/0004-software-factory-charter.md) | Kampaku is a software factory; non-technical deliverables refused |
| [0005](adr/0005-factory-authority-model.md) | The front office opens work orders |

## Vocabulary

Factory terms (work order, line, station, gate, inspection, shipment) describe the flow in
[`product/software-factory.md`](product/software-factory.md). The canonical noun list for code,
contracts, and API shapes remains [`concepts/domain-model.md`](concepts/domain-model.md).

## Branching

`develop` is the integration branch. Feature branches start from `develop`. `main` is the stable
release line. Details: [`development/branching-strategy.md`](development/branching-strategy.md).

## Related roots

- Root [`README.md`](../README.md) — install and start
- [`packages/contracts`](../packages/contracts/) — machine-readable interfaces
- [`.cursor/rules/`](../.cursor/rules/) — agent operating rules (English-only, branching, brand, evals)
