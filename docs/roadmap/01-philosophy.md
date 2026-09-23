# 1. Product philosophy

## Phase metadata

- **Phase:** `01 — Product philosophy`
- **Status:** `Complete`
- **Owner:** product
- **Dependencies:** [ADR-0004](../adr/0004-software-factory-charter.md),
  [ADR-0005](../adr/0005-factory-authority-model.md)
- **Related documents:** [statute](../product/software-factory.md),
  [agnosticism invariants](../concepts/agnosticism-invariants.md),
  [eval lab](../eval/README.md), [principles](../development/principles.md)
- **Last reviewed:** 2026-09-23

## North star

Kampaku takes a software work order from one person, runs it through a bounded production line,
and reports what actually shipped.

## Permanent principles

1. Software is the deliverable. Non-technical work is refused clearly.
2. The person defines intent, priorities, and business decisions.
3. Kampaku manages execution, preserves visibility, and never invents authority.
4. A claim is not evidence. Completion requires re-executable or independently inspectable proof.
5. The project's own conventions and toolchain take precedence over factory defaults.
6. Workers are autonomous only inside explicit project, work-item, and skill boundaries.
7. The platform and the managed project remain separate.
8. Interruption, resumption, failure, and absence are durable and truthful states.

## Software scope and the refusal boundary

The deliverable is software plus the technical artifacts that ship with it, and the boundary is
stated in the [statute](../product/software-factory.md) § What "software" means here.

**In scope.** Applications, services and backends, libraries and SDKs, infrastructure as code, data
and pipeline code, tooling, test and quality assets, and the technical documentation that is verified
against code.

**Out of scope, and refused with the boundary named.** Creative writing and narrative work,
open-ended non-technical research and analysis, non-technical documents, and design as a standalone
deliverable.

The boundary test is the evidence, not the topic: a deliverable is in scope when its acceptance
evidence can be executed, inspected, or measured against a technical contract. Inside software
scope, the factory stays neutral — [language, project type, and
architecture](../concepts/agnosticism-invariants.md) are read from the project, never assumed.

Refusing is a product behavior with its own oracle ([eval 04](../eval/04-capability-boundary.md),
gate **F1**), not an error path.

## Three invariants

- **Language-agnostic:** any language or polyglot repository.
  Locked by [eval 18](../eval/18-language-agnostic.md).
- **Project-type-agnostic:** greenfield, brownfield, legacy, maintenance, migration, or hardening.
  Locked by evals [06](../eval/06-greenfield-stranger-repo.md),
  [19](../eval/19-brownfield-and-legacy.md), [21](../eval/21-maintenance-and-bugfix.md).
- **Architecture-agnostic:** single repository, monorepo, multi-repo, services, embedded, or other
  existing shapes. Locked by evals [19](../eval/19-brownfield-and-legacy.md),
  [20](../eval/20-multi-repo-and-services.md).

These invariants constrain implementation choices, not the product's purpose. Each is stated
precisely enough to test in the [agnosticism invariants](../concepts/agnosticism-invariants.md), and
each has an oracle because an invariant with no oracle is a slogan.

## Preserved by this phase

The framing change does not touch these, and this phase must not weaken them:

| Property | Where it stays explicit |
|----------|-------------------------|
| Provider neutrality | [multi-provider routing](11-multi-provider-routing.md), [eval 17](../eval/17-provider-fidelity.md) |
| Agent hierarchy and bounded authority | [agent hierarchy](../architecture/agent-hierarchy.md), [ADR-0005](../adr/0005-factory-authority-model.md) |
| Durable stores and interruption safety | [eval 13](../eval/13-survive-interruption.md), [data ownership](../architecture/data-ownership.md) |
| Sandboxing and least privilege | [security model](../security/security-model.md), [eval 14](../eval/14-least-privilege.md) |
| Evidence over claims | [execution assurance](../architecture/execution-assurance.md), [eval 11](../eval/11-honest-done.md) |
| Human control and durable gates | [statute](../product/software-factory.md) § The human relationship |
| Repository isolation | [eval 15](../eval/15-do-not-eat-the-host.md), [repository strategy](../architecture/repository-strategy.md) |

## Consequence for future work

New features should be expressed as factory capabilities or gates, not as promises to handle every
kind of human work.

## Adoption checklist

- [x] Every new product document names software as the deliverable.
- [x] Out-of-scope work is refused with the boundary named.
- [x] Every capability preserves the three agnosticism invariants.
- [x] Every completion claim has re-executable or independently inspectable evidence.
- [x] Every authority expansion is narrow, explicit, and tested.
- [x] Every project-facing change preserves repository isolation.
- [x] Missing, stale, blocked, and unverified states remain visible.

## Automated locks

| Test | Locks |
|------|-------|
| `apps/core/tests/eval/eval-software-scope.test.ts` | The front office states software as the deliverable and names the refusal boundary; no tool or skill promises arbitrary non-software work; intake routes technical investigation rather than general research |
| `apps/core/tests/eval/eval-docs-coherence.test.ts` | Every active product/architecture/security/eval/branding document names software as the deliverable; the three invariants stay explicit and linked; no active document promises arbitrary non-software work; product metadata does not describe Kampaku as a generic agent platform; all repository document links resolve |
| `apps/core/tests/eval/eval-orchestrator-contract.test.ts` | The front-office allowlist stays in both directions |

## Completion record

- **Implemented in:** `docs(roadmap): implement phase 01 product philosophy` on `develop`.
- **Tests:** `npm test` (worker, web, and core including the eval locks: 108 files, 429 passed,
  1 skipped), `npm run test:eval` (4 files, 30 tests), `npm run typecheck`,
  `npm run contracts:check` (27 contract files, 35 Agent Skills), `npm run lint`.
- **Validated from a fresh data dir:** `kampaku bootstrap` then the CLI welcome on an empty
  `KAMPAKU_DATA_DIR`, which reports `Personal software factory`.
- **Lock mutation-checked:** removing the scope paragraph from the front-office prompt fails
  `eval-software-scope.test.ts`, and adding a document that promises "any domain" fails
  `eval-docs-coherence.test.ts`.
- **Evidence:** the tests above, the [statute](../product/software-factory.md), the
  [agnosticism invariants](../concepts/agnosticism-invariants.md), and
  [eval 04](../eval/04-capability-boundary.md).
- **Known limitations:** the front office states the boundary and refuses in its prompt and intake
  skill, but it does not yet classify an arbitrary request as in or out of software scope; a
  *classifier* remains [capability program](04-capability-program.md) § Front office work. Intake is
  also still blocked from opening a work order end to end by
  [BOARD F-001](../eval/results/BOARD.md).
- **Follow-up phase:** [02 — Factory flow](02-factory-flow.md).
