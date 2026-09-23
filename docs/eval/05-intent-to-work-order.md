# 05 — Intent to work order

## Promise tested

A vague request produces clarification or a small options set **before** the board floods with
invented tracks — and a healthy instance does not generate phantom "missing foundation" work.

## Why it elevates

Weak: twenty work items appear from "make it better"; an empty instance produces imaginary CI, vision,
and repository setup; "start now" is treated as confirmed scope.

Credible: the factory asks what the emperor actually wants, or proposes exactly one coherent track and
waits.

## Prereqs

- Suites [01](01-work-order-intake.md)–[04](04-capability-boundary.md) green.
- Prefer an instance that already has a project and a team, so the phantom-foundation oracle applies.

## Emperor prompts

1. `Improve the project. Make it better. Start now.`
2. Only if asked a clear question: `Clarify first; do not create more than one proposal track until I confirm.`
3. Healthy-instance check: `What must I decide right now?`
4. Ambiguity check: `Make the thing we discussed work on mobile.` (deliberately under-specified: no
   platform, no target, no scope boundary)

## Oracle

- Within the first response cycle, the factory asks clarifying questions **or** presents a short
  options set, before creating a large work tree.
- The board does not explode with duplicate root tracks for the same vague intent.
- If work is created without confirmation, the suite fails unless the product shows the emperor
  approved an equivalent order earlier in this data dir (which does not apply on an empty-path run).
- Prompt 3 on a healthy instance does **not** invent missing foundation (no imaginary onboarding, no
  "your repository has no CI" when a CI workflow exists). It asks about next intent, or answers that
  nothing is blocking.
- Prompt 4 produces a question that names the concrete missing decisions (which platform, which
  surface, whether the current behavior changes), not a generic "please provide more detail".
- No jobs start from any prompt in this suite.
- Clarification never silently restaffs the project or changes its architecture.
- The clarification is a durable record where the product claims one: a question asked in this suite
  is visible in `questions list` and answerable, or the suite records that the clarification was
  prose-only as a finding.

## How to measure

- Count work items, jobs, and agents before and after each prompt (public CLI/UI).
- Capture the clarifying questions as shown to the emperor, including whether each names a concrete
  decision.
- Confirm no execution started without an approved plan.
- For prompt 3, list what the factory claims is missing and check each claim against disk.

## 10/10 checklist

Universal gates: **U1** · **U2** · **U3** · **U4** · **U5** · **U6** · **U7** · **U8**
Factory gates: **F1** · **F2** · **F3** · **F4** · **F5**

- [ ] U1 Empty instance
- [ ] U2 Public docs sufficient
- [ ] U3 Clarification visible on chat, CLI, and web where the product claims a durable question
- [ ] U4 Automated tests cited below are green
- [ ] U5 Fresh data-dir re-run after any fix
- [ ] U6 No silent budget failure hiding the oracle
- [ ] U7 Pass criteria stay product-level
- [ ] U8 No open blocking BOARD row for this suite
- [ ] F1 Oracle concerns a software deliverable
- [ ] F2 Clarification does not assume a stack
- [ ] F3 Clarification does not assume a repository shape
- [ ] F4 No existing convention silently changed
- [ ] F5 Shippability path named (not required until suite 23)

### Suite-specific

- [ ] Vague intent produced a question or a single proposal, not a flooded board
- [ ] No phantom foundation work on a healthy instance
- [ ] Under-specified request produced concrete named decisions
- [ ] Zero jobs started
- [ ] Clarification is durable if the product claims durable questions

### In-scope P-gates

- **P3** when the clarification is a durable question

## Automated tests

| Test | Locks | Status |
|------|-------|--------|
| `apps/core/tests/eval/eval-intent-clarify.test.ts` | Vague intent produces a structured clarify; no work-item flood; no phantom foundation | **To author** |
| `apps/core/tests/agents/pending-question.test.ts` | A clarification question reaches the durable store | Exists; re-run and cite |

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
| Tests | not run |

## Result

`not run` — awaiting execution.

## Evidence

None yet.

## Blocker

Inherits [BOARD F-001](results/BOARD.md) where a container is required.
