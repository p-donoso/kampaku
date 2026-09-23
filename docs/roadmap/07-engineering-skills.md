# 7. Base engineering skills

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
  directory aligned with the repository.
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
