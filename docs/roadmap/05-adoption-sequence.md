# 5. Adoption sequence

- **Phase:** `05 — Adoption sequence`
- **Kind:** `sequence`
- **Status:** `Active`
- **Owner:** product
- **Dependencies:** [01](01-philosophy.md), [11](11-multi-provider-routing.md), [12](12-measurement-program.md)
- **Related documents:** [statute](../product/software-factory.md),
  [agnosticism invariants](../concepts/agnosticism-invariants.md), [eval lab](../eval/README.md)
- **Last reviewed:** 2026-09-24

## The two instruments, and which one drives

This repository holds two orderings that used to disagree:

1. **The eval lab drives.** [eval/README.md](../eval/README.md) says to take *one* suite whose
   dependencies are not blocked, measure with public surfaces, and open a board row on failure.
2. **This roadmap, as first written, was capability-first:** build the capability phases in numeric
   order and let the suites score them at the end.

The second ordering is wrong for one measurable reason: **every capability phase's gate is scored by
suites, and no suite has ever been run.** Building phases 02→11 before switching the instrument on
produces a plan with no evidence behind it — the failure this product exists to prevent, committed by
the product's own roadmap.

So the sequence is evidence-first:

```text
  enable measurement  ->  measure  ->  fix what measurement exposes
   Step 0                  Step 1       Part 2, ordered by findings
```

Capability work does not stop while measuring; it stops being *scheduled* ahead of what the
instrument reports. A phase enters Part 2 when a suite, a board row, or a probe justifies its
priority — and a phase already in progress may continue if its gate is a lock rather than a run.

## Part 1 — Enable and measure (do this first)

### Step 0 — One documented endpoint contract

Specified by [11](11-multi-provider-routing.md) § Part A.

A suite cannot be run against "a configured provider" when the configuration, the scripts, the error
strings, and the status output each name a different thing. One contract, no vendor names, documented
precedence, and a failure that names the missing setting. This is the smallest piece of provider work
and it gates every measurement after it.

- [ ] One documented `KAMPAKU_MODEL_*` contract, with documented precedence over stored settings.
- [ ] No shipped source, script, env template, or error message requires a vendor name.
- [ ] A missing endpoint fails with an actionable message and makes no implicit local connection.
- [ ] The legacy-alias migration is decided and recorded, not left ambiguous (see § Open decision).

### Step 1 — Measurement baseline

Specified by [12](12-measurement-program.md).

Run the battery in order on fresh instances, record a score and the evidence for each suite, and turn
failures into board rows. The point is not to reach 10; it is to replace "promised" with "measured"
everywhere the roadmap currently asserts something.

- [ ] Suites 01–25 each have a run log, a score, and cited evidence, or an explicit "not run" with
  the reason.
- [ ] Every failure becomes a board row in product language.
- [ ] Every board row names the suite that will close it.
- [ ] The roadmap status tables reflect what measurement found, including downgrades.

## Part 2 — Capability queue, ordered by what measurement exposes

These are the same capability areas as before, re-framed as a queue rather than a fixed ladder. What
changes is *when* each is worth doing: the trigger column is what justifies starting it.

| Work | Specified by | Trigger that justifies it | Kind |
|------|--------------|---------------------------|------|
| Canonical model simplification | [09](09-domain-model-naming.md) | **Prerequisite.** Renaming while behavior is unchanged is only safe before the surface grows | structural |
| Context minimization | [10](10-context-minimization.md) | **Prerequisite** for any phase that adds roles or tools | structural |
| Vocabulary refactor | [09](09-domain-model-naming.md) | **Prerequisite.** Update contracts, APIs, and labels in one change | structural |
| Intake and scope classification | [02](02-factory-flow.md), [04](04-capability-program.md) | Suite [01](../eval/01-work-order-intake.md) or [04](../eval/04-capability-boundary.md) exposes a gap | measured |
| Stack-neutral discovery, persisted | [03](03-quality-and-testing.md), [06](06-project-context.md) | Suite [18](../eval/18-language-agnostic.md) exposes a gap; [F-003](../eval/results/BOARD.md) is partially open | measured |
| Brownfield, legacy, maintenance paths | [03](03-quality-and-testing.md) | Suite [19](../eval/19-brownfield-and-legacy.md) or [21](../eval/21-maintenance-and-bugfix.md) exposes a gap | measured |
| Multi-repository projects | [06](06-project-context.md) | Suite [20](../eval/20-multi-repo-and-services.md) exposes a gap | measured |
| Operational knowledge projection | [09](09-domain-model-naming.md) | Suite [09](../eval/09-shared-truth.md) or [23](../eval/23-shipment-gate.md) exposes drift | measured |
| Base engineering skills and stack packs | [07](07-engineering-skills.md) | Suite [18](../eval/18-language-agnostic.md) or [03](../eval/03-stations-and-staffing.md) shows a missing station | measured |
| Project roster instantiation | [08](08-project-agent-roster.md) | Suite [03](../eval/03-stations-and-staffing.md); [F-006](../eval/results/BOARD.md) is open | measured |
| Routing, chains, failover | [11](11-multi-provider-routing.md) § Part B | Durable need proven by real runs across more than one endpoint | measured |
| Reproducible shipment | [03](03-quality-and-testing.md) | Suite [23](../eval/23-shipment-gate.md) exposes a gap | measured |
| Capacity, schedules, cost accounting, retention and backup | [04](04-capability-program.md) | A work order exceeds one worker's practical throughput, cost becomes an operator question, or the durable store and workspaces grow without bound | measured |
| Evidence decay and re-verification | [13](13-evidence-decay.md) | **Directly implied by any shipment that is later invalidated.** The first time a repository moves under a verified criterion, or [23](../eval/23-shipment-gate.md) exposes it | measured |
| Operator attention and decision load | [14](14-operator-attention.md) | Three or more deferrable decisions in one order, or [F-007](../eval/results/BOARD.md) / [F-012](../eval/results/BOARD.md) confirmed by [10](../eval/10-human-in-the-loop.md) | measured |
| Reversal, correction, and retraction | [15](15-reversal-and-retraction.md) | The first time a shipped outcome is found wrong after closure, or [11](../eval/11-honest-done.md) shows a verdict that cannot be withdrawn | measured |
| Prohibited and irreversible operations | [16](16-prohibited-operations.md) | **No trigger: this one is first.** Trust in pointing the factory at a real repository does not wait for a measurement, and the policy is cheap | unconditional |
| AI interaction expertise | [17](17-ai-interaction-expertise.md) | A built project contains prompts, skills, or model calls — which is the ordinary case for this operator's BYOK work — or a prompt's cost or neutrality becomes an operator question | structural + measured |

Nothing in Part 2 starts because it is next in a list. It starts because something measured says so,
or because it is a structural prerequisite for work that already has a reason.

## Open decision

**Do the legacy provider aliases keep working?** `KAMPAKU_MODEL_*` is the documented contract, but the
current operator environment still sets vendor-prefixed names, so removing them without a shim breaks
a running setup. Either migrate with a warning for a release window, or drop the aliases in one
change and state the break. This is an operator decision, not a code decision, and it is recorded
here because Step 0 cannot be finished without an answer.

## Gate

**The sequence is correct when the roadmap's claims match what measurement found.** Concretely: every
suite has a recorded score or a recorded reason it was not run, no `open` blocking row is unowned, and
every capability phase's status is justified by a run, a lock, or an explicit "not measured".

Scored by [12](12-measurement-program.md) and the battery it runs
([eval 01–25](../eval/README.md)).

## Software scope and invariants

Sequencing is itself a scope control: every step must land **without** widening the deliverable. The
three [agnosticism invariants](../concepts/agnosticism-invariants.md) are constraints on all of them
and are checked per step — a step that adds a language-specific code path, a fixed project taxonomy,
or a single-deployable assumption is not done because its feature works.

Two properties must survive every step, exactly as [01](01-philosophy.md) requires of any capability:
bounded authority with human decision gates, and durable state that stays truthful through
interruption, failure, and model change. A faster sequence that trades either away is a regression,
not progress.

## Roadmap governance checklist

- [ ] Each document uses [00-template.md](00-template.md), declares its **Kind**, and carries phase metadata.
- [ ] Each document states its **Gate**, its oracle, and the invariant it must not break.
- [ ] Status uses the vocabulary of its kind: a policy is `Enforced` or not; a capability may be `Complete`.
- [ ] Status changes with evidence, not with effort; a downgrade is recorded as readily as an upgrade.
- [ ] No document widens the deliverable or frames a capability as accepting non-software work
  ([statute](../product/software-factory.md)).
- [ ] A closed board row is recorded as a cleared blocker, never as a scored suite.
- [ ] Open gaps are recorded in [the board](../eval/results/BOARD.md) in product language.
- [ ] Obsolete names, links, and duplicated sources are removed in the same change.
