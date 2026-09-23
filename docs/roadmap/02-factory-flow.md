# 2. Normative factory flow

- **Phase:** `02 — Factory flow`
- **Status:** `In progress`
- **Owner:** core
- **Dependencies:** [01](01-philosophy.md), [ADR-0005](../adr/0005-factory-authority-model.md)
- **Related documents:** [statute](../product/software-factory.md),
  [agnosticism invariants](../concepts/agnosticism-invariants.md), [eval 25](../eval/25-factory-arc.md)
- **Last reviewed:** 2026-09-23

Every accepted software work order follows this line. A stage may be skipped only when its gate
records why it is not applicable.

1. **Intake** — classify the request, reject out-of-scope work, identify the project container,
   and ask blocking decisions.
2. **Planning** — inspect the repository, discover its toolchain and architecture, define vertical
   slices, acceptance criteria, and evidence.
3. **Staffing** — assign a responsible lead and only the specialists required by the repository.
4. **Execution** — run leased work in a bounded sandbox and write only to the managed project.
5. **Inspection** — re-run checks, inspect artifacts, reconcile claims with durable state, and
   reopen work when evidence is missing or contradicted.
6. **Shipment** — produce a versioned artifact, truthful completion report, and documentation that
   matches the repository.

## Gates

- No intake without a software deliverable. A request whose deliverable is not software and not a
  technical artifact that ships with it is refused with the boundary named, not routed into the line
  ([statute](../product/software-factory.md) § What Kampaku refuses).
- No plan without a clear work order.
- No execution without an approved plan.
- No closure without criterion-level evidence.
- No silent scope expansion.
- No shipment with failed, missing, or unverified required evidence.
- No operation outside the project and role boundaries.
- No stage skipped without a recorded reason it does not apply.

The front office opens work. The line plans and builds. Inspection remains independent.

## Stage checklist

- [ ] Intake records a valid work order and project/repository relationship.
- [ ] Planning discovers repository shape and project-native verification.
- [ ] Staffing assigns only roles and skills required by the work.
- [ ] Execution stays inside the project and approved task scope.
- [ ] Inspection re-executes required checks against the artifact.
- [ ] Shipment includes a versioned artifact and matching documentation.
- [ ] Every blocked transition has a durable reason and recovery path.
- [ ] A refused request is recorded as a refusal that names the boundary, not as a failed attempt.

## What exists now

Intake is real. `create_project` is in the front-office allowlist, reachable through the tool path,
and closed to every other role, so the line's first transition — a person's request becoming a
container with a linked repository and a lead — exists as a capability rather than an instruction.
The boundary is locked in both directions, including a check that the prompt names no unreachable
tool ([BOARD F-001 and F-002](../eval/results/BOARD.md), resolved 2026-09-23;
[ADR-0005](../adr/0005-factory-authority-model.md)).

What that does **not** establish: that the six stations run in sequence in one order. No suite has
been run, and intake cannot yet *decide* whether a request is in software scope — it states the
boundary and refuses, but the classifier is [04](04-capability-program.md) work.

## Gate

**The line is walkable end to end and observable at every stage.** A single work order can pass intake,
planning, staffing, execution, inspection, and shipment; each transition leaves a durable record; and
an operator can name the stage any unit of work is in without reading the database.

Locked by [eval 25](../eval/25-factory-arc.md) (integration arc) and by the stage gates named in
[eval 00](../eval/00-protocol.md).

## Software scope and invariants

This phase may not widen what the factory accepts. Every stage is defined over software work orders,
and the intake stage's refusal is part of the line rather than an error path. The line stays
language-agnostic, project-type-agnostic, and architecture-agnostic
([invariants](../concepts/agnosticism-invariants.md)): a stage may read the project, never assume it.
Bounded authority, repository isolation, and durable state are the line's operating conditions, not
options that a later stage may relax.
