# 6. Project context

- **Document:** `06 — Project context`
- **Kind:** `deliverable`
- **Tracking issue:** [#7](https://github.com/p-donoso/kampaku/issues/7)
- **Related documents:** [statute](../product/software-factory.md),
  [agnosticism invariants](../concepts/agnosticism-invariants.md), [eval 20](../eval/20-multi-repo-and-services.md)
- **Last reviewed:** 2026-09-23

## Purpose

Give every station a durable, provenance-aware view of the software project it is working on.

## Outcome

Agents and operators can identify the project, repositories, technical shape, constraints, checks,
and current risks without treating an unknown value as fact.

## Scope

### In scope

- [ ] Canonical project identity, repository links, technical shape, and delivery context.
- [ ] Provenance, freshness, and explicit unknown states.

### Out of scope

- [ ] Private agent memory or a copy of the repository.
- [ ] A fixed project taxonomy or assumed toolchain.

The project entity should give the front office, leads, workers, inspectors, and the operator a
shared starting point. It should expose context, not pretend that undiscovered values are facts.

## Identity and purpose

- Stable project id and slug.
- Human-readable name and concise purpose.
- Work-order summary and current objective.
- Lifecycle state: proposed, active, paused, shipped, archived, or blocked.
- Responsible lead and operator-visible ownership.

## Repository relationship

- One or more explicit repository links, each with a stable id and local or remote location.
- Repository role: primary, dependency, service, deployment, or documentation.
- Default repository and project-relative working path.
- Branch or version reference used for the current work order.
- Repository existence and access status, with verification timestamp.
- Required project-local documentation path, normally `docs/`.

## Technical shape

- Project type: application, service, library, SDK, infrastructure, pipeline, tooling, or other
  technical artifact.
- Architecture shape: single package, monorepo, multi-repo, service system, embedded, or discovered
  alternative.
- Languages and major toolchains, including polyglot subdirectories.
- Build, test, lint, format, package, and run commands discovered from the repository.
- Runtime, deployment targets, and relevant environments.
- External services, interfaces, schemas, and compatibility constraints.

## Operating constraints

- Scope boundaries and explicit non-goals.
- Security, data-handling, dependency, and licensing constraints.
- Required approvals and human decisions.
- Resource, time, platform, or compatibility limits.
- Branching, release, and versioning expectations.

## Quality and delivery

- Existing test strategy and known coverage gaps.
- Acceptance evidence expected for the current objective.
- Verification capabilities available and unavailable.
- Shipment definition and reproducibility requirements.
- Current risks, blockers, and deferred decisions.

## Provenance rules

Every value should carry a state such as:

- **Declared** — supplied by the operator or work order.
- **Discovered** — read from the repository or environment.
- **Verified** — confirmed by an executed check or inspection.
- **Stale** — previously known but not confirmed after relevant change.
- **Unknown** — not yet available.

Agents must see the value, its provenance, and its last verification time. A missing or stale value
should trigger discovery or a durable question when it affects planning, execution, or shipment.

## Boundary

The project entity should summarize durable context. It should not become a second repository, a
free-form agent memory store, or a catalog of assumptions. Detailed implementation knowledge stays
in the repository and its `docs/`; shared operational conclusions are projected into the wiki.

## What exists now

The documentation defines the target context, repository relationship, provenance states, and
agent-facing boundary. The canonical schema, durable discovery, and cross-surface exposure remain
open work.

## Design rules

- [ ] Prefer discovered facts over defaults.
- [ ] Keep repository `docs/` distinct from shared operational knowledge.
- [ ] Keep project context bounded and project-scoped.
- [ ] Preserve repository, architecture, and language agnosticism.

## Work checklist

- [ ] Define the canonical project-context schema.
- [ ] Link every project to one or more verified repositories.
- [ ] Store project type, architecture, languages, and discovered toolchains.
- [ ] Store native build, test, lint, package, and run commands with provenance.
- [ ] Store scope, constraints, ownership, risks, blockers, and decisions.
- [ ] Expose freshness and verification state for every discovered value.
- [ ] Project only relevant context to each agent role.
- [ ] Keep repository documentation and shared knowledge distinct.
- [ ] Test greenfield, brownfield, polyglot, and multi-repository projects.
- [ ] Refuse a project whose declared deliverable is not software, in product language.

## Definition of done

Every box ticked closes this deliverable. Nothing here needs a judgement call.

- [ ] A project exposes repositories, toolchain, project type, and architecture shape, each with provenance and freshness
- [ ] A value that was not verified reads `Unknown`, never as a fact
- [ ] A planning, execution, or shipment decision can name the verified project fact it used
- [ ] Tested on greenfield, brownfield, polyglot, and multi-repository projects
## Gate

**Every planning, execution, and shipment decision can name the verified project fact it used, or
state that the fact is Unknown.** A value with no provenance and no freshness is not context; it is an
assumption the factory is about to template. This is principle 9 of the
[development principles](../development/principles.md) applied to the project entity.

Scored by [eval 19](../eval/19-brownfield-and-legacy.md), [20](../eval/20-multi-repo-and-services.md),
and the discovery half of [18](../eval/18-language-agnostic.md).

## Software scope and invariants

`Project type` in this schema enumerates **technical artifacts only** — application, service,
library, SDK, infrastructure, pipeline, tooling, embedded target — because the project entity is the
container for a software work order ([statute](../product/software-factory.md)). A request whose
deliverable is not software is refused at intake and never becomes a project, so this entity needs no
field for it and must not grow one.

Discovery is what makes the three invariants real. Because language, project type, and architecture
are stored as **discovered** with provenance rather than declared from a taxonomy, a polyglot
monorepo, a legacy service, and a single embedded package are all expressible without the factory
carrying a default ([invariants](../concepts/agnosticism-invariants.md)). Repository links stay
plural and external: a project references repositories, and is never one.

## Risks and open decisions

- [ ] Stale discovery may be mistaken for current truth; every value needs freshness.
- [ ] Context may become a second memory store; keep detail in the repository or shared knowledge.
- [ ] Multi-repository projects need explicit primary and supporting roles.

## Delivery record

Not started. Filled when the definition of done is fully ticked.
