# Capability probe protocol

A **capability probe** is the lab's other instrument. Where a suite asks *does it meet this stated
bar*, a probe asks: **given a genuinely hard product goal, where does the factory break, and what
capability is missing at each break?**

This protocol supports exploratory runs that identify gaps such as the front-office contradiction
now tracked as [BOARD F-001](results/BOARD.md). Probes are how the suite battery learns what to
measure next.

## When to run a probe instead of a suite

| Situation | Instrument |
|-----------|-----------|
| The bar for a behavior is stated and known | Suite |
| The behavior is promised but the failure modes are unknown | Probe |
| A whole product arc must be attempted end to end under realistic pressure | Probe, then a suite for anything that proves durable |
| Something is suspected broken on a path no suite covers | Probe |

A probe is exploratory and unbounded; a suite is fixed and comparable. A finding that survives a
probe should become a suite, a BOARD row, or a roadmap phase — never remain only in a run record.

## Roles

| Actor | Does | Does not |
|-------|------|----------|
| **Emperor** | Sets intent, answers design questions, owns the decision to continue | Work the arc |
| **Operator** | Raises the factory, drives the prompt loop, verifies independently, records findings, fixes the platform when a gap blocks the arc | Build the deliverable; patch the deliverable to flatter the product; weaken an existing test |
| **Kampaku** | Plans, staffs, delegates, executes, verifies, reports | — |

**The deliverable belongs to the factory.** If the deliverable is broken, that is a product finding,
not something the operator repairs. The only permitted writes outside the platform are deliberate,
recorded, reverted sabotage probes, and the operator's own oracle scripts, which live outside both
repositories.

## Structure of a probe record

The run record is a **live document**: it is updated every turn, and it is the canonical record of
the run, not private notes.

1. **The question** — the capability under test in one paragraph, plus the secondary questions.
2. **Roles and rules** — who does what, and the explicit prohibitions.
3. **Run parameters** — date, git SHA, fresh data dir, oracle directory, model/planner/executor,
   canonical surface, human-gate surface, prompt language, run variables and frozen mode.
4. **Environment facts established before the run** — verified, not assumed, each with the command
   that verified it.
5. **Target product contract** — the acceptance oracle, as goals (`G1`, `G2`, …). Keep it
   product-level: the deliverable's *design* belongs to the factory and the emperor.
6. **The arc** — the beats, each with a verbatim emperor prompt and the oracle after that beat.
7. **Probe axes** — capability hypotheses (`H1`, `H2`, …), each with what "handled well" looks like
   and how it is verified.
8. **Instrumentation** — the exact commands the operator runs to verify independently.
9. **Loop protocol** — the per-turn procedure.
10. **Pause / continue protocol** — the pause kinds and what must survive each.
11. **Turn log** — prompt, expected, observed, verdict, gap, per turn.
12. **Gaps and fixes ledger** — the deliverables of the probe.
13. **Findings summary** — what the factory cannot do yet, in product language.
14. **Open questions for the emperor** — including the operator's own defects.

## Verification rules

1. **The chat reply is never evidence.** State comes from the CLI, the disk, the deliverable's own
   commands, round-trips, and `git status` on both trees.
2. **Structural validity is not correctness.** A file that exists, an HTTP 200, a valid header, and a
   nonzero byte count have already been measured to pass on meaningless output three separate ways.
   A probe must include at least one **round-trip** verification where the artifact's content matters.
3. **Check the store, not the reply.** Several of the highest-value gaps were found by asking whether
   the durable record contained what the reply claimed and the protocol required.
4. **Prefer the operator's own instrument** over the product's self-report, especially for time,
   duration, exit codes, and completeness.

## Gap and fix ledger

The actual deliverable of a probe. One record per missing capability:

```text
G-nn  <one-line capability name>            [axis Hx]  [blocking? y/n]
Symptom:    what the emperor saw
Evidence:   exact command + output path
Root cause: prompt | missing capability | model quality | worker tool | product policy
Impact:     what work cannot be completed or verified
Fix:        F-nn  (commit <sha>, test <path>)  |  proposed only
Generalizes: which roadmap phase or BOARD row this belongs to
```

Rules for the ledger:

- **Record before fixing.** The gap is written down before the fix is attempted.
- **Blocking gaps may be fixed in place.** Fix the platform only, never the deliverable. Never weaken
  an existing test. Add a test that fails without the fix.
- **Non-blocking gaps are recorded with a proposal, not a patch.**
- **The operator's own defects go in the ledger too.** A wrong fix, a wrong measurement, or a wrong
  run parameter is a finding, not an omission.
- **A fix that changes core runtime behavior marks the arc `mixed-commit`**, and the affected beats
  are re-run clean on a fresh data dir before their verdicts count.
- **Every fix lands in the product's own records**: the improvement plan, the relevant doc, and the
  board or a suite, in the same change set.

## A probe is finished when

- Every axis is scored `confirmed gap` / `partial` / `handled well` with evidence.
- Every gap is either fixed with a test, proposed with a rationale, or explicitly deferred.
- Every finding has a disposition: a suite, a roadmap phase, or a board row
  row. Nothing lives only in the run record.
- The run record states the run's own limitations — model substitution, mixed commits, frozen mode,
  unrun beats, and anything the operator could not verify.

## Promoting a finding

| Finding shape | Promotion |
|---------------|-----------|
| A single promise, stated and stable | New or extended **suite** with an automated lock |
| A whole category of missing capability | **Roadmap phase** with acceptance criteria, then suites |
| A blocking defect in a promised path | **BOARD row** plus an **ADR** if it changes a decision |
| A methodology lesson (how to measure) | This protocol, or [00-protocol.md](00-protocol.md) |
| A moved goalpost in the product's own contract | **ADR** superseding the earlier one, never a silent doc edit |

## Related

- [00-protocol.md](00-protocol.md) — empty-instance rules a probe's suite promotions inherit
- [README.md](README.md) — the bar and the gates
