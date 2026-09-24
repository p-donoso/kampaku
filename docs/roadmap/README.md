# Software-factory improvement roadmap

This roadmap records the improvement program after Kampaku's shift from a domain-agnostic harness to a
software factory.

It holds **two kinds of document**, and the kind decides whether the document can close:

| Kind | What it is | Status vocabulary | Closes? |
|------|------------|-------------------|---------|
| **Standing rule** | A rule the factory must always obey. There is no end state; the question is how far behaviour matches it | `Declared` · `Partly enforced` · `Enforced` | **No** |
| **Deliverable** | A finite body of work with an observable end state | `Proposed` · `Ready` · `In progress` · `Blocked` · **`Closed`** | **Yes**, when its *definition of done* is fully ticked |

**The deliverable is the unit of progress.** Take one, tick its definition of done, close it, move on.
A rule is the standard that deliverable is measured against — a policy marked "complete" would be a lie
about a standing standard, and a deliverable with no finish line is work that never ends.

Document numbers are **stable ids**, not positions in a sequence. The order to take deliverables in is
[05](05-adoption-sequence.md).

## Deliverables

Every row's definition of done is in its own document. A deliverable moves to `Closed` only when every
box is ticked.

| Deliverable | Status | Definition of done | Blocked by |
|-------------|--------|--------------------|------------|
| [04](04-capability-program.md) Capability program | **In progress** | 5 criteria | The front-office classifier, and seven capability areas still without an owning document |
| [06](06-project-context.md) Project context | **Ready** | 4 criteria | Nothing; the schema work has not started |
| [07](07-engineering-skills.md) Engineering skills | **Ready** | 4 criteria | Role derivation still depends on the slug-suffix map |
| [08](08-project-agent-roster.md) Project agent roster | **Ready** | 4 criteria | The seat's fields are implicit: role and skills from the slug, module scope inexpressible |
| [09](09-domain-model-naming.md) Domain model naming | **Proposed** | 4 criteria | Structural prerequisite; deliberately deferred until the surface stops moving |
| [10](10-context-minimization.md) Context minimization | **Proposed** | 5 criteria | Structural prerequisite |
| [11](11-multi-provider-routing.md) Multi-provider routing | **Proposed** | 8 criteria (Parts A and B) | Part A is ready to take; Part B waits for a proven need |
| [12](12-measurement-program.md) Measurement program | **Proposed** | 4 criteria | Needs a working model endpoint for the suites that require one |
| [13](13-evidence-decay.md) Evidence decay | **Proposed** | 5 criteria | Depends on 06 for persisted revisions |
| [14](14-operator-attention.md) Operator attention | **Proposed** | 5 criteria | Nothing; a product-design deliverable |
| [15](15-reversal-and-retraction.md) Reversal and retraction | **Proposed** | 5 criteria | Depends on 03's evidence lifecycle |
| [16](16-prohibited-operations.md) Prohibited operations | **Proposed** | 4 criteria | Needs a git-surface policy; the highest value per unit of work here |
| [17](17-ai-interaction-expertise.md) AI interaction expertise | **In progress** | 7 criteria | The catalog skill and the platform station exist; detection, fixtures, and cost do not |
| [18](18-self-extension.md) Self-extension | **Proposed** | 6 criteria | Depends on 07 (role derivation) and 08 (seat scope) |

## Standing rules

These are never "done". The status answers one question: how far does behaviour match the rule.

| Rule | Status | What is enforced | What is not |
|------|--------|------------------|-------------|
| [01](01-philosophy.md) Product philosophy | **Partly enforced** | Software is the deliverable, stated on every surface a person or agent reads, and a refusal is recorded durably. Principles 2–4 hold | Principles 5–8 hold only partly: discovery is not persisted, sandbox roots are not per-project, and resumption is not durable ([F-015](../eval/results/BOARD.md), [F-007](../eval/results/BOARD.md)) |
| [02](02-factory-flow.md) Factory flow | **Partly enforced** | Intake is real: the front office can open a work order on every surface, and a lead can create the seats it proposes | Five of the six stations are unexercised end to end |
| [03](03-quality-and-testing.md) Quality and testing | **Partly enforced** | A check resolves against the repository rather than npm; the seed, planner leaves, worker prompt, and two skills assert no ecosystem | Discovery is not persisted, checks cannot be scoped to one package, and the worker cannot verify audio content ([F-009](../eval/results/BOARD.md)) |
| [05](05-adoption-sequence.md) Deliverable order | **Declared** | The order is stated, and the two competing orderings are reconciled in favour of measurement | Steps 0 and 1 have not started, so nothing has been measured |

## Documents

**Standing rules**

- [01-philosophy.md](01-philosophy.md) — the product principles that govern future work.
- [02-factory-flow.md](02-factory-flow.md) — the normative production line and its gates.
- [03-quality-and-testing.md](03-quality-and-testing.md) — testing, verification, and evidence.
- [05-adoption-sequence.md](05-adoption-sequence.md) — the order to take deliverables in.

**Deliverables**

- [04-capability-program.md](04-capability-program.md) — the capability areas to strengthen.
- [06-project-context.md](06-project-context.md) — the software context the project entity should expose.
- [07-engineering-skills.md](07-engineering-skills.md) — the base programming skills the factory should strengthen.
- [08-project-agent-roster.md](08-project-agent-roster.md) — project-scoped agents, hierarchy, and memory.
- [09-domain-model-naming.md](09-domain-model-naming.md) — the model vocabulary refactor.
- [10-context-minimization.md](10-context-minimization.md) — bounded context projections and on-demand queries.
- [11-multi-provider-routing.md](11-multi-provider-routing.md) — the endpoint contract and staged routing.
- [12-measurement-program.md](12-measurement-program.md) — running the battery and reconciling the roadmap with it.
- [13-evidence-decay.md](13-evidence-decay.md) — keeping a verdict meaningful after the artifact moves.
- [14-operator-attention.md](14-operator-attention.md) — the operator as a bounded resource.
- [15-reversal-and-retraction.md](15-reversal-and-retraction.md) — withdrawing an outcome that was wrong.
- [16-prohibited-operations.md](16-prohibited-operations.md) — operations that are out of bounds.
- [17-ai-interaction-expertise.md](17-ai-interaction-expertise.md) — prompts, skills, and model-call cost in built software.
- [18-self-extension.md](18-self-extension.md) — authoring the agents and skills the seed set does not have.

**Template**

- [00-template.md](00-template.md) — the template for a new document, with both kinds.

## Closed deliverables

The phase-01 delivery — the framing alignment — is closed. Its record lives in
[01](01-philosophy.md) § Delivery record; the charter it produced stays `Partly enforced` as a rule,
which is why closing a delivery never closes the rule it was measured against.

## Work recovered into an owner

Items that lost their owner when the earlier `docs/product/roadmap.md` was consolidated into this
directory, and where they went once that was noticed. A consolidation whose point is that no reference
goes missing has to be checked in both directions.

| Item | Now owned by | Was |
|------|--------------|-----|
| Multi-worker capacity, richer schedules and budgets | [04](04-capability-program.md) § Capacity and cost | An unassigned "Later" bullet |
| Per-work-order cost and budget accounting | [04](04-capability-program.md) § Capacity and cost, consuming the per-attempt usage recorded by [11](11-multi-provider-routing.md) | An unassigned "Later" bullet |
| Automated prompt harness for eval run logs | [eval README](../eval/README.md) § Scope of this directory, explicitly out of scope | Correctly out of scope already |
| Running the battery and reconciling this roadmap with it | [12](12-measurement-program.md) | Unowned; the roadmap defaulted to building capability instead |
| Retention policy for workspaces, and backup or export of the durable store | [04](04-capability-program.md) § Capacity and cost | An unelaborated bullet in the security model and `worker.md` |
| The project's own development process: pull requests, required review, protected branches | [06](06-project-context.md) as project context; [16](16-prohibited-operations.md) for the git surface | `github-admin` is three lines |

## Rule for future changes

Every improvement must strengthen the factory line, preserve the three
[agnosticism invariants](../concepts/agnosticism-invariants.md), or improve the honesty of its
evidence. Work that does none of these needs explicit justification.

Four rules keep this roadmap honest as it is worked:

1. **A deliverable closes only when its definition of done is fully ticked.** Not when the work feels
   finished, and not when the document has been rewritten to match what was built.
2. **A rule is never marked closed.** Its status tracks enforcement, and enforcement can go down as
   well as up.
3. **A closed gap is not a green suite.** Resolving a board row clears the path; it does not score the
   suite. Rows and statuses say which one happened ([BOARD](../eval/results/BOARD.md) legend).
4. **No document widens the deliverable.** A capability that accepts work outside the software scope,
   or a vocabulary that could describe it, is a regression against the
   [statute](../product/software-factory.md) regardless of how well it works.
