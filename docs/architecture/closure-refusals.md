# Closure refusals

A work item that reads `blocked` is a **stop**. This layer exists so that a stop the operator is subject to
is a stop the operator can read and discharge — the same requirement [the risk register](risk-register.md)
meets one layer out, applied to the gate that decides whether a leaf is *done*.

The premise is a measurement. On suite 08's re-run `s08r9` (2026-10-01) the leaf *"Document the CLI in
README.md"* ran **twice**, both jobs `succeeded`, `checkResults {lint: true, test: true}`, three evidence
records, a completion report in its journal, and both of its manual-evidence gates answered by the operator
through the web UI — and it still read `blocked`. The only surface that mentioned it answered:

```json
{"gate": {"reason": "blocked_task", "detail": "Document the CLI in README.md"},
 "nextStep": {"blockedReason": "Task is blocked by an error, pending question, or blocker."}}
```

while `GET /api/v1/questions?status=pending` returned **0** and `GET /api/v1/blockers` returned **`[]`**.
Three possible causes, every one of them absent, no field, no rule and no command in reach, and
`kampaku projects step` re-ran the leaf and changed nothing. `BOARD F-088`.

## What a refusal is, in storage

A refusal has one representation: the operational journal, which is what the surface reads.

| entry kind | meaning |
|---|---|
| `closure_refused` | one refusal: `metadata.code`, `metadata.field`, `metadata.rule` (the rule's own sentence), `metadata.workItemId`, `metadata.criterionIds`, `metadata.clearWith`. |

The **newest** `closure_refused` entry for a work item is the refusal that stands. `readLatestClosureRefusal`
(`application/pm/closure-refusal.ts`) is the only reader, so the gate, the CLI and the route cannot disagree.

## The codes and the fields

`shouldBlockDishonestSuccess` (`application/pm/done-honesty.ts`) owns the closure rules; each one now returns
a `ClosureBlock` — the rule's sentence plus **which rule fired** and **what about the work item it read**:

| code | field | what it means | how it is cleared |
|---|---|---|---|
| `peer_review_required` | `peerReview` | sensitive work needs an approved review | `kampaku projects closure <id> --peer --accept --by <who> --notes <why>` |
| `criteria_without_evidence` | `acceptanceCriteria` | a criterion has no evidence and no decision | `kampaku projects closure <id> --criterion <ac-N> --accept --by <who> --notes <what>` |
| `criteria_evidence_insufficient` | `acceptanceCriteria` | evidence exists and does not prove the criterion | as above |
| `manual_review_pending` | `acceptanceCriteria` | a review is open and unanswered | as above (or answer the question card) |
| `manual_review_rejected` | `acceptanceCriteria` | the emperor decided **not met** — a decision, not a gap | a new decision, once the work changed |
| `checks_not_run` / `checks_failed` | `checks` | the repository's own check did not run, or failed | `kampaku projects retry <id>`, after fixing the artifact |
| `evidence_failed` / `evidence_unreferenced` | `evidence` | the job's structured evidence failed, or is unverified/unreferenced | `kampaku projects retry <id>` |
| `closure_without_checks` | `job` | the job stalled or hit its iteration limit with nothing to show | `kampaku projects retry <id>` |
| `reporting_incomplete` | `reporting` | sensitive work's journal/memory/wiki reporting is missing | finish the reporting, then re-decide |
| `phase_audit_missing` | `phaseAudit` | the phase gate has no honest audit artifact | `kampaku projects retry <id>` |
| `job_not_settled` | `job` | no succeeded job of this item has a result to decide against | `kampaku projects retry <id>` |

`clearWithFor` builds the command, so the sentence a surface renders always carries a runnable one.

## Reading and discharging

Two surfaces, added together because a route nobody can reach is not a surface and a command with no route
cannot be scripted against a remote Core:

| surface | what it does |
|---|---|
| `GET /api/v1/projects/<slug>/execution` | the gate; for `blocked_task` it carries `gate.blocked` — the refusal, with the rule and the command — and `nextStep.blockedReason` names the field, the code and the command |
| `GET /api/v1/projects/<slug>/blocked` | every blocked work item of a project, each with its own sentence |
| `POST /api/v1/work-items/<id>/closure` | `{decision: decide \| peer_review \| criterion, criterion_id?, outcome?, by?, notes?}` |
| `kampaku projects blocked <slug-or-id>` | the operator's list |
| `kampaku projects closure <id>` | re-decide against the job already on record. **No job is spent.** |
| `kampaku projects closure <id> --peer --accept --by <who> --notes <why>` | record the review the rule asked for |
| `kampaku projects closure <id> --criterion <ac-N> --accept --by <who> --notes <what>` | decide one criterion |
| `kampaku projects retry <id>` | re-run the job, for refusals about the artifact |

Three properties are deliberate, and each is a way this could have been a status field instead of a gate:

1. **No surface closes an item by declaring it closed.** Every shape ends by re-running the closure decision,
   so a refusal that still stands stands, in its own words. An operator's acceptance of a criterion cannot
   overrule a failed check — `checks_failed` is decided before the criterion gate and is not a human decision.
2. **A decision has an author and a substance.** `--by` and `--notes` are required for `--peer` and
   `--criterion`; an answer with neither is refused before anything is written. This is the rule
   `disposeRisk` enforces for a risk, applied to a closure.
3. **One path for a criterion decision.** `kampaku projects closure --criterion` answers the *question* the
   product raised (`openManualEvidenceGateForCriterion`), through `applyAnsweredManualEvidence` — the same
   code the web card and `kampaku questions answer` use. Recording a review directly would leave an open
   question behind, and the project would go on reporting `pending_questions` for a gate that had been
   decided. That was measured while building this.

## The rule that fired on the measured specimen, and why it no longer does

The refusal that stopped `s08r9` was `peer_review_required`, and it fired because `requiresPeerReview`
matched its sensitive vocabulary against title, description and criteria concatenated — so the word
`architecture` **inside the path** `docs/architecture/`, in the clause *"do not invent `requirements/` or
`docs/architecture/` directories"*, made a leaf about README.md "sensitive work". Of the project's five
leaves it was the only one flagged, and the only one that did not close.

The rule now reads **the title and the acceptance criteria whole** and **the description with path-like
tokens blanked**, because a description is where a plan says what it depends on and what it must not create.
A criterion naming `docs/architecture/cli.md` as its deliverable still requires a review — the `s08r3` lock
in `tests/eval/eval-hands-off-execution.test.ts`, unchanged — and a prohibition naming a path does not.
