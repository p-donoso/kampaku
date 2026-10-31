# 12. Measurement program

- **Document:** `12 — Measurement program`
- **Kind:** `deliverable`
- **Related documents:** [statute](../product/software-factory.md), [eval lab](../eval/README.md),
  [eval 00 protocol](../eval/00-protocol.md),
  [capability probe protocol](../eval/capability-probe-protocol.md),
  [token economy](../concepts/token-economy.md),
  [BOARD](../eval/results/BOARD.md), [this roadmap](README.md)
- **Last reviewed:** 2026-10-30

## Purpose

The lab defines 25 suites, a score bar, universal gates, factory gates, a board, and a learnings file.
This program establishes a baseline, keeps the board aligned with measured gaps, and distinguishes
tested capability from unmeasured promises.

The [token economy](../concepts/token-economy.md) is one of the things this program has to make
measurable. Nothing records what a call cost or how long it took, so a turn that stops on its budget
cannot say what spent it (BOARD **F-060**), and the client's timeout and retry settings are documented,
defaulted, and read nowhere (**F-061**) — a knob that appears to work. Those are this deliverable's rows,
not a separate program.

## Outcome

An operator can answer, from durable records alone:

- what the factory has actually been observed to do, per suite, with a score and cited evidence;
- which promises are **measured**, which are **locked by test only**, and which are **unmeasured**;
- which board row closes which failure, and which suite closes which row;
- where the roadmap is claiming more than the evidence supports.

The observable change is that roadmap delivery state is reconciled against recorded suite evidence,
with active delivery tracking held in the linked GitHub Project.

## Scope

### In scope

- [ ] A baseline pass over suites 01–25, in battery order, each on a fresh data dir.
- [ ] A recorded score, run log, and cited evidence for every suite, or an explicit `not run` with
  the blocking reason.
- [ ] A board row for every failure, in product language, naming the suite that will close it.
- [ ] A reconciliation pass: roadmap capability claims, every unverified-capability row, and every
  "locked by test" claim is re-checked against what the baseline found.
- [ ] An honest distinction between measured, locked by test, and unmeasured capability claims.
- [ ] The lock inventory: which suite promises have an automated lock, and which do not.

### Out of scope

- [ ] Implementing capability to make a suite pass. A failure becomes a row; fixing it is that phase's work.
- [ ] Rewriting a suite's oracle to match observed behavior.
- [ ] An automated prompt runner (still a possible later addition; it does not replace per-suite tests).
- [ ] Weakening a gate, a universal gate, or a factory gate to raise a score.
- [ ] Running probes as a substitute for suites. Probes find where the bar is missing; suites score it.

## What exists now

The suite battery has 25 protocols. Suites 01–15 have dated historical snapshots in
[`eval/archive/`](../eval/archive/README.md); the current handoff is suite 16, and each suite protocol
remains the source for its current verdict and concise evidence. The [evaluation board](../eval/results/BOARD.md)
owns current product gaps. The [initial baseline record](../eval/archive/baseline-2026-09-24.md) preserves
the original run history and decisions; it is historical evidence, not a current status ledger.

Evaluation uses model-backed systems, so a single turn is one sample. Record repetitions when variance
could change the conclusion; do not generalize a product claim from a single unstable result. The
suite-specific protocol owns its sampling method and recorded evidence.

## Definition of done

Every box ticked closes this deliverable. Nothing here needs a judgement call.

- [ ] Each of suites 01–25 has a recorded outcome with a score and cited evidence, or `not run` with the reason
- [ ] Every failure has a board row naming the suite that closes it
- [ ] Every roadmap capability claim is backed by a run, backed by a lock, or explicitly marked unmeasured
- [ ] The lock inventory states which promises have committed tests and which do not
## Gate

**Every suite has a recorded outcome, and the roadmap's claims match it.**

- [ ] Each of suites 01–25 has a run log with a date, a data dir, a git SHA, the surfaces used, and a score — or `not run` plus the reason it could not run.
- [ ] Every failure that blocks a promise has a board row naming the suite that closes it, and no such row is unowned.
- [ ] The board's *Unverified capabilities* table is consistent with the baseline: a capability is only listed as unverified if no run has decided it.
- [ ] Every roadmap capability claim is either backed by a run, backed by a lock, or explicitly marked unmeasured.
- [ ] No suite is scored 10 without its cited automated tests green and its gates satisfied.

Scored by [eval 00 protocol](../eval/00-protocol.md) § Fresh re-run rule and
[eval README](../eval/README.md) § The bar. This phase is not "done" at any score level; it is done
when the record is complete and honest.

## Software scope and invariants

Measurement is what makes the three invariants more than slogans — an invariant with no oracle is a
slogan, and an oracle that was never executed is one too. So this phase is where the
[agnosticism invariants](../concepts/agnosticism-invariants.md) stop being prose:

- **Language-agnostic** is undecided until [18](../eval/18-language-agnostic.md) runs against a real
  non-Node and a real polyglot repository.
- **Project-type-agnostic** is undecided until [19](../eval/19-brownfield-and-legacy.md) and
  [21](../eval/21-maintenance-and-bugfix.md) run against code the factory did not write.
- **Architecture-agnostic** is undecided until [20](../eval/20-multi-repo-and-services.md) runs against
  a project that owns more than one repository.

Two constraints keep the measurement itself honest:

- **Every suite's scenario must be software**, and its oracle must require a technical artifact
  (gate **F1**). A scenario that could be satisfied by a document measures the wrong thing.
- **Evidence must come from the project's own toolchain** (gate **F2**). A suite that names a runner
  the scenario does not use is measuring the platform's habits, not the project.

## Design rules

- [ ] Prefer an existing suite over a new one; a new suite needs a promise no file owns.
- [ ] Never measure around a known-broken path. Record the failure at the path that is broken.
- [ ] Do not read the database to prove a pass; if that is necessary, it is itself a finding.
- [ ] Manual evidence alone caps a score at 9, and a docs-only fix without a test stays ≤ 9.
- [ ] A mid-run product fix marks the run `mixed-commit`; affected verdicts are re-run clean.
- [ ] Record an operator defect as a finding when the operator's own procedure was wrong.

## Work checklist

### Baseline

- [ ] Confirm the provider contract from [11](11-multi-provider-routing.md) § Part A holds.
- [ ] Run suites in order; do not start a suite whose dependency has an open blocking row.
- [ ] Record for each suite: date, data dir, git SHA, model/provider, wall clock, surfaces used, score.
- [ ] Capture the "could not run" reason verbatim when a suite cannot be completed.

### Reconciliation

- [ ] Update every suite's Run log, Result, Evidence, and score.
- [ ] Open or close board rows; state which suite closes each open row.
- [ ] Re-check the *Unverified capabilities* table against the baseline.
- [ ] Re-check roadmap capability claims: measured, locked, or unmeasured.
- [ ] Update the lock inventory: which promises have committed tests, which do not.

### Honesty

- [ ] State limitations: model substitution, mixed commits, unrun beats, budget exhaustion.
- [ ] Report every score below 10 as a finding, not as partial credit.
- [ ] Do not soften a gate or an assertion to accommodate observed behavior.

## Acceptance criteria

- [ ] A stranger can read the board and the roadmap and tell measured from promised.
- [ ] No roadmap capability claim is stronger than the evidence behind it.
- [ ] Every suite has an outcome or a recorded reason it has none.
- [ ] The battery's own rules are applied to the battery: 10 requires tests and gates.
- [ ] Remaining gaps are reported, including gaps this phase did not cause.

## Risks and open decisions

- [ ] **A provider may be unavailable for part of the baseline**, leaving suites 17 and 25 unrun and
  everything that depends on a live model marked `not run`. That is a recorded outcome, not a failure
  of this phase.
- [ ] **The battery may score far below the bar**, which is the expected result and the point. The
  risk is presenting it as a setback rather than as the first real information the program has had.
- [ ] **Score churn.** Re-running after every fix is expensive; the fresh-re-run rule applies to the
  affected suites, and the incremental-regression rule keeps earlier green suites honest.
- [ ] **Two worker tests time out on a loaded host** ([F-020](../eval/results/BOARD.md)). Baseline
  runs must be single, not parallel, or the measurement manufactures its own failure.
