# 00. Roadmap document template

Copy this file when adding a roadmap document. Keep the document in English and use checkboxes for
work that can be verified. Replace every placeholder before treating the document as ready.

## The two kinds

Every document is one of two kinds, and the kind decides whether it can close.

| Kind | What it is | Status vocabulary | Closes? |
|------|------------|-------------------|---------|
| `rule` | A standing rule the factory must always obey: a charter, a policy, or the ordering. There is no end state — the question is how far behaviour matches it | `Declared` · `Partly enforced` · `Enforced` | **No.** A rule is never "done" |
| `deliverable` | A finite body of work with an observable end state | `Proposed` · `Ready` · `In progress` · `Blocked` · **`Closed`** | **Yes**, when its definition of done is fully ticked |

A deliverable is the unit of progress. A rule is the standard the deliverable is measured against.
Confusing the two produces the two failure modes this split exists to prevent: a rule marked
"complete" (a lie about a standing standard) and a deliverable with no finish line (work that never
ends).

## Document metadata

- **Document:** `N — Name` (a stable id, **not** a position in a sequence)
- **Kind:** `rule | deliverable`
- **Status:** `one value from this kind's vocabulary`
- **Owner:** `team or role`
- **Dependencies:** `document numbers, ADRs, or board rows`
- **Related documents:** `links`
- **Last reviewed:** `YYYY-MM-DD`

## Purpose

State the product problem and why it belongs in the software-factory roadmap.

## Outcome

Describe the observable change in operator and agent behavior. Avoid implementation-only outcomes.

## Scope

### In scope

- [ ] `Capability or behavior 1`
- [ ] `Capability or behavior 2`

### Out of scope

- [ ] `Explicit exclusion 1`
- [ ] `Explicit exclusion 2`

## Definition of done

**Deliverables only, and mandatory.** A finite list where every box can be ticked. When all of them
are, the deliverable is `Closed` — no further judgement required. If a box cannot be ticked by work
alone, it belongs to a rule or to the measurement program, not here.

Rules omit this section: a rule has no done state, and giving it one invites a false claim.

- [ ] `Outcome 1, stated so a stranger could check it`
- [ ] `Outcome 2`
- [ ] `Outcome 3`

## Gate

Required for **both kinds**.

- For a **deliverable**: the single observable condition it must clear, and the suite, test, or board
  row that scores it. A gate with no oracle is a wish.
- For a **rule**: what "enforced" means for this rule, with an oracle.

## Software scope and invariants

Required for **both kinds**. State what this document may not widen, and which of the three
[agnosticism invariants](../concepts/agnosticism-invariants.md) it must preserve. Every roadmap
document is bounded by the [product statute](../product/software-factory.md): the deliverable is
software and the technical artifacts that ship with it.

- [ ] `What this work must not widen`
- [ ] `The invariant most at risk here, and how it is preserved`

## Design rules

- [ ] Preserve language, project-type, and architecture agnosticism.
- [ ] Preserve project/repository isolation.
- [ ] Preserve least privilege and human decision gates.
- [ ] Preserve durable state and interruption safety.
- [ ] Preserve truthful claims and criterion-level evidence.
- [ ] Avoid adding equivalent entities, tools, skills, or vocabulary.

## Work checklist

### Model and contracts

- [ ] Define canonical entities, fields, states, and relationships.
- [ ] Define ownership, authorization, and scope boundaries.
- [ ] Update the domain model and relevant ADRs.

### Agent behavior

- [ ] Define allowed and denied tools for each role.
- [ ] Define questions, blockers, and escalation behavior.
- [ ] Define durable outputs and provenance.

### Operator surfaces

- [ ] Update chat, CLI, REST, and web behavior together.
- [ ] Confirm ids, fields, states, and errors agree across surfaces.

### Execution and quality

- [ ] Define project-native checks and evidence.
- [ ] Define interruption, resume, cancellation, and duplicate-work behavior.
- [ ] Define security, privacy, and secret-handling constraints.

### Evidence

- [ ] Add or update a suite, test, or board row that scores the gate.
- [ ] Test a greenfield, a brownfield, and a non-default toolchain when relevant.
- [ ] Record evidence, limitations, and remaining gaps.

## Risks and open decisions

- [ ] `Risk or unresolved decision`

## Delivery record

**Deliverables only.** Filled when the deliverable closes, and never carried forward from an earlier
run.

- **Closed in:** `commit or PR`
- **Definition of done:** `all boxes ticked | which remain`
- **Tests:** `commands and results, from the run that produced them`
- **Evidence:** `links or paths`
- **Known limitations:** `none, or an explicit list of what this deliverable does not cover`
- **Follow-up:** `document number, or none`
