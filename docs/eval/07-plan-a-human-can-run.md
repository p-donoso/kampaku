# 07 — A plan a human can run

## Promise tested

The plan is something an external reviewer can understand and execute without the factory — ordered
steps, named owners, and check commands that run in **this** project.

## Why it elevates

Weak: one leaf called "build the app" with vague acceptance; check commands copied from a template and
not from the repository; a plan that could belong to any project.

Credible: a cold reader can follow it in five minutes, every check command exists in this project's
toolchain, and the plan states what it will not do.

## Prereqs

- Suite [06](06-greenfield-stranger-repo.md) green (a project exists to plan for), or a brownfield
  project from [19](19-brownfield-and-legacy.md).
- Do not require execution here: the focus is plan quality before or at the start of execution.

## Emperor prompts

1. `Plan the first vertical slice for this project: something a user or caller can use. Break it into steps a human could follow without you. Include the exact check commands for this project's toolchain, and the acceptance evidence for each step. Do not mark anything done. Wait for my go before execution.`
2. `Which check commands did you derive, and from what in the repository?`
3. `What is deliberately out of scope for this slice?`
4. Cold read: hand the plan to a second person (or yourself after a break) with a five-minute timer.

## Oracle

- The plan has multiple steps with stable ids, named owners, and statuses at `todo`.
- Every check command in the plan **runs in this project** at the current commit and produces a
  meaningful result. Commands that fail because they are not part of this project's toolchain are a
  failure of this suite.
- Each step states its acceptance evidence in a form that can be executed or inspected (F2).
- The plan states what is out of scope for the slice, with a reason.
- A cold reader can restate the goal, the steps, and how to verify each step, from the plan alone.
- Planning creates no jobs and marks nothing done.
- The plan does not restructure the project: no step moves files, renames packages, or changes the
  build system unless that is the requested work (F3/F4).
- Prompt 2 produces a traceable answer: for each derived command, the file or convention it came from.

## How to measure

- Execute every check command in the plan; record exit codes and output.
- Time the cold read; record whether the reader needed to ask a question.
- Snapshot work-item statuses and job counts before and after planning.
- Compare the plan's steps against the repository shape: does the plan respect the packages and
  boundaries that already exist?

## 10/10 checklist

Universal gates: **U1** · **U2** · **U3** · **U4** · **U5** · **U6** · **U7** · **U8**
Factory gates: **F1** · **F2** · **F3** · **F4** · **F5**

- [ ] U1 Empty instance
- [ ] U2 Public docs sufficient
- [ ] U3 Plan and statuses visible identically on chat, CLI, and web
- [ ] U4 Automated tests cited below are green
- [ ] U5 Fresh data-dir re-run after any fix
- [ ] U6 No silent budget failure hiding the oracle
- [ ] U7 Pass criteria stay product-level
- [ ] U8 No open blocking BOARD row for this suite
- [ ] F1 Deliverable is software
- [ ] F2 **Every check command runs in this project's toolchain**
- [ ] F3 Plan respects the existing package and module boundaries
- [ ] F4 No restructuring of an existing codebase
- [ ] F5 The slice names how it will be exercised by a stranger

### Suite-specific

- [ ] Multi-step plan with stable ids and owners
- [ ] Every check command executed and recorded
- [ ] Acceptance evidence is executable or inspectable
- [ ] Out-of-scope stated with reasons
- [ ] Cold read succeeded in five minutes
- [ ] Zero jobs, nothing marked done
- [ ] Prompt 2 traces each command to its source

### In-scope P-gates

- **P1** soft (nothing marked done) · **P6** required · **P8** if any step touches existing code

## Automated tests

| Test | Locks | Status |
|------|-------|--------|
| `apps/core/tests/eval/eval-plan-quality.test.ts` | Multi-step plan with owners and ids, statuses todo, out-of-scope recorded, zero jobs | **To author** |
| `apps/core/tests/eval/eval-plan-evidence-derivation.test.ts` | Plan check commands derived from the repository toolchain, not from a template | **To author** |
| `apps/core/tests/pm/phase-key-and-plan-hash.test.ts` | Plan preview/approval integrity | Exists; re-run and cite |

## Pass

- Binary: all oracle bullets hold.
- Score: **10** / 10.

## Run log

| Field | Value |
|-------|-------|
| Date | not run |
| Data dir | — |
| Git SHA | — |
| Model / provider | — |
| Wall clock | — |
| Cold reader | — |
| Tests | not run |

## Result

`not run` — awaiting execution.

## Evidence

None yet.

## Blocker

None known. [BOARD F-001](results/BOARD.md) is resolved (2026-09-23), so a container can be created
from chat.
