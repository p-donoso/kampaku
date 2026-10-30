# 10. Context minimization

- **Document:** `10 — Context minimization`
- **Kind:** `deliverable`
- **Status:** `In progress`
- **Owner:** core
- **Dependencies:** [statute](../product/software-factory.md), [06](06-project-context.md), [09](09-domain-model-naming.md)
- **Related documents:** [statute](../product/software-factory.md),
  [agnosticism invariants](../concepts/agnosticism-invariants.md),
  [token economy](../concepts/token-economy.md),
  [data ownership](../architecture/data-ownership.md),
  [baseline run 3](../eval/archive/baseline-2026-09-24.md) § Next
- **Last reviewed:** 2026-09-28

Agents should not receive the entire project tree, every task, every skill, and every record by
default. They should receive enough context to make the next authorized decision or perform the
next authorized action, then retrieve more when needed.

This is the same bill as principle 9: every token sent is a token billed, so a prompt that carries the
whole tree is a choice about the operator's money. The [token economy](../concepts/token-economy.md) is the
principle; this deliverable is the work of making prompts smaller, and the reasoning budget that now
differs by role is the part of it already shipped.

## What exists now

This deliverable was `Proposed` with no measurement behind it until 2026-09-24, when the first live
measurement of a turn's context was taken — not to save tokens, but to explain a correctness failure.
Suite 01's inspection bullet had failed three times in three shapes, and one live turn's context broke
down like this:

| Part of the turn | Chars | Share |
|---|---|---|
| Builtin orchestrator prompt — the front office's own identity | 4 643 | **11.5%** |
| Skills: the eleven `workflow-*` ("default") | 12 194 | **30.2%** |
| Skills: the operator/system set | 15 341 | 38.0% |
| Tool schemas | 8 220 | 20.3% |

The role's definition of itself was the smallest part of its own context, and the largest removable
block was ~10 KB of fragments instructing the reader to call `execute_work_item`, `report_blocker`,
`recall`, `propose_wiki_edit` and ~40 more tools **that role cannot call**. The front office delegates
execution; it does not perform it. The projection was wrong in the ordinary way this deliverable
exists to prevent — the catalog was injected whole, instead of the agent's own slice of it.

The first fix: the orchestrator's prompt is built from the operator skills only, and the executor
fragments reach the agents that really execute. Measured effect **−30.2%** (40 398 → 28 204 chars),
and it removed a duplication in which two fragments were injected twice in one prompt. Locked in
`apps/core/tests/agents/orchestrator-skill-scope.test.ts`, in both directions.

**Then run 4 refuted it, and that is the more useful result.** The bullet the fix was aimed at behaved
identically with 30.2% less context: same three tools, same skill-catalog answer. A smaller turn is not
a bounded projection. Cutting text the agent never needed removed noise without removing the reason the
answer went sideways, and the honest reading is that this deliverable's first live experiment produced
a **negative** result about *size* and a positive one about *scope* — the orchestrator's projection is
now defined and locked, and the smaller turn is correct on its own terms, but neither bought the
correctness.

Three things this does **not** claim. It is one role, not every role — the checklist below stays
unticked. No query surface exists yet, which is the half of this deliverable that the evidence now
points at. And the failure it did not fix is a **rendering** problem, not a context problem: the fields
the operator asks for are already in the turn, so giving the model less to read was never going to make
it serve them. [BOARD F-024](../eval/results/BOARD.md) stays open, and the next attempt belongs to the
*On-demand queries* section below rather than to the projection.

## What the measurement established about the method

The useful part is not the 30%. It is that this was the fourth attempt at the same failure and the
first one justified by a number: the three before it rewrote the instruction, this one changed the
input, and the input was where the evidence actually pointed. "The prompt is too long" is a feeling;
`30.2% of the turn, ~40 tools the reader cannot call` is a measurement, and it is the kind this
deliverable should be argued with.

## Default context projection

The initial context should contain:

- agent identity, role, parent, and authority boundary;
- project identity, purpose, repository scope, and relevant technical context;
- current task, acceptance criteria, dependencies, and gate;
- assigned skills and permitted tools;
- active decisions, blockers, and evidence directly relevant to the task;
- concise pointers to related records rather than their full contents.

## On-demand queries

**This section is implemented, for one role.** The orchestrator's projection is a named set of seven
fragments — `system-chat-format`, `system-intake`, `system-project-bootstrap`, `system-agent-roster`,
`system-delegation`, `system-plan-quality`, `system-change-control` — and everything else in the catalog
is reachable through a new **`get_skill`** tool rather than carried every turn. `list_skills` answers at
the size a choice needs (`slug, name, capabilities`), with `detail: "full"` for the rest.

Measured: operator skills **5 106 → 3 852**. And a projection that cannot be reopened is not a
projection but a deletion, which is why `get_skill` exists and why `list_skills` did not lose a field —
it moved behind a flag.

The loop was the larger half. A turn of suite 01 carried **15 322 characters of tool results, 80% of it
either the whole skill catalog or a byte-identical duplicate**: `list_agents` called twice with the same
arguments, and `list_skills` answering "what exists" with 36 full descriptions. Repeats are now detected
and withheld, and a single result is bounded with an honest marker. That is this deliverable's *bounded
projection* applied where the weight actually was.

**This is now the load-bearing section, and it has evidence behind it.** Four runs of suite 01 have
failed the same bullet in four shapes while every change to the *instruction* produced nothing, and the
data the operator asked for was already read from the stores and already formatted in the turn. The
missing piece is not context and not permission: it is a query surface whose result **is** the answer,
so that a common question is rendered rather than generated.

Agents should be able to request bounded information such as:

- project objective and current status;
- a task's state, acceptance criteria, parent, children, and dependencies;
- the status of a related task or sibling module;
- relevant decisions, blockers, journal entries, or shared-knowledge pages;
- repository structure, toolchain facts, and recent verified checks;
- evidence for a specific criterion.

Queries must be scoped by project, role, task, and authorization. An agent should not receive
private memory, unrelated modules, or another agent's full context merely because it exists.

## Design rules

- Prefer summaries, ids, status, and links over full-tree injection.
- Never inject another project's context. Project scope is the outer boundary of every projection,
  and it is a security boundary, not a relevance heuristic.
- Fetch details just in time for the current decision.
- Cache only within the agent's permitted scope and mark cached facts as stale when necessary.
- Make unknown and unavailable information explicit.
- Keep query results provenance-aware and timestamped.
- Treat context reduction as a correctness and security feature, not only a token optimization.

## Success condition

An agent can complete its assigned work with a small initial context, retrieve the specific facts it
needs, avoid unrelated information, and explain which durable records supported its decisions.

## Implementation checklist

- [ ] Define the default context projection for each agent role. — **one of them done:** the orchestrator's projection is operator skills only, locked in `orchestrator-skill-scope.test.ts`. Every other role is still undefined.
- [ ] Replace full-tree injection with ids, summaries, links, and current-state fields. — **one case done:** the whole skill catalog was injected into the orchestrator and is no longer; see § What exists now.
- [ ] Add authorized queries for objectives, tasks, dependencies, blockers, decisions, and evidence.
- [ ] Scope every query by project, agent, task, and permission.
- [ ] Return provenance, freshness, and explicit unknown/unavailable states.
- [ ] Prevent private memory and unrelated module context from leaking across agents.
- [ ] Persist query and projection metadata needed for auditability.
- [ ] Measure context size, retrieval latency, query count, and task success.
- [ ] Test with a large task tree and multiple sibling modules.
- [ ] Test behavior when required context is missing or stale.
- [ ] Confirm no projection can return another project's records.

## Definition of done

Every box ticked closes this deliverable. Nothing here needs a judgement call.

- [ ] Each agent role has a defined default context projection
- [ ] Full-tree injection is replaced for every role that had it
- [ ] Every query is scoped by project, agent, task, and permission
- [ ] A projection cannot return another project's records, and a test proves it
- [ ] Missing or stale context produces an explicit unknown, not a guess
## Gate

**An agent completes its assigned work with a small initial context, retrieves the facts it needs,
and can name the durable record behind each decision.** Context reduction is a correctness and
security requirement here, not a token optimization: an agent that was never shown another project's
records cannot leak them, and an agent that must query a fact cannot silently invent it.

Scored by the projection and provenance checks in [10](../eval/10-human-in-the-loop.md),
[13](../eval/13-survive-interruption.md), and the isolation suite [15](../eval/15-do-not-eat-the-host.md).

## Software scope and invariants

Minimal context is what makes the agnosticism invariants safe to keep. If every agent received the
whole project by default, a Rust workspace, a Go module, a Python package, and a polyglot monorepo
would all have to fit one injected shape — which is how a default toolchain assumption enters the
product. Bounded projections let the toolchain stay a **queried, discovered fact** per package
([invariants](../concepts/agnosticism-invariants.md)).

Project scope bounds every projection, and that is the repository-isolation property from
[statute](../product/software-factory.md) applied to memory rather than to disk. A projection that crosses a project
boundary is the same defect as an artifact written into the platform.
