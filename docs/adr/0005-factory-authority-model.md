# ADR-0005: The front office opens work orders

- Status: Accepted
- Date: 2026-09-23
- Implementation status: **pending** — the code change below is not applied. See
  [BOARD F-001](../eval/results/BOARD.md).
- Supersedes: the advisory-only orchestration contract of 2026-09-15.

## Context

On 2026-09-15 the root agent (`kampaku`) was narrowed to an **advisor**: it clarifies intent,
inspects state, asks structured questions, appoints a project lead, delegates — and holds no
container-creating, planning, execution, or repository capability. An exact-allowlist contract was
written and locked by
`apps/core/tests/eval/eval-orchestrator-contract.test.ts`, which asserts
`KAMPAKU_BUILTIN_DEFINITION.tools` **equals** an 11-tool list.

The narrowing was a response to real dishonesty found by the lab: an agent reporting work it had not
done. Three defences were built afterwards — always printing whether tools ran (`tools: none`),
reconciling the reply against durable state (`auditTurnClaims`), and injecting a ground-truth block
that outranks the conversation's own history. Those changed the argument: the problem was
unverified claims, and it now has targeted defences.

What the lab found next is the problem this ADR resolves. Measured on the current tree
(capability probe G-09, still open):

| Artifact | Says |
|----------|------|
| `apps/core/src/agents/definitions.ts` system prompt | "call `create_project` first" — five separate instructions to create the container with that tool |
| `apps/core/src/agents/runtime/tools/index.ts` | `submit_intent` refuses the root agent and tells it to "call `create_project` to create the container" |
| `apps/core/src/agents/runtime/tools/create-project.ts` | `create_project` is implemented |
| `apps/core/src/agents/runtime/tools/index.ts` (`KAMPAKU_TOOLS`) | `create_project` is registered and dispatched |
| `apps/core/src/agents/runtime/session.ts:244` | tools are filtered by `definition.tools.includes(name)` |
| `KAMPAKU_BUILTIN_DEFINITION.tools` | `create_project` is **absent** |
| `eval-orchestrator-contract.test.ts` | asserts that absence, and passes |

The chain is closed and self-consistent in the wrong direction: the root agent is instructed to call
a tool that is filtered out of its own tool list before the model ever sees it, while the tool that
*would* have created the container refuses it and names the unreachable one.

Consequence, observed live: asked to stand up a new piece of work, the root agent created the
*team* (that tool exists), found it could not create the container, and asked the emperor for
permission for the rest. Five agents, no project, no repository, no work items, nothing executable.
No role can open a work order by the documented route, and a test enforces that.

For a software factory this is fatal. A factory whose front desk cannot open a work order is not a
factory; it is a consultant.

## Decision

**Opening a work order is a front-office capability and belongs to the root agent.**

1. `create_project` is added to `KAMPAKU_BUILTIN_DEFINITION.tools`.
2. The eval contract is re-scored: its oracle changes from "the allowlist excludes every mutating
   tool" to **"the allowlist contains exactly the front-office capabilities, and excludes every
   capability that belongs to the line."** The excluded set is the durable one and does not shrink:
   plan submission, work-item mutation, plan approval, repository writes, shell access, completion
   mutation, private specialist memory, and durable job control remain absent from the root agent.
3. The root agent creates the container and the responsible lead; it does not plan, execute,
   verify, or close work. Delegation remains the transition from front desk to line.
4. The distinction is recorded in the operating model: **the front office opens work; the line does
   the work; inspection is independent of both.**

## Consequences

### Positive

- The documented path becomes a real path. The instructions, the refusal text, and the allowlist
  stop contradicting each other.
- Removing the contradiction removes a measured cause of the worst observed failure mode: an agent
  whose tools cannot satisfy the request improvising around the gap and reporting success anyway
  (`G-08`, `G-17` in the probe ledger).
- The factory can accept work from every surface — chat, CLI, REST, and the agent — which is what
  the Web/CLI parity and complete-CRUD golden rules already required
  ([agent hierarchy](../architecture/agent-hierarchy.md)).

### Negative

- The root agent gains a mutation. It is narrow (create a container, link a lead and repositories)
  and validated in the application layer, but it is a widening of an allowlist that was deliberately
  minimal, and it must be re-defended by the claim audit and ground-truth block rather than by
  absence.
- `eval-orchestrator-contract.test.ts` must be rewritten. A passing test that locked a contradiction
  is worse than a failing one; the rewrite must keep the denied paths locked so this ADR does not
  become a precedent for widening the allowlist further.
- Every suite whose oracle asserted "the root agent does not create projects" changes verdict and
  must be re-run on a fresh data dir.

### Neutral

- The advisor's read, assessment, and delegation tools are unchanged.
- The `submit_intent` refusal for the root agent stays: planning belongs to the lead, not the front
  desk.

## Alternatives considered

**Keep the advisory-only contract and add a separate "project creation" role.** Rejected: it
reintroduces the prompt-and-hope problem this ADR exists to remove. The tool would exist for a role
that is reached only after delegation, so the front desk still could not open a work order, and the
observed failure would reproduce.

**Keep the allowlist and delete the `create_project` instructions from the prompt.** Rejected: it
makes the documentation match a product that cannot create work. The honest version of that choice
is to remove project creation from the product entirely, which removes the factory.

**Leave the contradiction and let the operator create projects via `POST /api/v1/projects`.**
Rejected: CLI/REST-only workarounds for a broken agent path are the exact "one surface enforces the
rule" defect already recorded in the evaluation board.

## Related

- [Product statute](../product/software-factory.md)
- [Eval lab](../eval/README.md) — suite [01](../eval/01-work-order-intake.md),
  [04](../eval/04-capability-boundary.md)
- [BOARD F-001](../eval/results/BOARD.md)
- [Product roadmap](../roadmap/05-adoption-sequence.md) — front-office intake and claim reconciliation
- `apps/core/src/agents/definitions.ts`, `apps/core/src/agents/runtime/session.ts`
