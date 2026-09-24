# 4. Capability program

- **Document:** `04 — Capability program`
- **Kind:** `deliverable`
- **Status:** `In progress`
- **Owner:** product / core
- **Dependencies:** [statute](../product/software-factory.md), [03](03-quality-and-testing.md)
- **Related documents:** [statute](../product/software-factory.md),
  [agnosticism invariants](../concepts/agnosticism-invariants.md), [eval 04](../eval/04-capability-boundary.md)
- **Last reviewed:** 2026-09-23

The following capability areas turn the new philosophy into repeatable factory behavior. Every item
below is a **factory capability or gate**, not a promise to handle a broader class of work
([statute](../product/software-factory.md) § Consequence for future work).

## Front office

- Open a work order from every supported surface ([BOARD F-001](../eval/results/BOARD.md)).
- **Open it with an accountable owner — landed and measured 2026-09-24.** `create_project` refuses a
  call without a lead and validates the lead before persisting anything, so the failure mode that
  leaves an orphan behind is closed in code rather than by instruction
  ([BOARD F-005](../eval/results/BOARD.md), closed by run 3).
- **Answer an inspection from state.** Open: the durable-state block has carried the projects, the
  roster, and the work-item counts since before run 3, and three runs have failed to turn that into an
  answer ([BOARD F-024 and F-030](../eval/results/BOARD.md)). The fourth attempt attacked the input
  rather than the instruction — the orchestrator no longer carries ~10 KB of `workflow-*` fragments for
  tools it does not hold, a measured **−30.2%** of the turn — and whether that is the cause is exactly
  what run 4 decides. See [10](10-context-minimization.md), which now carries a number.
- **Every skill fragment a role reads names a capability that role holds.** Open, and the same defect
  family as [F-001 and F-002](../eval/results/BOARD.md) one level down: a `SKILL.md` can declare a tool
  the runtime never registers (`system-architect` → `code-agent`) or a tool the reading role is
  forbidden to call ([BOARD F-031](../eval/results/BOARD.md)).
- Classify software scope and refuse non-technical deliverables with the boundary named. Today the
  boundary is stated by contract but not yet *decided* per request; the classifier is this area's
  outstanding piece.
- Classify software scope per request, so the refusal is a decision rather than an instruction a model
  may skip ([statute](../product/software-factory.md) § Known limitations).
- **Durable refusal — landed 2026-09-24.** A refusal is recorded with the boundary it crossed, on a
  `scope_refusals` table, and readable on CLI (`kampaku refusals list`) and REST
  (`GET /api/v1/refusals`). It has the same durable standing as a question or a blocker, because it is a
  decision the factory made on the operator's behalf. What remains here is the *classifier* below.
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

## Project and release lifecycle

Every object the factory creates needs a supported way to leave the system, or the operator is forced
into raw REST calls the product does not document.

- Provide a supported decommission path for a project created in error ([F-011](../eval/results/BOARD.md)).
- Bound a plan preview's lifetime, so a preview from any point in history is not approvable forever
  while approvals themselves expire ([F-012](../eval/results/BOARD.md)).
- Persist a turn's in-progress state, so an interrupted turn is visible while it runs instead of
  leaving side effects with no record ([F-013](../eval/results/BOARD.md)).
- Give every state an observed transition rule: created, active, paused, blocked, shipped, archived.

## Operations

- Record port ownership per service, so a later run can reclaim its own orphaned listener instead of
  reporting a stale process it cannot resolve ([F-016](../eval/results/BOARD.md)).
- Keep start, stop, and status honest about what is actually listening.

## Capacity and cost

The line runs one worker per host today, and nothing accounts for what a work order costs. Both were
unassigned bullets in the retired roadmap; they belong here because they are properties of the line.

- Support more than one worker, with bounded concurrency and richer schedules.
- Apply and report budgets per work order: time, iterations, and spend.
- Account for cost per work order from the per-attempt usage the model plane already records
  ([11](11-multi-provider-routing.md) § Truth and observability).
- Make exhaustion visible as a durable state, never as a silent stop
  ([eval 00](../eval/00-protocol.md) gate **U6**).
- Apply a retention policy to sandbox workspaces, job artifacts, and expired leases, so a long-lived
  instance does not grow without bound. `retention` is currently an unelaborated bullet in the
  [security model](../security/security-model.md) and [worker architecture](../architecture/worker.md).
- Provide backup and export of the durable store, and a restore that is tested rather than assumed,
  because a personal factory accumulates months of work in one place. The destruction side of this is
  a prohibition ([16](16-prohibited-operations.md)); being able to recover from it is this section.

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
- [ ] No capability is framed as accepting work outside the software deliverable.
- [ ] Every lifecycle state has a supported operator path, with no raw-REST-only escape hatch.
- [ ] Cost and capacity are reported as durable facts, not inferred from logs.

## What exists now

Opening a work order is real on every tested surface: the front office creates the project container
from chat, the CLI, the REST API, and the agent path, with the allowlist locked in both directions
([BOARD F-001 and F-002](../eval/results/BOARD.md), resolved 2026-09-23).

**Run 3 of suite 01 (2026-09-24) added the missing half: the container is owned.** `create_project`
requires `project_lead_slug` in its own schema, so the model supplied an existing lead on the first
call rather than being refused and correcting — and `intake-demo` came back with
`projectLeadAgentId` set to `kampaku-manager`, the same slug the reply named. F-005, a probe claim for
days, is closed by observation ([baseline run](../eval/baseline-20260924.md) § Run 3).

What the same run shows is the **reporting** half of the front office, and it is not done. Asked what
exists, the agent read the stores and answered about the skill catalog; asked to show the container it
had just created, it asked the operator for the project's name. Successive rewording has failed three
times on the first of those, so its next attempt is a design change rather than a sentence. The
capability areas below are otherwise unchanged — specification first, no capability is claimed until a
suite or a board row scores it.

## Definition of done

Every box ticked closes this deliverable. Nothing here needs a judgement call.

- [ ] Every capability area named here is owned by a document with its own definition of done
- [ ] The front office opens a work order from chat, CLI, REST, and the agent path, and the four surfaces agree on the ids
- [ ] The front office classifies a request as in or out of software scope, and a refusal is recorded durably
- [ ] Every capability named here cites the suite, test, or board row that scores it
- [ ] Wiki integration distinguishes shared knowledge from repository `docs/` and detects drift between them
## Gate

**Every capability in this program is a factory capability or a gate, and each one names the suite,
regression test, or board row that scores it.** A capability with no oracle is not done; it is a
promise, and the program's checklist item above says so.

Scored by [eval 04](../eval/04-capability-boundary.md) for scope and by each capability's own suite,
with [BOARD](../eval/results/BOARD.md) rows for anything still unmeasured.

## Software scope and invariants

This phase is where scope could be lost by accident: a capability written as "handle any request" is
the regression that re-opens the catch-all framing. Each capability is bounded by the
[statute](../product/software-factory.md) § What "software" means here.

The complementary roles below are **review aspects of software work**, not new deliverables: legal
and compliance identifies licensing, privacy, and regulatory constraints on code the factory builds
and escalates to qualified advice, and it does not make a legal instrument a factory output. The same
applies to UX/UI: a software interface is in scope, a standalone visual identity is not
([07](07-engineering-skills.md)).

Language, project type, and architecture stay discovered, not assumed
([invariants](../concepts/agnosticism-invariants.md)).

## Base engineering skills

- Strengthen the baseline programming skills shared by leads, workers, and inspectors.
- Cover repository reading, planning, implementation, testing, debugging, review, documentation,
  dependency changes, and release preparation.
- Route specialized skills from the project context and discovered toolchain.
- Staff complementary roles when relevant: UX/UI, security, legal and compliance (as a review
  aspect of software work, never as a legal deliverable), quality assurance, architecture,
  platform/operations, and data.

## Project agent roster

- Keep the reusable skill catalog separate from instantiated project agents.
- Let the project lead propose and build the project roster after receiving the work order.
- Give each project agent bounded responsibility, context, and private memory.
- Allow multiple agents with the same skill when modules require separate ownership and context.
