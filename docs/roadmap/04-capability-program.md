# 4. Capability program

The following capability areas turn the new philosophy into repeatable factory behavior.

## Front office

- Open a work order from every supported surface.
- Classify software scope and refuse non-technical deliverables.
- Capture decisions as durable questions and blockers.

## Project discovery

- Detect language, toolchain, project type, architecture, repositories, and existing checks.
- Treat brownfield and maintenance work as normal paths.
- Derive commands from the repository rather than templates.
- Persist a useful project context so every agent can start from the same verified facts.

## Planning

- Produce vertical slices with explicit acceptance criteria.
- Attach a verification method to every criterion.
- Identify scope, dependencies, risks, and human gates before execution.

## Execution

- Keep work project-scoped and least-privileged.
- Preserve append-only attempts, leases, logs, and interruption state.
- Make artifacts land in the managed repository.

## Inspection and shipment

- Re-execute evidence independently of worker claims.
- Audit objective coverage and documentation parity.
- Publish only versioned, reproducible, honestly described artifacts.

## Wiki integration

- Link the current wiki to the project and work-order lifecycle.
- Establish a direct, durable project-to-repository relationship for every software project.
- Require the managed repository to contain a `docs/` directory for project-local documentation.
- Distinguish project-local documentation in the repository from the factory's shared operational
  wiki.
- Treat the wiki as shared operational knowledge, not as an independent source of truth.
- Update wiki entries from verified repository state, completion evidence, and durable decisions.
- Mark planned, stale, blocked, and verified knowledge distinctly.
- Detect documentation drift during inspection and shipment.

## Knowledge

Future skills should provide stack knowledge packs where useful, but must remain subordinate to the
repository's discovered conventions and the three agnosticism invariants.

## Capability checklist

- [ ] Front office can open and classify a valid work order.
- [ ] Project discovery records repository, toolchain, architecture, and freshness.
- [ ] Planning maps every criterion to a verification method.
- [ ] Execution enforces project, task, skill, and sandbox boundaries.
- [ ] Inspection independently re-executes evidence and audits claims.
- [ ] Shipment records a versioned artifact and documentation parity.
- [ ] Wiki integration distinguishes shared knowledge from repository `docs/`.
- [ ] Specialist skills and roles are activated only when project context requires them.
- [ ] Every capability has an evaluation suite, regression test, or board row.

## Base engineering skills

- Strengthen the baseline programming skills shared by leads, workers, and inspectors.
- Cover repository reading, planning, implementation, testing, debugging, review, documentation,
  dependency changes, and release preparation.
- Route specialized skills from the project context and discovered toolchain.
- Staff complementary roles when relevant: UX/UI, security, legal and compliance, quality
  assurance, architecture, platform/operations, and data.

## Project agent roster

- Keep the reusable skill catalog separate from instantiated project agents.
- Let the project lead propose and build the project roster after receiving the work order.
- Give each project agent bounded responsibility, context, and private memory.
- Allow multiple agents with the same skill when modules require separate ownership and context.
