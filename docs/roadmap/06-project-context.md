# 6. Project context

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

## Implementation checklist

- [ ] Define the canonical project-context schema.
- [ ] Link every project to one or more verified repositories.
- [ ] Store project type, architecture, languages, and discovered toolchains.
- [ ] Store native build, test, lint, package, and run commands with provenance.
- [ ] Store scope, constraints, ownership, risks, blockers, and decisions.
- [ ] Expose freshness and verification state for every discovered value.
- [ ] Project only relevant context to each agent role.
- [ ] Keep repository documentation and shared knowledge distinct.
- [ ] Test greenfield, brownfield, polyglot, and multi-repository projects.
