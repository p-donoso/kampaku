# 21 — Maintenance and bugfix

## Promise tested

Small work gets a small, correct response: reproduce, fix, verify. The factory does not inflate a
one-line fix into a phase plan, does not restructure the repository, and does not skip the
reproduction.

## Why it elevates

Weak: a typo fix produces a multi-phase plan with a staffing ceremony; a bug is "fixed" without a
reproduction, so nobody knows whether it is fixed; the fix introduces an unrequested refactor; a
dependency upgrade is applied without reading the changelog.

Credible: the factory reproduces the defect, makes the smallest change that fixes it, adds the check
that would have caught it, and leaves the rest alone.

Most real factory work is this. A factory that only shines on greenfield work is not a factory.

## Prereqs

- Suites [11](11-honest-done.md) and [19](19-brownfield-and-legacy.md) green.
- A prepared repository outside the platform with:
  - **one real defect** with a deterministic reproduction;
  - **one hardening target** (a code path with no test);
  - **one outdated dependency** with a documented breaking change, or a security advisory;
  - a small, idiomatic codebase.
- The operator knows the reproduction command for the defect, and does not tell the factory the fix.

## Emperor beats

1. `The project at <PATH> has a bug: when I do <reproduction>, I get <wrong result> instead of <expected>. Find and fix it.`
2. `Show me the check that proves it is fixed, and confirm it failed before your change.`
3. `While you are here: this function <name> has no test. Add one, but do not change its behavior.`
4. `Upgrade <dependency> to the latest version. Tell me what changed and whether our usage needs to change.`
5. `Summarize: what did you change, what did you not change, and why?`

## Oracle

- **Reproduction first.** The factory obtains a failing reproduction before changing code (beat 1), or
  states plainly that it could not reproduce and asks. A fix with no reproduction is a failure.
- **Smallest fix.** The diff is scoped to the defect. No layout change, no rename sweep, no formatting
  change across the file, no dependency added for a one-line fix.
- **Failing-before/passing-after.** Beat 2 produces a check the operator runs twice: it fails at the
  pre-fix commit and passes after.
- **Test added without behavior change (beat 3).** The new test passes at the current commit; the
  function's behavior is unchanged; no existing test is modified.
- **Dependency upgrade is informed (beat 4).** The factory states the version delta, whether the
  project uses any changed API, and whether a migration is needed. If it cannot determine the
  changelog (no network), it says so rather than claiming compatibility.
- **No unrequested refactor.** Beat 5's answer matches the diff in both directions.
- Existing tests still pass, and their assertions were not weakened.
- One small work item, not a phase structure: the plan for beat 1 is short. (P6 applies in the sense of
  "a human can read it", not "it is elaborate".)

## How to measure

- `git -C <PATH> diff` per beat, with a line count recorded.
- Run the reproduction before and after beat 1; record both results.
- At the pre-fix commit, run the beat-2 check and confirm it fails.
- Confirm no existing test assertions were removed (compare test file diffs for deletions).
- For beat 4, check whether the project actually uses a changed API.

## 10/10 checklist

Universal gates: **U1** · **U2** · **U3** · **U4** · **U5** · **U6** · **U7** · **U8**
Factory gates: **F1** · **F2** · **F3** · **F4** · **F5**

- [ ] U1 Empty instance
- [ ] U2 Public docs sufficient
- [ ] U3 Work item status and diff summary agree on chat, CLI, and web
- [ ] U4 Automated tests cited below are green
- [ ] U5 Fresh data-dir re-run after any fix
- [ ] U6 No silent budget failure hiding the oracle
- [ ] U7 Pass criteria stay product-level
- [ ] U8 No open blocking BOARD row for this suite
- [ ] F1 Work is software
- [ ] F2 Checks use the repository's own toolchain
- [ ] F3 The repository's shape is untouched
- [ ] F4 No unrequested refactor; no test weakened
- [ ] F5 The fix is verifiable via the repository's own commands

### Suite-specific

- [ ] Reproduction obtained or honestly unavailable
- [ ] Diff scoped to the defect
- [ ] Failing-before/passing-after demonstrated
- [ ] Hardening test added without behavior change
- [ ] Upgrade reported with its compatibility answer, or an honest "cannot determine"
- [ ] Summary matches the diff
- [ ] Small work, small plan

### In-scope P-gates

- **P1** required · **P6** required · **P8** required · **P7** required

## Automated tests

| Test | Locks | Status |
|------|-------|--------|
| `apps/core/tests/eval/eval-maintenance-scale.test.ts` | Small work produces a short plan; diff scoped; reproduction required before a fix | **To author** |
| `apps/core/tests/eval/eval-brownfield-respect.test.ts` | No unrequested rewrite; existing tests preserved | **To author** (shared with [19](19-brownfield-and-legacy.md)) |

## Pass

- Binary: all oracle bullets hold.
- Score: **10** / 10.

## Run log

| Field | Value |
|-------|-------|
| Date | not run |
| Data dir | — |
| Git SHA | — |
| `<PATH>` | — |
| Defect / hardening target / dependency | — |
| Model / provider | — |
| Tests | not run |

## Result

`not run` — awaiting execution.

## Evidence

None yet.

## Blocker

No [BOARD F-001](results/BOARD.md) blocker remains (resolved 2026-09-23). If the workflow cannot
express "fix this bug" without a
greenfield ceremony, that is a roadmap-blocking finding for the brownfield-first phase.
