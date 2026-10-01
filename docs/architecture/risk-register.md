# Risk register

A project can be stopped by a **risk**: an exposure its own lead recorded with `report_risk` rather than
work around. This layer exists so that a stop the operator is subject to is a stop the operator can read and
answer.

The premise came from a measurement, not a design session. On suite 08 run `s08r7` (2026-10-01) the first
leaf closed, `play` refused with

```json
{"autoExecute":true,"gated":true,
 "gate":{"gated":true,"reason":"open_high_risk","detail":"1 high or critical risk(s) require disposition"}}
```

and queued nothing. The refusal was right — the risk was real, and the project's own lead had raised it
because all eight leaves were remapped to one seat, so the phase gate would have been self-signed. What was
wrong is that the sentence named no risk: `kampaku --help` had no `risks` command, both risks routes were
`404`, and the only writer of a risk was an agent tool. The operator's only path to the gate that stopped
them was to ask the front office, in chat, to have somebody else dispose of it. `BOARD F-084`.

## What a risk is, in storage

A risk has one representation: the operational journal (`work_item_journal_entries`), which is also what the
execution gate counts. There is no risks table and no second status column, so no read can disagree with the
gate.

| entry kind | meaning |
|---|---|
| `risk_reported` | **is** the risk. Its own `id` is the risk id. |
| `risk_updated` | a disposition. Carries `metadata.riskId` = the risk id and `metadata.status` ∈ `open \| mitigated \| accepted \| escalated`. |

`risk_reported` carries the readable record in its `body` (`Description:`, `Probability:`, `Impact:`,
`Mitigation:`, `Review at:`) and the machine-readable half in `metadata`. `parseRiskBody` reads both, so a
risk recorded by an older build still renders.

## What stops execution

`getProjectExecutionGate` (`application/pm/project-execution-gate.ts`) reports `open_high_risk` when a risk
is **open** with impact **high or critical**. The gate's `detail` names the blocking risks — title, id, and
impact — because a count is not a handle: an operator stopped by *"1 high or critical risk(s) require
disposition"* cannot act on it or look it up.

## Reading and discharging

Two surfaces, added together because a route nobody can reach is not a surface and a command with no route
cannot be scripted against a remote Core:

| surface | what it does |
|---|---|
| `GET /api/v1/risks` (`?project=<slug>`) | every risk, with its project slug |
| `GET /api/v1/projects/<slug>/risks` | one project's risks, blocking first, with a `blockers` count |
| `GET /api/v1/risks/<risk-id>` | one risk, by the id the gate's sentence carries |
| `POST /api/v1/risks/<risk-id>/disposition` | `{action: mitigate \| accept \| escalate, outcome, accepted_by?}` |
| `kampaku risks list [--project <slug>] [--open]` | the operator's list, blocking risks first |
| `kampaku risks show <risk-id>` | every field of one risk, plus its dispositions |
| `kampaku risks mitigate \| accept \| escalate <risk-id> --outcome <text>` | discharge it |

A disposition is a **journal entry**, not a status change: `GET /api/v1/projects/<slug>/journal?kinds=risk_reported,risk_updated`
shows the same write, and `mitigate` / `accept` / `escalate` mirror the agent tool's actions exactly.

Two rules are enforced in `disposeRisk` (`application/pm/risk-register.ts`), which is the single writer for
both surfaces — the operator's route and the `update_risk` tool — because two rules for the same act is how
one of them ends up weaker:

- **An outcome is required.** "Mitigated" with nothing after it is a status change with no fact behind it,
  and the gate would clear on a word.
- **An acceptance names who accepts the exposure.** `--accepted-by` defaults to `operator` — the emperor
  answering the gate in person, recorded as an actor — and the name is written into the journal entry's own
  body, so the durable record reads *"Accepted by Pablo: …"* rather than leaving an exposure assigned to
  nobody.

## Lock

`apps/core/tests/eval/eval-operator-risk-surface.test.ts` carries the row's clauses: the gate names the risk
its id and its title, the three read routes agree on the same fields, an acceptance names its actor and is
recorded as `risk_updated`, `play` continues into the next leaf afterwards, an empty disposition is refused
and changes nothing, and the agent tool writes through the same code.

## Related

- [Roadmap 14 — operator attention and decision load](../roadmap/14-operator-attention.md): the rule this
  satisfies, *a gate that cannot be answered is not a gate*.
- [Execution assurance](execution-assurance.md): the other half of the same question — what a claim has to
  carry before it counts.
- [Agent hierarchy](agent-hierarchy.md): how a lead records a risk and what it does with the answer.
