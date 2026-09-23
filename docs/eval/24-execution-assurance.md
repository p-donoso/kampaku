# 24 — Execution assurance

## Promise tested

Work reaches a truthful outcome only when requirements, scope decisions, blockers, and verification
evidence are represented in generic, inspectable records — and those records are independent of
language, toolchain, model provider, and project type.

## Why it elevates

Weak: closure is a status change; a requirement disappears from the plan with no record; a blocker is
"resolved" by requeueing while another job is still running; evidence is a free-text claim.

Credible: every closure is backed by criterion-referenced evidence, every omission has a recorded
reason, and the machinery is capability-shaped rather than domain-shaped.

This suite is the inspection station's own oracle, and it is the one suite that must hold under
*every* scenario in the battery.

## Prereqs

- Suite [11](11-honest-done.md) green.
- At least one project with completed, partial, and blocked work items.

## Beats (driven mostly through the API and CLI, not chat)

1. **Closure without evidence**: attempt to close a work item whose required checks have no evidence.
2. **Closure with failed evidence**: attempt to close with an evidence record marked failed.
3. **Unreferenced evidence**: attempt to close with evidence that names no criterion.
4. **Omitted requirement**: submit a plan that leaves an objective requirement uncovered with no scope
   decision.
5. **Deferred scope without a reason**: defer a requirement with no rationale.
6. **Blocker requeue while active**: resolve a blocker while another job for the same item is active.
7. **Unavailable recipient**: triage a blocker toward a recipient that cannot act, and confirm it is not
   silently treated as resolved.
8. **Capability independence**: run the same verification kinds against two different projects in
   different languages and confirm the evidence records use the same capability and subject types.

## Oracle

- Closures 1–3 are **rejected**, with the reason naming what is missing (required check, failed
  evidence, criterion reference).
- A plan with an uncovered critical requirement is rejected before approval, or the omission is
  recorded as an explicit scope decision with a reason.
- Deferral without a reason is rejected.
- A blocker cannot be requeued while another active job exists for the same item; the attempt is
  refused with an explanation.
- An unavailable recipient cannot silently resolve a blocker or restart work; the blocker remains open
  or escalates.
- Evidence uses `subjectType` / `format` / `verificationMethod` values that are independent of the
  project's language and of the model provider. The same criterion shape produces the same record
  shape in a Python project and a Rust project.
- Attempt history is append-only: a retry adds an attempt, it does not overwrite one.
- Every rejection is reachable from the public API, not only from an internal call.

## How to measure

- Attempt each rejection through the public route and record the response.
- Read the evidence records for two different-language projects and compare their field sets.
- Confirm the attempt history grows rather than mutates.
- Confirm no rejection is implemented only in a prompt (test by calling the route directly).

## 10/10 checklist

Universal gates: **U1** · **U2** · **U3** · **U4** · **U5** · **U6** · **U7** · **U8**
Factory gates: **F1** · **F2** · **F3** · **F4** · **F5**

- [ ] U1 Empty instance
- [ ] U2 Public docs sufficient
- [ ] U3 Rejections and evidence records agree on chat, CLI, and web
- [ ] U4 Automated tests cited below are green
- [ ] U5 Fresh data-dir re-run after any fix
- [ ] U6 No silent budget failure hiding the oracle
- [ ] U7 Pass criteria stay product-level
- [ ] U8 No open blocking BOARD row for this suite
- [ ] F1 Records concern software artifacts
- [ ] F2 Capability and subject types are toolchain-independent, verified across two languages
- [ ] F3 Evidence targets the artifact that exists, not an assumed shape
- [ ] F4 No existing evidence record overwritten
- [ ] F5 N/A

### Suite-specific

- [ ] All three closure defects rejected with a specific reason
- [ ] Omitted requirement blocked or recorded with a reason
- [ ] Deferral without a reason rejected
- [ ] Blocker requeue refused while a job is active
- [ ] Unavailable recipient cannot resolve
- [ ] Capability independence verified across two languages
- [ ] Attempt history append-only

### In-scope P-gates

- **P1** required

## Automated tests

| Test | Locks | Status |
|------|-------|--------|
| `apps/core/tests/eval/eval-execution-assurance.test.ts` | Generic quality gates, objective coverage, scope changes, blocker recovery, verification adapters, evidence-kind validation | Exists; extend with cuts 1–3 and 8 |
| `apps/core/tests/pm/blocker-triage.test.ts` | Durable blocker triage never substitutes an unavailable recipient for a real resolution | Exists; re-run and cite |
| Attempt-history and traceability tests | Append-only attempts with ids and output hashes | Exist; re-run and cite |

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
| Languages compared | — |
| Tests | not run |

## Result

`not run` — awaiting execution.

## Evidence

None yet.

## Blocker

None beyond prior suites.
