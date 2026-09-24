# 00. Roadmap document template

Copy this file when adding a roadmap document. Keep the document in English and use checkboxes for
work that can be verified. Replace every placeholder before treating the document as ready.

## Document kinds

Not every roadmap document is a phase, and applying one progress lens to all of them produces
false claims — a quality policy is never "complete". Declare the kind, then use that kind's
vocabulary.

| Kind | What it is | Status vocabulary |
|------|------------|-------------------|
| `charter` | Standing principles. No done state; the question is how far behavior matches them. | `Declared` · `Partly enforced` · `Enforced` |
| `policy` | A standing rule the factory must always obey (flow, evidence, security). | `Declared` · `Partly enforced` · `Enforced` |
| `sequence` | An ordering of work. It has no progress of its own. | `Active` |
| `capability` | A unit of work with an observable end state. | `Proposed` · `Documented` · `In progress` · `Blocked` · `Complete` |

`Proposed` means specified only; `Documented` means specified and internally consistent with no
behavior yet; `In progress` means part of the gate holds and the remainder is named; `Complete` means
the gate holds with evidence. Doctrine for these definitions lives in
[README.md](README.md) § Status.

## Phase metadata

- **Phase:** `N — Name`
- **Kind:** `charter | policy | sequence | capability`
- **Status:** `one value from the table above, for this kind`
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

## Gate

Required section. State the single observable condition this document must clear, and name the suite,
test, or board row that scores it. A gate with no oracle is a wish, not a gate.

- [ ] `The condition, stated so a stranger could check it`
- [ ] Scored by `suite, test path, or board row`

## Software scope and invariants

Required section. State what this document may not widen, and which of the three
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
- [ ] Define observability and audit records.

### Documentation

- [ ] Update the canonical product document if the product statement changes.
- [ ] Remove obsolete terminology and broken links.

### Evaluation

- [ ] Add or update a suite, test, or board row that scores the gate.
- [ ] Test a greenfield, a brownfield, and a non-default toolchain when relevant.
- [ ] Record evidence, limitations, and remaining gaps.

## Acceptance criteria

- [ ] The intended operator journey works end to end.
- [ ] Unsupported states fail closed and remain visible.
- [ ] Durable state matches the user-visible report.
- [ ] No obsolete file or reference remains.

## Risks and open decisions

- [ ] `Risk or unresolved decision`

## Completion record

Capability phases only. A charter, policy, or sequence records delivery elsewhere and reports its
enforcement status in the roadmap table instead.

- **Implemented in:** `commit or PR`
- **Tests:** `commands and results`
- **Evidence:** `links or paths`
- **Known limitations:** `none or explicit list`
- **Follow-up:** `document number or none`
