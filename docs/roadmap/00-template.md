# 00. Roadmap deliverable template

Copy this file when adding a deliverable. Keep it in English, and replace every placeholder before
treating the document as ready.

## What belongs here

**The roadmap holds deliverables.** A deliverable is finite work with an observable end state, and it
closes when its **Definition of done** is fully ticked. Nothing else belongs in this directory:

| Not a deliverable | Where it goes |
|-------------------|---------------|
| A policy (what the factory must always do) | The product documentation it governs: the [statute](../product/software-factory.md), [execution assurance](../architecture/execution-assurance.md), the [security model](../security/security-model.md) |
| Active priority or sequence | The [Kampaku Roadmap Project](https://github.com/users/p-donoso/projects/2) |
| A measurement result | The [eval board](../eval/results/BOARD.md) |

The reason is not tidiness. A document that cannot close has no finish line, so nothing can tell a
finished one from an abandoned one — and a document that *looks* like work while being a standing rule
invites someone to mark a rule "done", which is a false claim about a standard that never ends.

## Metadata

- **Document:** `N — Name` (a stable id, **not** a position in a sequence)
- **Kind:** `deliverable`
- **Tracking issue:** `https://github.com/p-donoso/kampaku/issues/number`
- **Related documents:** `links`
- **Last reviewed:** `YYYY-MM-DD`

Numbers are never reused. A retired number stays absent and is named in
[README.md](README.md) § Why some numbers are missing, because a board row or a commit message may
cite it.

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

### What exists now

The measured starting state, with the file or command that established each fact. This section is what
stops a deliverable from re-solving something already solved, and what makes "still open" checkable.

## Definition of done

**Mandatory.** A finite list where every box can be ticked. When all of them are, the deliverable is
`Closed` — no further judgement required.

Two rules for this list:

- If a box cannot be ticked by work alone, it belongs to a policy or to the measurement program, not
  here.
- A box that requires a suite run stays unticked until the run happens. A locked promise is not a met
  one.

- [ ] `Outcome 1, stated so a stranger could check it`
- [ ] `Outcome 2`
- [ ] `Outcome 3`

## Gate

The single observable condition this deliverable must clear, and the suite, test, or board row that
scores it. A gate with no oracle is a wish.

State plainly whether it holds today. A gate that is unmet is expected: that is why the deliverable
exists.

## Software scope and invariants

State what this deliverable may not widen, and which of the three
[agnosticism invariants](../concepts/agnosticism-invariants.md) it must preserve. Every document is
bounded by the [statute](../product/software-factory.md): the deliverable is software and the
technical artifacts that ship with it.

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

Group the work by the layer it touches, so a reader can see where the change lands.

### Model and contracts

- [ ] Define canonical entities, fields, states, and relationships.
- [ ] Define ownership, authorization, and scope boundaries.
- [ ] Update the domain model and relevant ADRs.

### Behavior

- [ ] Define allowed and denied operations for each role.
- [ ] Define failure, escalation, and recovery behavior.
- [ ] Define durable outputs and provenance.

### Operator surfaces

- [ ] Update chat, CLI, REST, and web behavior together.
- [ ] Confirm ids, fields, states, and errors agree across surfaces.

### Evidence

- [ ] Add or update the suite, test, or board row that scores the gate.
- [ ] Test a greenfield, a brownfield, and a non-default toolchain when relevant.
- [ ] Record evidence, limitations, and remaining gaps.

## Risks and open decisions

- [ ] `Risk or unresolved decision`

## Delivery record

**Filled when the deliverable closes, and never carried forward from an earlier run.** A record that
cites stale numbers is the defect this section exists to prevent, so restate them from the run that
produced them.

- **Closed in:** `commit or PR`
- **Definition of done:** `all boxes ticked | which remain`
- **Tests:** `commands and results, from the run that produced them`
- **Evidence:** `links or paths`
- **Known limitations:** `none, or an explicit list of what this deliverable does not cover`
- **Follow-up:** `document number, or none`
