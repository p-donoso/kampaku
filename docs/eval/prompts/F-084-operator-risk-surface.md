# Kickoff — F-084, the risk gate the operator cannot read

Kampaku eval lab. **Gap 1 of the two between suite 08's measured 8/10 and 10/10.** You do the work; I do not.

Read first, in this order:

1. `docs/eval/results/BOARD.md` — row **F-084**, the measurement that opened it.
2. `docs/eval/08-hands-off-execution.md` § *What run `s08r7` still does not do*, first bullet — the miss in context.
3. `docs/eval/results/LEARNINGS.md` — the entry on a gate the operator cannot read.
4. `docs/eval/NEXT-SESSION.md` — how this lab's work is done: CLI is the canonical record, a row is closed by live
   measurement and never by argument, one reviewable commit per piece on `develop`, fix a blocker in the moment.
5. `docs/roadmap/14-operator-attention.md` — the roadmap item this belongs to.

## The gap, measured

Run `s08r7`, 2026-10-01, immediately after the first leaf closed:

```json
POST /api/v1/projects/textstats/play →
{"autoExecute":true,"gated":true,"gate":{"gated":true,"reason":"open_high_risk","detail":"1 high or critical risk(s) require disposition"}}
```

Nothing was queued. The refusal is right — the risk is real and was raised by the project's own lead. What is
missing is the surface: `node apps/core/dist/cli.js --help` has no `risks` command, `GET /api/v1/projects/<slug>/risks`
and `GET /api/v1/risks` are **404**, and the only writer of a risk is an agent tool. So the operator's only path is to
ask the front office in chat to have the risk disposed of, and the surface that reported the gate cannot say what it is
about.

## Where the pieces are

- **Gate:** `apps/core/src/application/pm/project-execution-gate.ts` — reason `open_high_risk`; it counts journal
  entries of kind `risk_reported` with `metadata.impact` high or critical and overlays `risk_updated` statuses.
- **Storage:** journal entries in `work_item_journal_entries` — kinds `risk_reported` and `risk_updated`. The **risk
  id is the `risk_reported` entry's own id**; a `risk_updated` entry carries `metadata.riskId` = that id and
  `metadata.status` ∈ `open | mitigated | accepted | escalated`.
- **Only writer today:** `apps/core/src/agents/runtime/tools/risks.ts` (`report_risk`, `update_risk`), agent-only.
- **Live specimen:** `.kampaku/runs/s08r7/data/kampaku.db`, entry `312bb31d-837d-4d27-bda6-1c9263ef6f8d`, project
  `4802c721-c981-4a93-858b-721c9716f17c`, impact `high`, status `open`. This is the risk that stopped `play`.

## Done means

- An operator can **read** an open risk — title, description, probability, impact, mitigation, review-at, status —
  on a documented surface beside the other operator commands.
- An operator can **discharge** it — mitigate, accept, or escalate with a concrete outcome, an acceptance stating who
  accepts the exposure and why, a mitigation stating what changed.
- The gate's `detail` names **which** risk stops play, not only how many.
- The path works end to end on the live instance, through whatever surface you document: a `kampaku risks` command,
  an API route, a web card, or more than one of those.

## Verification

Reuse the `s08r7` data dir or a copy of it — **do not start a fresh one**, the specimen lives there. Show, in
commands and output: `play` gated by `open_high_risk` → that risk read through the new surface → discharged → `play`
no longer gated by it. A row closed by argument does not count.

## Out of scope

- **F-085** — the front office reporting a succeeded job as having produced no check output. It is the other gap and
  gets its own session.
- Re-running suite 08 and the 10/10 verdict.

## Delivery

One reviewable commit on `develop`, conventional commit with a scope. Patch the three records with what was actually
measured: `docs/eval/results/BOARD.md` (F-084), `docs/eval/08-hands-off-execution.md`,
`docs/eval/results/LEARNINGS.md`. The tree may be dirty from earlier work — leave alone what you did not touch.

Report at the end: what changed and where, the transcript of the operator path, and what still stands between suite 08
and 10/10.
