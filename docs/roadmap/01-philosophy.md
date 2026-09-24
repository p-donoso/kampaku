# 1. Product philosophy

## Phase metadata

- **Phase:** `01 — Product philosophy`
- **Kind:** `charter`
- **Status:** `Partly enforced`
- **Owner:** product
- **Dependencies:** [ADR-0004](../adr/0004-software-factory-charter.md),
  [ADR-0005](../adr/0005-factory-authority-model.md)
- **Related documents:** [statute](../product/software-factory.md),
  [agnosticism invariants](../concepts/agnosticism-invariants.md),
  [eval lab](../eval/README.md), [principles](../development/principles.md)
- **Last reviewed:** 2026-09-23

> **This is a charter, not a phase.** It states permanent principles, so it has no "complete" state —
> the status in the [roadmap table](README.md) tracks how far *behavior* matches them, currently
> `Partly enforced`. The work of **delivering** the framing is a separate matter and is recorded in
> § Completion record below. Do not read `Partly enforced` as that work being unfinished.

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

## Software scope and invariants

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

## What the status measures

Enforcement is tracked per principle, because a charter is only as true as its weakest clause:

| Principle | Enforced now? |
|-----------|---------------|
| 1. Software is the deliverable; non-technical work is refused clearly | **Yes** — stated in four surfaces and locked by test. The live refusal is unrun ([eval 04](../eval/04-capability-boundary.md)) |
| 2. The person defines intent, priorities, and business decisions | **Yes** — durable questions, approval gate, and the front-office boundary |
| 3. Kampaku manages execution and never invents authority | **Yes** — runtime authorization by actor, project, work item, and skill; prompt text is not a grant |
| 4. A claim is not evidence | **Yes** — claim audit, quality gates, and the durable-state block |
| 5. The project's conventions and toolchain win | **Partly** — execution resolves the project's own checks, but discovery is not persisted and the skill catalog is still web-shaped ([07](07-engineering-skills.md)) |
| 6. Workers are autonomous only inside explicit boundaries | **Partly** — role and project scope are enforced; per-project sandbox roots are not ([F-015](../eval/results/BOARD.md)) |
| 7. The platform and the managed project remain separate | **Partly** — path policy keeps them apart, but the bootstrap grant is the home directory ([F-015](../eval/results/BOARD.md)) |
| 8. Interruption, resumption, failure, and absence are durable and truthful | **Partly** — leases, journal, and absence reports are durable; an in-progress turn is not, and answering a question resumes nothing ([F-007](../eval/results/BOARD.md), [F-013](../eval/results/BOARD.md)) |

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

Every later phase in this roadmap carries the same three sections as this one: metadata, a **Gate**,
and a **Software scope and invariants** statement. That is what keeps the framing from drifting back
phase by phase, and both are locked by `eval-docs-coherence.test.ts`.

## Gate

**Every product surface states the same deliverable, and out-of-scope work is refused with the
boundary named rather than attempted.** A surface that still describes Kampaku as a catch-all, or an
active document that promises non-software work, fails the gate.

Scored by `eval-software-scope.test.ts` (the contract half: prompt, tools, and intake skill) and
`eval-docs-coherence.test.ts` (the documentation half: one product, no live catch-all promise,
reachable links). The live refusal itself is the oracle of
[eval 04](../eval/04-capability-boundary.md).

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
| `apps/core/tests/eval/eval-orchestrator-contract.test.ts` | The front-office allowlist stays in both directions, including that the prompt names no unreachable tool |
| `apps/worker/tests/worker-system-prompt.test.ts` | The worker prompt names no refused deliverable class and no stack to assume; it tells the worker to discover the project |

## Behavior sweep

Documents are only half the product. Phase 01 rewrote the documents first, then audited every prompt,
skill, and tool description as **behavior**, and found the retired framing still operating in four
places:

| Where | What it said |
|-------|--------------|
| Worker system prompt | "For research deliverables …" — a deliverable class the statute refuses |
| Worker executor | detected a research task from `literature review`, exactly a refused category, and failed the job with `WORKER_RESEARCH_*` |
| Same prompt | forbade "turning an approximate learner convention into a level equivalence" — one past run's language-learning scenario |
| Planner prompt | "Do not assume every project is software", and accepted "a media or document result" as acceptance evidence |
| Planner guidance | proposed the assignee slugs `{slug}-frontend`, `{slug}-backend`, `{slug}-qa` as the default team |

All five are gone. The citation gate that the worker's research framing carried was kept in general
form — fabricated sources are unverifiable claims in an artifact that looks finished — because the
value was in the honesty rule, not in the deliverable class.

The stack-shaped coupling found in the same sweep (`package.json`, `npm` scripts, Next.js routes, a
skill prescribing Vitest) is [phase 03](03-quality-and-testing.md) work, and the web-shaped roster and
catalog defaults are [phase 07](07-engineering-skills.md) work.

## Completion record

- **Implemented in:** `docs(roadmap): implement phase 01 product philosophy`, followed by
  `fix(worker): remove the catch-all framing from product prompts` for the behavior sweep above.
- **Tests:** `npm test` (worker, web, and core including the eval locks: 440 passed, 1 skipped),
  `npm run test:eval` (38 tests), `npm run typecheck`, `npm run contracts:check` (27 contract files,
  35 Agent Skills), `npm run lint`.
- **Validated from a fresh data dir:** `kampaku bootstrap` then the CLI welcome on an empty
  `KAMPAKU_DATA_DIR`, which reports `Personal software factory`.
- **Lock mutation-checked:** removing the scope paragraph from the front-office prompt fails
  `eval-software-scope.test.ts`; adding a document that promises "any domain" fails
  `eval-docs-coherence.test.ts`; restoring the "research deliverables" line and the `package.json`
  instruction fails four assertions in `worker-system-prompt.test.ts`.
- **Evidence:** the tests above, the [statute](../product/software-factory.md), the
  [agnosticism invariants](../concepts/agnosticism-invariants.md), and
  [eval 04](../eval/04-capability-boundary.md).
- **Known limitations:**
  - The front office states the boundary and refuses in its prompt, its intake skill, its tool
    description, and the worker prompt, but it does not yet **classify** an arbitrary request as in or
    out of software scope. The classifier is [capability program](04-capability-program.md) work.
  - The live refusal is still unmeasured: [eval 04](../eval/04-capability-boundary.md) has not been
    run, so the boundary is locked by test and unproven against a real request.
  - Clearing [BOARD F-001](../eval/results/BOARD.md) removed the intake blocker, but intake is only
    demonstrated by the tool-path test, not by a suite run.
- **Follow-up phase:** [02 — Factory flow](02-factory-flow.md).
