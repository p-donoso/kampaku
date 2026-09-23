# 7. Base engineering skills

- **Phase:** `07 — Engineering skills`
- **Status:** `Documented`
- **Owner:** contracts / core
- **Dependencies:** [01](01-philosophy.md), [06](06-project-context.md)
- **Related documents:** [statute](../product/software-factory.md),
  [agnosticism invariants](../concepts/agnosticism-invariants.md), [skills catalog](../concepts/skills.md)
- **Last reviewed:** 2026-09-23

The factory's narrowed purpose permits a stronger programming foundation. These skills are shared
capabilities, not a fixed stack or a replacement for repository-specific expertise.

## Baseline skill groups

- **Repository discovery:** read structure, conventions, dependencies, history, and existing checks.
- **Planning:** turn intent into vertical slices, acceptance criteria, risks, and evidence.
- **Implementation:** make scoped changes that fit the existing architecture and style.
- **Testing:** select and update appropriate unit, integration, contract, end-to-end, smoke, or
  other project-native checks.
- **Debugging:** reproduce failures, isolate causes, preserve evidence, and verify the fix.
- **Review:** inspect correctness, scope, security, maintainability, compatibility, and regressions.
- **Documentation:** keep code-adjacent docs, API contracts, runbooks, and the project `docs/`
  directory aligned with the repository. The scope is documentation verified against code; prose with
  no code to verify against is not this skill's output.
- **Dependencies:** inspect provenance, compatibility, upgrade impact, and lockfile or equivalent
  state.
- **Release preparation:** build, package, version, migrate, and document reproducibility.

## Complementary roles

The factory should staff these roles when the project context makes them relevant:

- **UX:** user journeys, task clarity, accessibility needs, and usable acceptance criteria.
- **UI:** interface structure, interaction states, visual consistency, responsive behavior, and
  interface verification. This role supports software interfaces; it does not make standalone
  visual design an in-scope deliverable.
- **Security:** threat modeling, authentication and authorization, secret handling, dependency
  risk, abuse cases, and security verification.
- **Legal and compliance:** licensing, privacy, data retention, regulatory constraints, terms, and
  release risks. This role identifies issues and escalation needs; it does not replace qualified
  legal advice where that is required.
- **Quality assurance:** test strategy, exploratory testing, regression coverage, and release gates.
- **Architecture:** boundaries, interfaces, persistence, integration, operational tradeoffs, and
  migration risk.
- **Platform and operations:** deployment, observability, reliability, rollback, and runbooks.
- **Data:** schemas, migrations, pipelines, quality rules, provenance, and privacy controls.

Roles are selected from discovered project aspects. The factory must not create a fixed team when
the repository does not require those responsibilities.

## Skill contract

Every base skill should state:

- required project context;
- permitted actions and tools;
- expected inputs and outputs;
- evidence it must produce;
- failure and escalation behavior;
- how it adapts to an unfamiliar language or toolchain.

## Design constraints

- Skills must not assume a particular language, package manager, test runner, or repository layout.
- Skills must prefer existing project conventions over generic examples.
- Skills must fail clearly when required evidence or capabilities are unavailable.
- Skills must not grant authority beyond the actor, project, work item, and sandbox policy.
- Skills should be independently testable against greenfield, brownfield, polyglot, and legacy repos.

## Success condition

An agent with the base skills can enter an unfamiliar software repository, discover how it works,
make a bounded change, verify it using the project's own mechanisms, and leave behind truthful
documentation and evidence.

## Implementation checklist

- [ ] Define baseline skill contracts and required evidence.
- [ ] Separate reusable skills from project-instantiated agents.
- [ ] Add repository discovery and toolchain adaptation.
- [ ] Add implementation, testing, debugging, review, and documentation guidance.
- [ ] Add conditional UX/UI, security, compliance, QA, architecture, operations, and data roles.
- [ ] Define least-privilege tools for each skill.
- [ ] Test skills against unfamiliar and non-default repositories.
- [ ] Reject skills that invent commands, stacks, facts, or authority.
- [ ] Reject a skill that accepts non-software work or claims a deliverable it cannot verify.

## Gate

**An agent using only the base skills can enter an unfamiliar software repository, make a bounded
change, verify it with the project's own mechanisms, and leave truthful evidence behind.** A skill
that only works on the platform's own stack, or only in a repository the agent has seen before, does
not meet this gate.

Scored by [eval 18](../eval/18-language-agnostic.md), [19](../eval/19-brownfield-and-legacy.md),
[21](../eval/21-maintenance-and-bugfix.md), and the staffing check in
[03](../eval/03-stations-and-staffing.md).

## Software scope and invariants

The skill catalog is a second place, after the front-office prompt, where a catch-all framing can
enter the product — a skill written as "assist with any content request" reintroduces exactly what
[01](01-philosophy.md) removed. Every skill is bounded by the
[statute](../product/software-factory.md): the deliverable is software and the technical artifacts
that ship with it.

Two boundaries in this document are load-bearing and must survive implementation:

- **UX/UI is software interfaces, not standalone design.** Interface structure, states, and
  verification are in scope; a visual identity delivered on its own is refused with the boundary
  named.
- **Legal and compliance is a review aspect of software work.** It identifies licensing, privacy,
  data-retention, and regulatory constraints on what the factory builds and escalates where
  qualified advice is required. A legal instrument is not a factory deliverable.

Skills must not bake a language, package manager, test runner, or repository layout into their
instructions: a toolchain-shaped skill breaks **F2** and makes the invariant
([§1](../concepts/agnosticism-invariants.md)) false at the point where agents actually read
guidance.
