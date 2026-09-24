# 13. Evidence decay and re-verification

- **Document:** `13 — Evidence decay and re-verification`
- **Kind:** `deliverable`
- **Status:** `Proposed`
- **Owner:** core / worker
- **Dependencies:** [03](03-quality-and-testing.md), [06](06-project-context.md)
- **Related documents:** [statute](../product/software-factory.md),
  [agnosticism invariants](../concepts/agnosticism-invariants.md),
  [execution assurance](../architecture/execution-assurance.md), [eval 11](../eval/11-honest-done.md),
  [eval 23](../eval/23-shipment-gate.md), [measurement program](12-measurement-program.md)
- **Last reviewed:** 2026-09-24

## Purpose

The product's central claim is that a completion requires evidence re-executed against the artifact.
**Evidence is currently treated as permanent.** A criterion verified once stays verified while the
repository moves underneath it, so the factory can honestly report a state that no longer exists.

The word `stale` exists in three places, and none of them is a verdict:

| Where | What can be stale | What cannot |
|-------|-------------------|-------------|
| [06](06-project-context.md) | A discovered project value, after a relevant change | A criterion's verdict |
| [10](10-context-minimization.md) | A cached fact in an agent's context | The record the cache was derived from |
| [04](04-capability-program.md) | A wiki page that drifted from disk | The evidence that justified closing the work |

`reopen` exists, but only as a **run-time** act: sabotage detected during a job reopens the work
([statute](../product/software-factory.md) § Gates, [03](03-quality-and-testing.md),
[eval 11](../eval/11-honest-done.md)).
Nothing invalidates a verdict after a run has ended. So "claims are not evidence" is enforced at the
moment of the claim and never again — the principle is time-blind.

This is the same defect shape the product exists to prevent, at a longer timescale than the lab
currently measures: a green record over a reality that moved.

## Outcome

A verdict whose basis changed stops reading as verified. Concretely, an operator asking "is this
still true?" gets a durable answer derived from the repository, not from the age of a record:

- every criterion verdict names the artifact revision it was observed against;
- a change to that artifact marks the affected verdicts **stale**, naming what invalidated them;
- closure and shipment refuse to treat stale evidence as current;
- shared knowledge derived from an invalidated verdict is marked stale with it;
- re-earning the verdict is a re-run of the same check, not a new claim.

## Scope

### In scope

- [ ] A revision reference on every evidence record, so "what was observed" is a specific state.
- [ ] An invalidation rule: which change invalidates which verdicts, and how the blast radius is
      computed.
- [ ] Criterion-level, not run-level, invalidation. One changed file invalidates the criteria that
      depend on it, not every criterion in the project.
- [ ] Blast radius per package, so a change in one package of a monorepo does not invalidate another
      package's verdicts.
- [ ] A re-verification path: re-running the same check re-earns the verdict and clears the stale mark.
- [ ] Visibility on all surfaces: chat, CLI, REST, and web agree that a verdict is stale.
- [ ] Propagation to shared knowledge: a wiki claim resting on a stale verdict is marked stale.
- [ ] Shipment refusal: a shipment whose required evidence is stale is not shipped
      ([eval 23](../eval/23-shipment-gate.md)).

### Out of scope

- [ ] Continuous re-verification of everything, on a schedule. Re-verification is triggered by a
      change, not by a clock.
- [ ] Re-running checks speculatively when nothing relevant changed.
- [ ] Invalidating evidence because a *model provider* changed. A provider is not the artifact.
- [ ] Deciding whether changed behavior is acceptable. That is a new work item, not decay.

## Definition of done

Every box ticked closes this deliverable. Nothing here needs a judgement call.

- [ ] Every evidence record names the artifact revision it was observed against
- [ ] A change marks exactly the affected verdicts stale, naming what invalidated them
- [ ] A stale required criterion blocks closure and shipment
- [ ] Re-running the same check clears the stale mark and records the new revision
- [ ] Derived knowledge is marked stale along with the verdict it rested on
## Gate

**After a change lands in a repository, every affected prior verdict is marked stale and names what
invalidated it; no surface still presents it as verified, and closing or shipping on stale evidence
fails closed.**

- [ ] Every evidence record carries the artifact revision it was observed against.
- [ ] A change marks exactly the affected verdicts stale — no more, and no fewer.
- [ ] A stale verdict names the change that invalidated it.
- [ ] A stale required criterion blocks closure and shipment, with the reason stated.
- [ ] Re-running the check clears the stale mark and records the new revision.
- [ ] Shared knowledge resting on a stale verdict is marked stale, not silently retained.
- [ ] Chat, CLI, REST, and web agree on the stale state of the same criterion.

Scored by a new suite; the closest existing oracles are [11](../eval/11-honest-done.md) (sabotage and
reopening at run time) and [23](../eval/23-shipment-gate.md) (shipment requires current evidence).

## Software scope and invariants

**This phase is the mechanism that keeps "verified" meaning something over time.** Without it, the
evidence contract holds only until the next commit, which makes every capability built on top of it
temporarily true.

**Language-agnostic.** The invalidation rule must not be derived from a language or toolchain. It is
derived from *which files a criterion's evidence depended on*, which the factory already knows per
criterion. A rule that assumes a manifest, a directory layout, or a test runner to compute the blast
radius breaks **F2**.

**Project-type-agnostic.** On brownfield and maintenance work the repository moves under the factory
constantly, so decay matters most exactly where the factory is least sure of itself. A greenfield
project that has not changed has nothing stale; a legacy repository does, and the phase must not
assume the quiet case.

**Architecture-agnostic.** Blast radius is per package, not per repository root, or a monorepo
invalidates everything on every change and the mark becomes noise the operator learns to ignore. This
depends on the package-scoped check that [03](03-quality-and-testing.md) records as an open gap.

**Repository isolation.** Staleness is computed from the project's own repository state. One project's
change may never invalidate, or fail to invalidate, another project's verdicts.

## Design rules

- [ ] Compute invalidation from observed dependencies, never from a timer or a heuristic.
- [ ] Prefer a precise blast radius over a safe one: an over-broad stale mark is a false alarm, and
      false alarms train the operator to ignore the true ones.
- [ ] Never delete an invalidated record. It becomes history with a reason, so the trail is auditable.
- [ ] A stale verdict is a *state*, not an error: it is visible, answerable, and recoverable.
- [ ] Re-verification reuses the original criterion's check, so the verdict is comparable.
- [ ] Do not let staleness block work that does not depend on the affected criterion.

## Work checklist

### Model and contracts

- [ ] Add the artifact revision to the evidence record, and to the schema in `packages/contracts`.
- [ ] Define the stale state and the transition rules on the evidence lifecycle.
- [ ] Define what "the artifact changed" means for a project whose revision is a hash, a revision,
      or a working tree with uncommitted changes.
- [ ] Record the dependency between a criterion and the paths its evidence touched.

### Behavior

- [ ] Invalidate on change, naming the change.
- [ ] Refuse closure and shipment on stale required evidence, with the reason stated.
- [ ] Clear the stale mark on a successful re-run, recording the new revision.
- [ ] Mark dependent shared knowledge stale with the verdict.
- [ ] Expose stale state identically on chat, CLI, REST, and web.
- [ ] Report staleness in the operator's summary rather than requiring a query.

### Quality

- [ ] Test invalidation precision: a change to one package leaves a sibling package's verdicts intact.
- [ ] Test the brownfield case: an unrelated commit does not invalidate an unrelated criterion.
- [ ] Test the recovery path: re-running the check clears the mark and records the revision.
- [ ] Test that a stale required criterion blocks shipment.

## Acceptance criteria

- [ ] A stranger can ask whether a verdict is still true and get an answer grounded in the repository.
- [ ] Changing an artifact marks the affected verdicts stale, and only those.
- [ ] No surface reports a stale verdict as verified.
- [ ] Closing or shipping on stale required evidence fails, and says why.
- [ ] The audit trail retains the invalidated record and the reason.
- [ ] Staleness never blocks work that does not depend on the affected criterion.

## Risks and open decisions

- [ ] **Blast radius accuracy is the whole problem.** Too broad and the mark becomes ignored noise;
      too narrow and stale evidence survives. Depends on per-package check scoping
      ([03](03-quality-and-testing.md)).
- [ ] **A long-lived project may carry many stale verdicts**, which could read as the factory having
      failed. The state must read as normal bookkeeping, not as a red board.
- [ ] **Uncommitted changes.** Evidence observed against a working tree that was never committed has
      no revision to compare. Decide whether that verdict is stale by definition or carries a
      provisional marker.
- [ ] **Interaction with [15](15-reversal-and-retraction.md).** Decay is time-driven and retraction is
      mistake-driven; both must be able to apply to the same verdict without double-reporting.
- [ ] **Cost of re-verification.** Re-earning a verdict runs real checks. The phase must not turn a
      single file change into a full re-run of the project.
