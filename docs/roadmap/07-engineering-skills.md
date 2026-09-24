# 7. Base engineering skills

- **Phase:** `07 — Engineering skills`
- **Kind:** `capability`
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
- **Self-extension:** authoring a skill or a seat when the catalog has no fit. A project whose
  aspects have no matching capability is staffed by authoring it, not by weakening the plan
  ([18](18-self-extension.md)).
- **AI interaction:** system prompts, Agent Skills, model calls, and bring-your-own-key
  configuration. Owns prompt behaviour checks, endpoint neutrality, key safety, and the measured
  cost of model calls. Specified by [17](17-ai-interaction-expertise.md); it is part of this list
  because the role is an engineering aspect of software, not a separate deliverable.

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

## What exists now

Two skills that told agents to assume the platform's own stack have been made toolchain-neutral, and
the worker prompt with them ([03](03-quality-and-testing.md)):

- `qa-testing` no longer reads `package.json` by name, no longer prescribes Vitest, `tsconfig` path
aliases, or `npm test` / `npm run build`. It discovers the repository's tooling and runs the checks the
repository declares.
- `audit-deliverable-readiness` no longer runs `npm` commands; it runs the repository's own checks and
records a missing check as a finding.
- `docs-writer` states its boundary: documentation verified against the code it describes.

Everything below is still open, and the measured shape of it is specific — the catalog and the role
machinery are web-application-shaped:

| Where | What assumes a web stack | Whose phase |
|-------|-------------------------|-------------|
| Skill catalog | No station for data and pipelines, IaC, mobile, embedded, or a compatibility-bound library, while the invariants promise those project types | 07 (here) |
| `apps/core/src/delegator/agent-scope.ts` | `FRONTEND_HINT_WORDS` / `BACKEND_HINT_WORDS` decide a role suffix, **defaulting to `frontend`**; the lists also carry one past run's vocabulary (`ssim`, `vision-api`, `fastapi`) | 07 |
| `apps/core/src/delegator/match-agent.ts` | Word-to-agent routing lists are web-shaped | 07 |
| `apps/core/src/delegator/decompose-intent.ts` | Team naming assumed `{slug}-lead, -frontend, -backend, -qa, -auditor`; the explicit default was removed, and deriving roles from discovered aspects is the remaining work | 07 |
| `apps/core/src/delegator/types.ts`, `plan-granularity.ts` | Feature and complexity patterns keyed on UI/API vocabulary | 07 |

## The catalog is a seed, not a taxonomy

The skills that ship are a **starting set of suggestions**. They are not an enumeration of the roles
that exist, and a project is never staffed by matching its aspects against this list. When nothing
fits, the factory authors what it needs ([18](18-self-extension.md)) — a catalog that cannot grow is
an implicit taxonomy, and it would fail the second project that does not resemble the first.

The seed set is measured on two things: whether it covers the platform's own work, and whether the
path that grows it works.

## Implementation checklist

- [ ] Define baseline skill contracts and required evidence.
- [ ] Add a station for each promised project type: data and pipelines, IaC, mobile, embedded,
  compatibility-bound library ([F-003](../eval/results/BOARD.md)).
- [ ] Derive a role suffix from discovered project aspects, with no `frontend` default and no
  vocabulary inherited from one past run (`ssim`, `vision-api`).
- [ ] Make role routing in `match-agent.ts` data rather than a web-shaped word list.
- [ ] Keep every skill's toolchain instructions neutral: a skill may name a *check name*, never a
  runner, manifest, or framework the repository has not been read for.
- [ ] Separate reusable skills from project-instantiated agents.
- [ ] Add repository discovery and toolchain adaptation.
- [ ] Add implementation, testing, debugging, review, and documentation guidance.
- [ ] Add conditional UX/UI, security, compliance, QA, architecture, operations, data, and AI
      interaction roles, each proposed from a discovered project aspect
      ([17](17-ai-interaction-expertise.md)).
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
