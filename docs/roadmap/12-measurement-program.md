# 12. Measurement program

- **Document:** `12 — Measurement program`
- **Kind:** `deliverable`
- **Status:** `In progress`
- **Owner:** eval lab
- **Dependencies:** [statute](../product/software-factory.md). **Nothing else:** the baseline needs a
  working endpoint, not a particular configuration contract, and an instance already has
  `KAMPAKU_MODEL_BASE_URL` / `KAMPAKU_MODEL_API_KEY` taking precedence over the legacy names
- **Related documents:** [statute](../product/software-factory.md), [eval lab](../eval/README.md),
  [eval 00 protocol](../eval/00-protocol.md),
  [capability probe protocol](../eval/capability-probe-protocol.md),
  [BOARD](../eval/results/BOARD.md), [this roadmap](README.md) § Order
- **Last reviewed:** 2026-09-24

## Purpose

The lab defines 25 suites, a score bar, universal gates, factory gates, a board, and a learnings file.
**No suite has ever been run.** Every one of the 25 run logs reads `Date | not run`.

That is the roadmap's central problem, and it is not a documentation problem. A roadmap whose every
gate is scored by suites, with none of those suites executed, can only be reorganized, not validated.
This phase exists so that "measured" has an owner — until now it had none, and the roadmap defaulted
to building capability instead.

The instrument is not broken; it is switched off. Switching it on is work, and it belongs to someone.

## Outcome

An operator can answer, from durable records alone:

- what the factory has actually been observed to do, per suite, with a score and cited evidence;
- which promises are **measured**, which are **locked by test only**, and which are **unmeasured**;
- which board row closes which failure, and which suite closes which row;
- where the roadmap is claiming more than the evidence supports.

The observable change is that the roadmap status tables are downstream of runs instead of upstream of
them.

## Scope

### In scope

- [ ] A baseline pass over suites 01–25, in battery order, each on a fresh data dir.
- [ ] A recorded score, run log, and cited evidence for every suite, or an explicit `not run` with
  the blocking reason.
- [ ] A board row for every failure, in product language, naming the suite that will close it.
- [ ] A reconciliation pass: every roadmap status, every unverified-capability row, and every
  "locked by test" claim is re-checked against what the baseline found.
- [ ] An honest distinction, carried into every status table, between measured, locked, and unmeasured.
- [ ] The lock inventory: which suite promises have an automated lock, and which do not.

### Out of scope

- [ ] Implementing capability to make a suite pass. A failure becomes a row; fixing it is that phase's work.
- [ ] Rewriting a suite's oracle to match observed behavior.
- [ ] An automated prompt runner (still a possible later addition; it does not replace per-suite tests).
- [ ] Weakening a gate, a universal gate, or a factory gate to raise a score.
- [ ] Running probes as a substitute for suites. Probes find where the bar is missing; suites score it.

## What exists now

**The baseline started 2026-09-24.** Suite 01 was run on a fresh instance against a real
OpenAI-compatible endpoint. It is the first measurement this program has ever taken, and its result is
recorded in the [baseline run record](../eval/baseline-20260924.md).

- **Suite 01 — run three times, binary fail.** Run 1 blocked at prompt 1. Run 2 reached intake and
  opened a container with no owner ([F-005](../eval/results/BOARD.md)) and read "container" as Docker
  ([F-029](../eval/results/BOARD.md)). Run 3 created the same container **with** a real owner and
  resolved the vocabulary correctly — F-005 and F-029 are closed live — and failed the inspection
  bullet a third time in a third shape ([F-024](../eval/results/BOARD.md)) plus a new "show me" row
  ([F-030](../eval/results/BOARD.md)).
- **Suites 02–25 — `not run`.** They depend on intake. Intake is demonstrated from chat and owned, so
  they are no longer blocked on the front door — only on suite 01's remaining bullets.
- Rows out of the three runs: F-024, F-025, F-026, F-027, F-029 and F-030 as blocking, plus F-028
  non-blocking.

The important part is what this establishes rather than what it fixed: the documented boot works, and
**the front door does not**. The suite every other suite depends on fails at its first prompt.

Five structural rules landed the same day, and their shape mattered: two are refusals in code and one
was declared in the tool's own schema, rather than all five being instructions the model is asked to
keep. Run 3 decided them: the owner requirement and the container vocabulary both hold and their rows
are closed, the prompt ordering holds, and the block's unowned-container rule was never exercised
because the rule upstream held first.

**And the run is what showed the limit of that approach.** The inspection bullet failed three times in
three shapes, the third one with the agent reading state and answering about something else. Clearer
wording was no longer a plausible fix, which is a finding about the method rather than about the
model: a rule that can be expressed as a contract gets enforced, and a rule that only says "answer this
well" does not.

The fourth attempt therefore aimed at the **input** instead of the instruction, and it was justified by
a measurement rather than by an argument. On the live run-3 instance the front office's own identity
was **11.5%** of its context while skill fragments were **68.2%**, and the largest removable block was
~10 KB of `workflow-*` fragments telling the reader to call `execute_work_item`, `report_blocker`,
`recall`, `propose_wiki_edit` and roughly forty more tools the front office does not hold. Effect:
**40 398 → 28 204 chars, −30.2%**. Whether it moves the bullet is **unmeasured**, and saying otherwise
would be the defect this document exists to catch. Run 4 decides; if it fails, the [baseline run
record](../eval/baseline-20260924.md) § Next lists the three shapes worth measuring next.

## Definition of done

Every box ticked closes this deliverable. Nothing here needs a judgement call.

- [ ] Each of suites 01–25 has a recorded outcome with a score and cited evidence, or `not run` with the reason
- [ ] Every failure has a board row naming the suite that closes it
- [ ] Every roadmap status is backed by a run, backed by a lock, or explicitly marked unmeasured
- [ ] The lock inventory states which promises have committed tests and which do not
## Gate

**Every suite has a recorded outcome, and the roadmap's claims match it.**

- [ ] Each of suites 01–25 has a run log with a date, a data dir, a git SHA, the surfaces used, and a score — or `not run` plus the reason it could not run.
- [ ] Every failure that blocks a promise has a board row naming the suite that closes it, and no such row is unowned.
- [ ] The board's *Unverified capabilities* table is consistent with the baseline: a capability is only listed as unverified if no run has decided it.
- [ ] Every roadmap status is either backed by a run, backed by a lock, or explicitly marked unmeasured.
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
- [ ] Re-check each roadmap status: measured, locked, or unmeasured.
- [ ] Update the lock inventory: which promises have committed tests, which do not.

### Honesty

- [ ] State limitations: model substitution, mixed commits, unrun beats, budget exhaustion.
- [ ] Report every score below 10 as a finding, not as partial credit.
- [ ] Do not soften a gate or an assertion to accommodate observed behavior.

## Acceptance criteria

- [ ] A stranger can read the board and the roadmap and tell measured from promised.
- [ ] No roadmap status is stronger than the evidence behind it.
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

## Delivery record

- **Implemented in:** started; see the baseline run record.
- **Tests:** none yet.
- **Evidence:** [baseline run record](../eval/baseline-20260924.md) — run parameters, environment
  facts, per-suite state, findings, and the operator-defect ledger.
- **Known limitations:** the battery is no longer unrun, and it is almost entirely unscored. Suite 01
  blocked at prompt 1, so 02–25 are behind it and every other score in the roadmap is still unbacked.
- **Follow-up:** [08](08-project-agent-roster.md), then [06](06-project-context.md) and
  [03](03-quality-and-testing.md), as the baseline's findings dictate.
