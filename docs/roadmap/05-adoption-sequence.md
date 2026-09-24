# 5. Deliverable order

- **Document:** `05 — Deliverable order`
- **Kind:** `rule`
- **Status:** `Declared`
- **Owner:** product
- **Dependencies:** [01](01-philosophy.md), [11](11-multi-provider-routing.md), [12](12-measurement-program.md)
- **Related documents:** [statute](../product/software-factory.md),
  [agnosticism invariants](../concepts/agnosticism-invariants.md), [eval lab](../eval/README.md)
- **Last reviewed:** 2026-09-24

## How to take one deliverable

1. Pick a deliverable whose dependencies are clear, from § Order below.
2. Read its **Definition of done**. That list is the finish line; nothing else decides closure.
3. Do the work, ticking boxes as they become true.
4. When every box is ticked, fill its **Delivery record** and set the status to `Closed`.
5. Move to the next one.

Two rules keep this honest:

- **A locked promise is not a met one.** A deliverable can be fully specified, fully tested, and still
  not done, because a box that requires a suite run needs the run.
- **A rule is never closed.** The standing rules ([01](01-philosophy.md), [02](02-factory-flow.md),
  [03](03-quality-and-testing.md), and this document) report enforcement instead. Closing a deliverable
  does not close the rule it was measured against.

## The two instruments, and which one drives

This repository holds two orderings, and they used to disagree:

1. **The eval lab drives.** [eval/README.md](../eval/README.md) says to take *one* suite whose
   dependencies are not blocked, measure with public surfaces, and open a board row on failure.
2. **The roadmap, as first written, was capability-first:** build the capability documents in numeric
   order and let the suites score them at the end.

The second was wrong for one measurable reason: **every deliverable's gate is scored by suites, and no
suite had ever been run.** Building capability before switching the instrument on produces work whose
completion cannot be demonstrated — the failure this product exists to prevent, committed by its own
roadmap.

So the order is evidence-first:

```text
  enable measurement   ->   measure   ->   fix what measurement exposes
   Step 0                    Step 1        every other deliverable
```

Capability work does not stop while measuring; it stops being *scheduled* ahead of what the instrument
reports.

## Order

### Step 0 — One documented endpoint contract

Deliverable: [11](11-multi-provider-routing.md) § Part A.

A suite cannot run against "a configured provider" when the configuration, the scripts, the error
strings, and the status output each name a different thing. This is the smallest piece of provider work
and it gates every measurement after it.

**Decision taken (2026-09-24): clean break.** The vendor-prefixed aliases are removed in one change,
and the break is documented. The operator updates their environment. A deprecation shim was the
alternative and was rejected to avoid carrying two names for one setting.

### Step 1 — Measurement baseline

Deliverable: [12](12-measurement-program.md).

Run the battery in order on fresh instances, record a score and the evidence for each suite, and turn
failures into board rows. The point is not to reach 10; it is to replace "promised" with "measured"
everywhere the roadmap currently asserts something.

### Then: every other deliverable, ordered by what measurement exposes

| Deliverable | Trigger that justifies taking it | Order |
|-------------|----------------------------------|-------|
| [16](16-prohibited-operations.md) Prohibited operations | **No trigger — take it early.** Trust in pointing the factory at a real repository does not wait for a measurement, and it is the cheapest here | unconditional |
| [09](09-domain-model-naming.md) Domain model naming | **Structural prerequisite.** Renaming is only safe while behaviour is unchanged; it gets harder every deliverable | prerequisite |
| [10](10-context-minimization.md) Context minimization | **Structural prerequisite** for anything that adds roles or tools | prerequisite |
| [04](04-capability-program.md) Capability program | Its own definition of done, once a classifier is justified by suite [01](../eval/01-work-order-intake.md) or [04](../eval/04-capability-boundary.md) | measured |
| [06](06-project-context.md) Project context | Suite [18](../eval/18-language-agnostic.md) or [19](../eval/19-brownfield-and-legacy.md) exposes a gap; [F-003](../eval/results/BOARD.md) is partially open | measured |
| [07](07-engineering-skills.md) Engineering skills | Suite [18](../eval/18-language-agnostic.md) or [03](../eval/03-stations-and-staffing.md) shows a missing station | measured |
| [08](08-project-agent-roster.md) Project agent roster | Suite [03](../eval/03-stations-and-staffing.md); the seat's fields are still implicit | measured |
| [11](11-multi-provider-routing.md) § Part B Routing | A durable need proven by real runs across more than one endpoint | measured |
| [12](12-measurement-program.md) Measurement program | **Step 1.** Nothing else is ordered before it | first |
| [13](13-evidence-decay.md) Evidence decay | The first time a repository moves under a verified criterion, or [23](../eval/23-shipment-gate.md) exposes it | measured |
| [14](14-operator-attention.md) Operator attention | Three or more deferrable decisions in one order, or [F-007](../eval/results/BOARD.md) / [F-012](../eval/results/BOARD.md) confirmed by [10](../eval/10-human-in-the-loop.md) | measured |
| [15](15-reversal-and-retraction.md) Reversal and retraction | The first time a shipped outcome is found wrong after closure | measured |
| [17](17-ai-interaction-expertise.md) AI interaction expertise | A built project contains prompts, skills, or model calls — the ordinary case for this operator's work | structural + measured |
| [18](18-self-extension.md) Self-extension | A plan needs a capability no seed skill provides | structural + measured |

Nothing here starts because it is next in a list. It starts because something measured says so, or
because it is a structural prerequisite for work that already has a reason.

## Gate

**The order is correct when the roadmap's claims match what measurement found.** Concretely: every
suite has a recorded score or a recorded reason it was not run, no `open` blocking row is unowned, and
every deliverable's status is justified by a run, a lock, or an explicit "not measured".

Scored by [12](12-measurement-program.md) and the battery it runs ([eval 01–25](../eval/README.md)).

## Software scope and invariants

Ordering is itself a scope control: every deliverable lands **without** widening the deliverable. The
three [agnosticism invariants](../concepts/agnosticism-invariants.md) are constraints on all of them
and are checked per deliverable — one that adds a language-specific code path, a fixed project
taxonomy, or a single-deployable assumption is not done because its feature works.

Two properties must survive every deliverable, exactly as [01](01-philosophy.md) requires of any
capability: bounded authority with human decision gates, and durable state that stays truthful through
interruption, failure, and model change. A faster order that trades either away is a regression, not
progress.

## Governance checklist

- [ ] Each document uses [00-template.md](00-template.md), declares its **Kind**, and carries metadata.
- [ ] Each document states its **Gate**, its oracle, and the invariant it must not break.
- [ ] A deliverable carries a **Definition of done**, and closes only when every box is ticked.
- [ ] A rule carries no definition of done and is never marked closed.
- [ ] Status changes with evidence, not with effort; a downgrade is recorded as readily as an upgrade.
- [ ] No document widens the deliverable or frames a capability as accepting non-software work
  ([statute](../product/software-factory.md)).
- [ ] A closed board row is recorded as a cleared blocker, never as a scored suite.
- [ ] Open gaps are recorded in [the board](../eval/results/BOARD.md) in product language.
- [ ] Obsolete names, links, and duplicated sources are removed in the same change.
