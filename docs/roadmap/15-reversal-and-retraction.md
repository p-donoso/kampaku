# 15. Reversal, correction, and retraction

- **Document:** `15 — Reversal, correction, and retraction`
- **Kind:** `deliverable`
- **Status:** `Proposed`
- **Owner:** core / web
- **Dependencies:** [02](02-factory-flow.md), [03](03-quality-and-testing.md)
- **Related documents:** [statute](../product/software-factory.md),
  [agnosticism invariants](../concepts/agnosticism-invariants.md),
  [execution assurance](../architecture/execution-assurance.md), [eval 11](../eval/11-honest-done.md),
  [eval 23](../eval/23-shipment-gate.md), [evidence decay](13-evidence-decay.md)
- **Last reviewed:** 2026-09-24

## Purpose

The factory can go forward truthfully. It cannot go **backward**.

`reopen` exists, but only as a run-time act inside a live run: sabotage detected during a job reopens
the work ([02](02-factory-flow.md), [03](03-quality-and-testing.md), [eval 11](../eval/11-honest-done.md)).
`rollback` appears once in the roadmap, as a responsibility of an operations *role*
([07](07-engineering-skills.md)), not as a capability the factory has. Nothing describes retracting a
completion report, withdrawing a shipment, or withdrawing knowledge that was projected as verified.

Concretely today: you ship v1 and approve its report. A week later you find it wrong. The supported
paths are to open a new work item, or to write a fix and ship v2 — while the completion report for v1
still reads as a true record, the wiki still presents what it projected as verified, and every surface
still shows the item as shipped. The factory has no way to say "that was wrong", only "here is
something else".

That is the [F-014](../eval/results/BOARD.md) family — claims reconciled for creation but not for
state — at the scale of a shipment.

## Outcome

A wrong outcome can be **withdrawn**, and the withdrawal propagates everywhere the outcome was
reported, on every surface, with a durable reason and an audit trail.

An operator can:

- **Reverse** a completed work item whose evidence turned out to be wrong, leaving the record of what
  was believed and why;
- **Withdraw** a shipment, so nothing presents it as shipped;
- **Retract** a knowledge projection derived from a wrong verdict, rather than leaving it as verified
  knowledge;
- **Correct** a claim the factory already made, without deleting the fact that it was made;
- see, from the artifact, that something was withdrawn and why.

## Scope

### In scope

- [ ] A withdraw path for a completion report whose evidence no longer holds, with a required reason.
- [ ] Shipment withdrawal: the versioned artifact and its knowledge are marked withdrawn, and no
      surface still offers it as shipped.
- [ ] Retraction of shared knowledge derived from a withdrawn verdict, distinct from editing a wiki
      page to say something new.
- [ ] Transitive withdrawal: everything that depended on the withdrawn verdict is marked, not silently
      re-derived.
- [ ] Reversal of a scope or plan approval that was granted on a wrong premise, so the approval cannot
      be replayed.
- [ ] Correction of a factual claim the factory made: the original stands in the record, marked
      corrected, with the correction alongside it.
- [ ] Propagation to all three surfaces, with the same ids, states, and reason text.
- [ ] Distinguishing withdrawal from supersession: a withdrawn item is not a superseded one, and the
      traceability chain shows which occurred.

### Out of scope

- [ ] Rewriting history in the project repository. Reversal is a factory-record act; the repository's
      history is the operator's, and rewriting it is prohibited
      ([16](16-prohibited-operations.md)).
- [ ] Undoing physical side effects in the world: a deployed service, a published package, a paid
      invoice. The factory records the withdrawal and states what it cannot undo.
- [ ] Automatic reversal. A withdrawal is a decision with a reason, never a heuristic.
- [ ] Deleting anything. Every reversal produces history, not absence.

## Definition of done

Every box ticked closes this deliverable. Nothing here needs a judgement call.

- [ ] A shipment can be withdrawn with a durable reason, and no surface still presents it as shipped
- [ ] Derived knowledge stops reading as verified
- [ ] Dependent items are marked, and a partial propagation is stated rather than hidden
- [ ] An approval granted on a withdrawn premise cannot be replayed
- [ ] Nothing is deleted: the original record remains readable beside the correction
## Gate

**A shipped item can be withdrawn with a durable reason, and no surface presents it as shipped
afterward.**

- [ ] Withdrawing a shipment marks the artifact and its knowledge withdrawn, and the reason is durable.
- [ ] Chat, CLI, REST, and web agree on the withdrawn state of the same item.
- [ ] Shared knowledge derived from the withdrawn verdict no longer reads as verified.
- [ ] Dependent items are marked, not silently re-derived.
- [ ] The traceability chain shows: what was believed, on what evidence, who withdrew it, when, and why.
- [ ] An approval granted on the withdrawn premise cannot be replayed.
- [ ] The withdrawn record is still readable: nothing was deleted.
- [ ] A correction to a factual claim leaves the original claim in the record, marked corrected.

Scored by a new suite; the closest existing oracles are [11](../eval/11-honest-done.md) (reopening on
contradicted evidence) and [23](../eval/23-shipment-gate.md) (what "shipped" means).

## Software scope and invariants

**Reversal is what makes "verified" safe to trust.** Evidence that can only be added is a record that
can only grow in one direction, and a product whose central promise is honesty needs the other
direction: a supported way to be wrong out loud.

**Language-agnostic and project-type-agnostic.** Withdrawal is defined over the factory's own records —
report, shipment, knowledge, approval — none of which depend on a language or a project kind. The
project's repository is touched only to state what the factory now believes, never to rewrite it. A
withdrawal that requires a particular toolchain to verify the new state breaks **F2**.

**Architecture-agnostic.** A shipment may span repositories. A withdrawal from a personal factory does
not roll back the world, so the honest outcome is a truthful state plus an explicit statement of what
remains in place and what the operator must do
([invariants §3](../concepts/agnosticism-invariants.md) — a partially applied cross-repository change
is reported, not claimed complete).

**Distinct from decay.** [13](13-evidence-decay.md) is time-driven: the artifact moved, so the verdict
is no longer supported. This phase is mistake-driven: the verdict was never right, or the decision
behind it was wrong. Both can apply to one item, and the record must say which it is, or the audit
trail becomes ambiguous exactly when it matters.

**Durable and truthful.** A withdrawal is durable across a closed chat, a crashed process, and a model
swap. The record of what was believed is never deleted, because a product that cannot show its own
past errors cannot be audited.

**Repository isolation.** Withdrawing one project's shipment never mutates another project's records or
repository.

## Design rules

- [ ] Reversal always requires a reason, and the reason is visible wherever the state is.
- [ ] Never delete: append a withdrawal that supersedes the state, keeping the original.
- [ ] Distinguish withdrawn from superseded from stale from failed, in the model and on every surface.
- [ ] Propagate transitively, or state plainly which dependents remain unmarked.
- [ ] State what reversal cannot undo, rather than implying a rollback that did not happen.
- [ ] A withdrawal is recorded in the audit trail as an event with an actor and an authority.
- [ ] Withdrawal must not be reachable as a way to make a board green.

## Work checklist

### Model and contracts

- [ ] Define the withdrawal record: subject, reason, actor, authority, time, and scope of effect.
- [ ] Define the states and the legal transitions for report, shipment, knowledge, and approval.
- [ ] Define transitive propagation and how a partially propagated withdrawal is reported.
- [ ] Add the states to the schemas in `packages/contracts` and to the domain model.

### Behavior

- [ ] Withdraw a shipment; mark its artifact and knowledge withdrawn.
- [ ] Withdraw a completion report whose evidence no longer holds.
- [ ] Retract derived knowledge without editing it into a new claim.
- [ ] Invalidate an approval granted on a withdrawn premise so it cannot be replayed.
- [ ] Correct a factual claim, keeping the original marked corrected.
- [ ] Report what the withdrawal could not undo.

### Operator surfaces

- [ ] Show withdrawn state on chat, CLI, REST, and web with the same ids and reason.
- [ ] Show the traceability chain from requirement to withdrawal.
- [ ] Make withdrawal a deliberate act requiring a reason, not a one-key action.

### Quality

- [ ] Test propagation: withdrawal marks report, knowledge, and dependents together.
- [ ] Test that a withdrawn item cannot be resubmitted unchanged as a new completion.
- [ ] Test interaction with decay: an item can be both stale and withdrawn, and the record says why.
- [ ] Test that nothing is deleted and the original remains readable.

## Acceptance criteria

- [ ] A wrong shipment can be withdrawn with one deliberate act and a reason.
- [ ] No surface still presents a withdrawn item as shipped.
- [ ] Derived knowledge stops reading as verified.
- [ ] The audit trail shows what was believed, why, who withdrew it, and what remains undone.
- [ ] Nothing is deleted, and the correction is visible beside the original.
- [ ] Withdrawal cannot be used to make a failed board read as green.

## Risks and open decisions

- [ ] **Withdrawal can become a way to launder a failure.** If the state can be cleared, the incentive
      is to withdraw rather than fix. The withdrawal must be as visible as the original shipment — a
      withdrawn item is a finding, not a cleanup.
- [ ] **Transitive propagation has no natural boundary.** Marking everything downstream could reach the
      whole project. A bounded, stated blast radius is better than an unbounded one that silently
      stops partway.
- [ ] **Overlap with [13](13-evidence-decay.md) and [23](../eval/23-shipment-gate.md).** Three
      documents touch the lifecycle of a verdict; if they are implemented separately the states will
      disagree. Decide the state machine once, then implement.
- [ ] **What "withdrawn" means for a release tag the factory created.** The factory may not delete it
      ([16](16-prohibited-operations.md)), so withdrawal is a statement about the factory's record, not
      about the tag. This needs to be unambiguous to an operator, or it will be misread as a deletion.
- [ ] **An operator may want to withdraw without telling the factory why.** The reason is the point of
      the phase; a withdrawal with no reason is indistinguishable from a mistake being hidden.
