# 1. Product philosophy

## Document metadata

- **Document:** `01 — Product philosophy`
- **Kind:** `rule`
- **Status:** `Partly enforced`
- **Owner:** product
- **Dependencies:** [ADR-0004](../adr/0004-software-factory-charter.md),
  [ADR-0005](../adr/0005-factory-authority-model.md)
- **Related documents:** [statute](../product/software-factory.md),
  [agnosticism invariants](../concepts/agnosticism-invariants.md),
  [eval lab](../eval/README.md), [principles](../development/principles.md)
- **Last reviewed:** 2026-09-23

> **This is a rule, not a deliverable, and it never closes.**
>
> Its status tracks how far *behaviour* matches the principles, per principle — currently
> `Partly enforced`, and it can go down as well as up. The **delivery** that produced the
> framing this rule states is closed: see § Delivery record. A rule is not finished when a
> delivery is; it is finished never.

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
| 1. Software is the deliverable; non-technical work is refused clearly | **Yes, including the record.** The boundary is stated on every surface a person or agent reads (the front-office prompt, the inherited prompt, the intake skill, the lead skill, the triage tool, shipped metadata, the documents), and a refusal is now **recorded durably** with the boundary it crossed, readable on CLI and REST — before, it lived only in a reply and was lost with the chat. **What is not done:** nothing yet *classifies* a request automatically; the model decides and the tool records, which is [04](04-capability-program.md) work. The live refusal is unrun ([eval 04](../eval/04-capability-boundary.md)) |
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

## Preserved by this delivery

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

## Delivery checklist

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
| `apps/core/tests/eval/eval-software-scope.test.ts` § inherited prompt | `DEFAULT_GLOBAL_SYSTEM_PROMPT` — the prompt prepended to the front office, every lead and specialist, and the planner — states the deliverable, the four refused categories, the refusal rule, the evidence test for scope, and the invariant |
| `apps/core/tests/eval/eval-software-scope.test.ts` § lead skill | The skill that governs a project lead's scope states the deliverable and requires the lead to refuse rather than plan out-of-scope work |
| `apps/core/tests/eval/eval-refusal-durability.test.ts` | A refusal is recorded with the boundary it crossed; a refusal that names no boundary, or no request, is rejected; each boundary has canonical wording that names the deliverable; the record outlives the reply and lists newest first; `out_of_scope` refuses planning and cannot be classified without a boundary |

## Surface sweep (2026-09-24)

The first sweep fixed the prompts a *request* passes through. The second sweep asked a different
question: which surfaces state what the factory builds at all? That found the boundary stopping at the
front desk.

| Surface | Before | Now |
|---------|--------|-----|
| `DEFAULT_GLOBAL_SYSTEM_PROMPT` | Stated honesty and English, never the deliverable. It is prepended to the front office, **every project lead and specialist session**, and the planner — so the agents that actually plan and write had never been told what the factory builds | States the deliverable, the four refused categories, the refusal rule, the evidence test for scope, and the read-the-project invariant |
| `system-delegation` (project leads) | Governed scope with no boundary, so a lead could receive an out-of-scope objective and plan it in good faith | States the deliverable and requires the lead to refuse and escalate rather than plan it |
| CLI command descriptions, tool specs, config | Clean of framing; found **three vendor-name leaks** instead, now recorded against [11](11-multi-provider-routing.md) § Part A | Unchanged; the leaks are that phase's work |
| Seeded wiki pages | Clean of framing; found the seeded-README defect in a second location | Recorded against [03](03-quality-and-testing.md), where that defect class lives |
| `docs/concepts/skills.md` | Carried **four hand-maintained copies** of skill frontmatter: a catalog table, a default-skills table, a `system-*` table, and a platform-team table. Ten of thirty-five skills were absent from the catalog table, and the `system-*` table said in prose that it was incomplete | The four tables are gone. The page now points at `packages/contracts/skills/` as the source of truth, and a lock fails if a skill table or the platform roster is reintroduced in any document |

### Two acceptance criteria, checked rather than assumed

**English-only (criterion: all persisted documentation and machine-readable artifacts in English).**
Verified by scanning every document, contract, schema, and source file for Spanish diacritics and common
Spanish words. Every hit is **input detection**, not output: a regex matching Spanish creation verbs in
an agent's reply, a parser for a Spanish intent, a stub keyword match for the emperor's language, and
`post-action/validate.ts`'s `SPANISH_MARKERS` — which is the *enforcement* of the rule. No persisted
artifact is non-English.

**No duplicated sources (criterion: no contradictory, obsolete, duplicated, or broken references).**
This is what found the skills table above. A hand-maintained copy of machine-readable metadata is a
contradiction waiting to happen, and this one had already happened.

The lesson is narrow and worth keeping: "the boundary is stated" is only true surface by surface, and
the surface that mattered most was the one nobody had checked, because it is a default in a settings
module rather than a prompt anyone reads.

## Behavior sweep

Documents are only half the product. This delivery rewrote the documents first, then audited every prompt,
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
skill prescribing Vitest) is [03](03-quality-and-testing.md) work, and the web-shaped roster and
catalog defaults are [07](07-engineering-skills.md) work.

## Delivery record

**Status: `Closed` (2026-09-24).** The delivery was the framing alignment and its locks. Every box in
§ Delivery checklist is ticked, and the sweeps below record what each round found.

### What this delivery comprised

| Round | Question | What it found |
|-------|----------|---------------|
| 1 | Do the *documents* describe one product? | Documents were fine; the **shipped prompts were not** — the worker prompt named a "research deliverable" class and the planner said "do not assume every project is software" |
| 2 | Do the *prompts a request passes through* state the boundary? | The front office did; **`DEFAULT_GLOBAL_SYSTEM_PROMPT` did not**, and it reaches every lead, specialist, and the planner |
| 3 | Which surfaces state what the factory builds at all? | The CLI was clean; found three vendor leaks and a **hand-maintained duplicate** of the skill catalog that had lost ten of thirty-five skills |
| 4 | Do the acceptance criteria I ticked actually hold? | English-only holds; **no duplicated source did not**, which is what found the skill tables |
| 5 | Is a refusal a decision or a sentence? | A sentence. It was neither decided nor **recorded**, so principle 1 was half true |

### Explicitly not part of this delivery

Both are owned elsewhere, and neither is an oversight:

- **Observing a live refusal.** The delivery locked the boundary and made the refusal durable. Whether
  a real request is refused by a real model is an empirical question, and it belongs to
  [12 — Measurement program](12-measurement-program.md), which owns running the battery. Scoping it
  here would have made this delivery unclosable by definition.
- **Classifying scope automatically.** The model decides and names the boundary; no component decides.
  That is [04](04-capability-program.md) work.

### Evidence

- **Closed in:** `docs(roadmap): close phase 01 with the closed-deliverable framing and the ledger
  correction`, on `develop`.
- **Tests (executed):** `npm test` exit 0 — worker 115, web 79, core 475, 1 skipped; `npm run test:eval`
  73; `npm run typecheck`; `npm run contracts:check` (27 contract files, 36 Agent Skills); `npm run lint`.
  A read-only structural check over the documentation: 18 documents, 82 markdown files, 0 broken links.
- **Validated from a fresh data dir:** `kampaku bootstrap` then the CLI welcome on an empty
  `KAMPAKU_DATA_DIR`, which reports `Personal software factory`.
- **Lock mutation-checked:** removing the scope paragraph from the front-office prompt fails
  `eval-software-scope.test.ts`; adding a document that promises "any domain" fails
  `eval-docs-coherence.test.ts`; restoring the "research deliverables" line and the `package.json`
  instruction fails four assertions in `worker-system-prompt.test.ts`; removing the deliverable from
  the inherited prompt or the lead skill fails two; disabling the refusal record fails the tool-path
  test in `eval-refusal-durability.test.ts`.

> Numbers in a delivery record are claims about a run, so they are restated from the run that produced
> them rather than carried forward. An earlier version of this record cited 444 core tests and 42 eval
> tests because it was written before the refusal work landed and not updated with it.

### Known limitations of the delivery

- **The duplicate-of-source rule is locked but not universally enforced.** The lock fails a
  hand-maintained skill table; it cannot see every possible duplicate, so the rule is enforced where it
  has already bitten rather than everywhere it could.
- **The three vendor leaks found in round 3 are not fixed here.** They are named in
  [11](11-multi-provider-routing.md) § Part A, because removing them is a provider decision.
- **`03`'s seeded wiki pages are not fixed here.** Recorded against [03](03-quality-and-testing.md),
  where that defect class lives.

### Follow-up

[05 — Deliverable order](05-adoption-sequence.md). The first deliverable to take there is
[12](12-measurement-program.md) § Step 1, which needs the endpoint contract from
[11](11-multi-provider-routing.md) § Part A. Nothing in this delivery blocks it.
