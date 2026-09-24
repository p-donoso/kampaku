# Software-factory improvement roadmap

This roadmap records the improvement program after Kampaku's shift from a domain-agnostic harness
to a software factory.

Use [00-template.md](00-template.md) for every new roadmap document. It defines the document **kinds**
and the status vocabulary each kind may use.

The factory is intentionally narrow about its deliverable and strict about its evidence, while
remaining neutral about language, project type, architecture, and provider. The deliverable and its
refusal boundary are stated once, in the [product statute](../product/software-factory.md).

## Where to start

**Read [05 — Adoption sequence](05-adoption-sequence.md) first.** It states which of the two orderings
in this repository actually drives: the [eval lab](../eval/README.md) measures, and capability work is
scheduled by what measurement exposes. The short version:

```text
  Part 1  enable measurement  ->  measure          Step 0, Step 1
  Part 2  fix what measurement exposes             ordered by findings, not by document number
```

**Every capability gate in this roadmap is scored by a suite, and no suite has ever been run.** That
is recorded rather than smoothed over: [12 — Measurement program](12-measurement-program.md) owns
switching the instrument on.

## Normative documents

These are standing rules, not units of work. They have no "complete" state; the question is how far
behavior matches them, which is what their status tracks. Vocabulary: `Declared` · `Partly enforced` ·
`Enforced`.

| Document | Kind | Status | What is enforced now | What is not |
|----------|------|--------|----------------------|-------------|
| [01](01-philosophy.md) Product philosophy | charter | **Partly enforced** | The framing is aligned across every surface a person or agent reads, and locked by test: the front-office prompt, the prompt every agent and the planner inherits, the intake skill, the lead skill, the triage tool, shipped metadata, and the documents. Refusal boundary stated on all of them | Principle 1 is stated everywhere but not *decided* or *recorded*: nothing classifies a request, and a refusal has no durable sink ([04](04-capability-program.md)). Principles 6–8 are held partly: sandbox isolation depends on policy rather than OS containment ([F-015](../eval/results/BOARD.md)), and provider portability is unfinished ([11](11-multi-provider-routing.md) § Part A) |
| [02](02-factory-flow.md) Factory flow | policy | **Partly enforced** | Intake is real: the front office can open a work order on every surface, locked in both directions | Five of the six stations are unexercised end to end; intake does not yet classify scope per request |
| [03](03-quality-and-testing.md) Quality and testing | policy | **Partly enforced** | A check resolves against the repository rather than npm; a criterion naming a non-Node command produces a required check; the seed, planner leaves, worker prompt, and two skills assert no ecosystem | Discovery is not persisted on the project; a check cannot be scoped to one package; the worker cannot verify audio content ([F-009](../eval/results/BOARD.md)) |
| [05](05-adoption-sequence.md) Adoption sequence | sequence | **Active** | The sequence is stated, and the two competing orderings are reconciled in favor of measurement | Steps 0 and 1 have not started: the endpoint contract is unmet and the battery is unrun |
| [16](16-prohibited-operations.md) Prohibited and irreversible operations | policy | **Declared** | The two tiers are enumerated, and each entry names the enforcement layer it needs | Enforced nowhere: there is no git-surface policy, and the only destructive-operation rule is "a bulk request needs confirmation" in one eval suite |

## Capability phases

Units of work with observable end states. Vocabulary: `Proposed` · `Documented` · `In progress` ·
`Blocked` · `Complete`.

| Phase | Status | What exists now | What still blocks the gate |
|-------|--------|-----------------|----------------------------|
| [04](04-capability-program.md) Capability program | **In progress** | The front office can open a work order from chat, CLI, REST, and the agent path; capabilities are framed as gates with named oracles | No scope **classifier**; no project-scoped sandbox root; capacity and cost accounting unowned |
| [06](06-project-context.md) Project context | **Documented** | The schema, the provenance states, and the context/assumption boundary are specified | No project-context schema exists; discovery is not persisted with provenance |
| [07](07-engineering-skills.md) Engineering skills | **Documented** | Baseline skill groups, conditional roles, the skill contract, and both scope boundaries are specified; the skills that prescribed a stack now discover it | Catalog has no data, IaC, mobile, embedded, or compatibility station; role routing still defaults to `frontend` with one run's vocabulary |
| [08](08-project-agent-roster.md) Project agent roster | **Documented** | The catalog/roster split, the authority flow, the required metadata, and the memory boundary are specified | Staffing still absorbs a proposed role into another and reports the original count ([F-006](../eval/results/BOARD.md)) |
| [09](09-domain-model-naming.md) Domain model naming | **Proposed** | The mapping, simplification rules, and the `Shipment`/`Release` call are recorded | No term has been renamed; deliberately deferred as a structural prerequisite |
| [10](10-context-minimization.md) Context minimization | **Proposed** | The default projection, the query surface, and the scope rules are specified | Full-tree injection is still the behavior |
| [11](11-multi-provider-routing.md) Multi-provider routing | **Proposed** | The contract, chain, eligibility rules, compatibility gate, and truth requirements are specified; Part A is separated as the gating piece | Part A **not met**: a vendor name is still required in shipped config, scripts, status output, and error text |
| [12](12-measurement-program.md) Measurement program | **Proposed** | The scope, the run protocol, the reconciliation procedure, and the honesty rules are specified | 25 of 25 suites have never been run; every score in this roadmap is therefore unbacked |
| [13](13-evidence-decay.md) Evidence decay and re-verification | **Proposed** | The revision reference, the invalidation rule, the blast radius, and the recovery path are specified | `stale` is defined for project values, cached facts, and knowledge, but never for a criterion verdict; `reopen` is run-time only |
| [14](14-operator-attention.md) Operator attention and decision load | **Proposed** | The decision queue, the blocking/deferrable split, the interrupt budget, and attention accounting are specified | Nothing exists: the operator appears throughout the roadmap and is never scoped as a resource; [F-007](../eval/results/BOARD.md), [F-012](../eval/results/BOARD.md), and gate P3 are its symptoms |
| [15](15-reversal-and-retraction.md) Reversal, correction, and retraction | **Proposed** | Withdrawal of a report, a shipment, derived knowledge, and a mistaken approval are specified | Nothing exists: `reopen` is run-time only and `rollback` appears once, as an ops role's responsibility ([F-014](../eval/results/BOARD.md) is the same family) |
| [17](17-ai-interaction-expertise.md) AI interaction expertise | **In progress** | The `ai-prompt-engineering` skill is in the catalog (36 skills) and `kampaku-prompt-engineer` is on the platform team, which is legitimate because the platform itself ships system prompts and skills | Nothing else: no aspect detection, no prompt fixture pattern, no endpoint-neutrality check for built software, no cost budget, and the specialist is deliberately **not** in the fixed project template |

Statuses: `Proposed` (specified only) · `Documented` (specified and consistent, no behavior) ·
`In progress` (part of the gate holds, remainder named) · `Blocked` (external dependency missing) ·
`Complete` (gate holds with evidence).

For a normative document: `Declared` (stated only) · `Partly enforced` (some behavior matches) ·
`Enforced` (behavior matches and is locked).

## The two orderings

This repository used to hold two orders that disagreed, and the disagreement had a measurable cost.

| Ordering | Where it lives | What it implies |
|----------|----------------|-----------------|
| **Measurement-driven** | [eval/README.md](../eval/README.md) and [00-protocol.md](../eval/00-protocol.md) | Take one suite whose dependencies are unblocked, measure, record, and open a row on failure |
| **Capability-first** | This roadmap, as first written | Build phases in numeric order; the suites score them at the end |

The capability-first ordering is wrong here because every gate is scored by suites and none has been
run, so it schedules work whose completion cannot be demonstrated. The corrected rule, stated in
[05](05-adoption-sequence.md):

- Nothing enters Part 2 of the sequence because it is next in a list. It enters because a suite, a
  board row, or a probe justifies it, or because it is a **structural prerequisite** that is only
  safe to do before the surface grows.
- A phase already in progress may continue if its gate is a **lock** rather than a run. Capability
  that is locked by a test is real; it is simply not yet observed in the field.
- "Measured", "locked by test", and "unmeasured" are three different claims, and a status must say
  which one it is making.

## Documents

- [01-philosophy.md](01-philosophy.md) — the product principles that govern future work.
- [02-factory-flow.md](02-factory-flow.md) — the normative production line and its gates.
- [03-quality-and-testing.md](03-quality-and-testing.md) — testing, verification, and evidence.
- [04-capability-program.md](04-capability-program.md) — the capability areas to strengthen.
- [05-adoption-sequence.md](05-adoption-sequence.md) — the sequence, and which ordering drives.
- [06-project-context.md](06-project-context.md) — the software context the project entity should expose.
- [07-engineering-skills.md](07-engineering-skills.md) — the base programming skills the factory should strengthen.
- [08-project-agent-roster.md](08-project-agent-roster.md) — project-scoped agents, hierarchy, and memory.
- [09-domain-model-naming.md](09-domain-model-naming.md) — the initial model vocabulary refactor.
- [10-context-minimization.md](10-context-minimization.md) — bounded context projections and on-demand queries.
- [11-multi-provider-routing.md](11-multi-provider-routing.md) — the endpoint contract and staged routing.
- [12-measurement-program.md](12-measurement-program.md) — running the battery and reconciling the roadmap with it.
- [13-evidence-decay.md](13-evidence-decay.md) — keeping a verdict meaningful after the artifact moves.
- [14-operator-attention.md](14-operator-attention.md) — the operator as a bounded resource.
- [15-reversal-and-retraction.md](15-reversal-and-retraction.md) — withdrawing an outcome that was wrong.
- [16-prohibited-operations.md](16-prohibited-operations.md) — operations that are out of bounds.
- [17-ai-interaction-expertise.md](17-ai-interaction-expertise.md) — the station that owns prompts, skills, and model-call cost in built software.

[00-template.md](00-template.md) is the document template; it is not itself a phase.

## Work recovered into an owner

Items that lost their owner when the earlier `docs/product/roadmap.md` was consolidated into this
directory, and where they went once that was noticed. Recorded so nothing is silently dropped again:
a consolidation whose point is that no reference goes missing has to be checked in both directions.

| Item | Now owned by | Was |
|------|--------------|-----|
| Multi-worker capacity, richer schedules and budgets | [04](04-capability-program.md) § Capacity and cost | An unassigned "Later" bullet |
| Per-work-order cost and budget accounting | [04](04-capability-program.md) § Capacity and cost, consuming the per-attempt usage recorded by [11](11-multi-provider-routing.md) | An unassigned "Later" bullet |
| Automated prompt harness for eval run logs | [eval README](../eval/README.md) § Scope of this directory, explicitly out of scope; it does not replace per-suite tests | Correctly out of scope already |
| Running the battery and reconciling this roadmap with it | [12](12-measurement-program.md) | Unowned; the roadmap defaulted to building capability instead |
| Retention policy for workspaces, and backup or export of the durable store | [04](04-capability-program.md) § Capacity and cost, and [16](16-prohibited-operations.md) for the destruction side | `retention` existed only as an unelaborated bullet in the security model and `worker.md` |
| The project's own development process: pull requests, required review, protected branches | [06](06-project-context.md) to record it as project context; [16](16-prohibited-operations.md) for the git surface. Deliberately not a separate phase | `github-admin` is three lines, and the process belongs in project context |

## Rule for future changes

Every improvement must strengthen the factory line, preserve the three
[agnosticism invariants](../concepts/agnosticism-invariants.md), or improve the honesty of its
evidence. Work that does none of these needs explicit justification.

Three rules keep this roadmap honest as it is worked:

1. **Status changes with evidence, not with effort.** A capability phase moves to `Complete` when its
   gate is demonstrated by a run or a test, and the completion record names which.
2. **A closed gap is not a green suite.** Resolving a blocker clears the path; it does not score the
   suite. Rows and statuses say which one happened
   ([BOARD](../eval/results/BOARD.md) legend).
3. **No document widens the deliverable.** A capability that accepts work outside the software scope,
   or a vocabulary that could describe it, is a regression against the
   [statute](../product/software-factory.md) regardless of how well it works.
