# 12. Measurement program

- **Document:** `12 — Measurement program`
- **Kind:** `deliverable`
- **Related documents:** [statute](../product/software-factory.md), [eval lab](../eval/README.md),
  [eval 00 protocol](../eval/00-protocol.md),
  [capability probe protocol](../eval/capability-probe-protocol.md),
  [token economy](../concepts/token-economy.md),
  [BOARD](../eval/results/BOARD.md), [this roadmap](README.md)
- **Last reviewed:** 2026-09-28

## Purpose

The lab defines 25 suites, a score bar, universal gates, factory gates, a board, and a learnings file.
Suites 01–15 have execution records; suite 16 is the active handoff. The current run status and
evidence live in the individual suite records and the [evaluation board](../eval/results/BOARD.md).
The complete 01–25 baseline remains open until every suite has a recorded outcome or an explicit
blocking reason. This deliverable governs measurement and reconciliation; it does not duplicate
run-by-run status.

The [token economy](../concepts/token-economy.md) is one of the things this program has to make
measurable. Nothing records what a call cost or how long it took, so a turn that stops on its budget
cannot say what spent it (BOARD **F-060**), and the client's timeout and retry settings are documented,
defaulted, and read nowhere (**F-061**) — a knob that appears to work. Those are this deliverable's rows,
not a separate program.

The instrument is not broken; it is switched off. Switching it on is work, and it belongs to someone.

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
recorded in the [baseline run record](../eval/archive/baseline-2026-09-24.md).

- **Suite 01 — run seven times. Runs 1–6 are an invalid record; run 7 passes.**
  Runs 1–6 were all taken through a local Ollama serving `-c 4096 --context-shift` against a system
  prompt of **4 086 tokens**, so the front of every prompt was discarded and the reply scored anyway
  ([F-032](../eval/results/BOARD.md)). That is not a hard test, it is an impossible one, so those runs
  measure an environment rather than the product, and the "four shapes in five runs" history should be
  read that way. **Run 7** was taken against the production endpoint — FreeLLMAPI with `auto:escalera` —
  and passes at the binary level: all four prompts answered their question, F-024, F-030 and F-027 close.
  **Suite 01 is now GREEN at 10/10**: the two locks the suite named are authored and running, which moved
  U4 from fail to pass and put the web UI and the CLI on the record for the first time (U3).
- **Suites 02 and 03 — run, locks authored and green.** Both are `partially met`, and for the same
  reason: **the web UI has not been driven in any run of this record**, so U3 is partial in both. Suite
  03's crux — the roster differs between a non-application and an application project — **holds.**
  Between them the two runs produced F-033 through F-041, every one found by measuring rather than by
  reading the code.
- **Suites 04–25 — `not run`, and unblocked.** Suite 01 is green, so the battery proceeds to
  [02](../eval/02-three-surfaces.md). Its first blocker is already measured before the run: F-034, the
  repository path missing from both surfaces an operator reads.
- **A lesson about missing locks.** Suite 01's two *to author* tests were the reason its score sat at 9
  for six runs, and authoring them **found three new rows** (F-034, F-035, F-036) that no run had
  surfaced. A missing lock is not neutral: it is a place where nothing asserts the field is present, and
  the rows behind it stay invisible. That is F-019's argument with evidence behind it now.
- Rows out of the runs: F-024, F-025, F-026, F-027, F-029, F-030, F-031, F-032 and F-033.

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
**40 398 → 28 204 chars, −30.2%**, locked in `orchestrator-skill-scope.test.ts`.

**Then run 4 refuted it.** Prompt 1 called the same three tools and produced the same skill-catalog
answer with 30.2% less context, and prompt 2 was unchanged. The fix is kept — it is right on its own
terms, and prompt 4 moved from calling no tool to calling `get_project` — but it bought nothing on the
bullet it was built for.

That is the measurement program working, and it is worth naming as such: a plausible, documented,
unit-locked change was proposed, shipped, measured, and **rejected on the evidence** inside one session.
No score moved, and the roadmap is more accurate than it was, because "the context was too big" is now
a refuted hypothesis instead of the next thing to try. The successor work is not a fifth prompt: it is
the pre-armed read flows in § Next of the [baseline run record](../eval/archive/baseline-2026-09-24.md), owned by
[04](../roadmap/04-capability-program.md) and mechanised by [10](../roadmap/10-context-minimization.md).

## The measurement is one sample, and that is now a finding

Run 5 produced a result that re-frames this whole program, and it belongs here rather than in a suite.
Prompt 1 of suite 01, on the same prompt and effectively the same code, has behaved like this:

| Run | Prompt 1 |
|-----|---------|
| 1 | `tools: none` |
| 2 | 4 tools |
| 3 | 3 tools |
| 4 | 3 tools |
| 5 | **`tools: none`** |

Runs 4 and 5 differ only by a change to `get_project`, which prompt 1 does not touch, and prompt 1 moved
from three tool calls to none. The endpoint is a sampling model. So **the run-to-run variance is at least
as large as the effects this battery has been attributing**, and every per-run conclusion in the record —
including the refutation of the context fix in run 4 — is a statement about **one sample**.

What survives that caveat, and what does not:

| Claim | Status |
|-------|--------|
| Suite 01 has never passed | **Safe.** Five runs, nothing green |
| Intake opens from chat with an accountable owner | **Safe.** Reproduced in runs 3, 4 and 5 |
| A bad lead is refused with no orphan persisted | **Safe.** Observed in run 5 |
| "The context fix did nothing" | **One sample.** Refuted for that turn, not for the change |
| "Run 5's failure is worse than run 4's" | **One sample.** The shapes differ; the direction is not established |
| The cause of the inspection failure | **Still unknown**, and this is why |

**The next work on the measurement itself is repetition.** A bullet whose outcome flips on sampling noise
cannot be scored by a single turn, so a suite run should take each prompt **N times** and record the
distribution, the way the endpoint is a distribution and not a function. That is a change to the protocol
in [00-protocol.md](../eval/00-protocol.md), and it belongs ahead of the next product attempt, because
the alternative is more rounds of guessing from single samples.

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
- **Evidence:** [baseline run record](../eval/archive/baseline-2026-09-24.md) — run parameters, environment
  facts, per-suite state, findings, and the operator-defect ledger.
- **Known limitations:** the battery is no longer unrun, and it is almost entirely unscored. Suite 01
  blocked at prompt 1, so 02–25 are behind it and every other score in the roadmap is still unbacked.
- **Follow-up:** [08](08-project-agent-roster.md), then [06](06-project-context.md) and
  [03](03-quality-and-testing.md), as the baseline's findings dictate.
