# 10. Context minimization

- **Phase:** `10 — Context minimization`
- **Kind:** `capability`
- **Status:** `Proposed`
- **Owner:** core
- **Dependencies:** [01](01-philosophy.md), [06](06-project-context.md), [09](09-domain-model-naming.md)
- **Related documents:** [statute](../product/software-factory.md),
  [agnosticism invariants](../concepts/agnosticism-invariants.md),
  [data ownership](../architecture/data-ownership.md)
- **Last reviewed:** 2026-09-23

Agents should not receive the entire project tree, every task, every skill, and every record by
default. They should receive enough context to make the next authorized decision or perform the
next authorized action, then retrieve more when needed.

## Default context projection

The initial context should contain:

- agent identity, role, parent, and authority boundary;
- project identity, purpose, repository scope, and relevant technical context;
- current task, acceptance criteria, dependencies, and gate;
- assigned skills and permitted tools;
- active decisions, blockers, and evidence directly relevant to the task;
- concise pointers to related records rather than their full contents.

## On-demand queries

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

- [ ] Define the default context projection for each agent role.
- [ ] Replace full-tree injection with ids, summaries, links, and current-state fields.
- [ ] Add authorized queries for objectives, tasks, dependencies, blockers, decisions, and evidence.
- [ ] Scope every query by project, agent, task, and permission.
- [ ] Return provenance, freshness, and explicit unknown/unavailable states.
- [ ] Prevent private memory and unrelated module context from leaking across agents.
- [ ] Persist query and projection metadata needed for auditability.
- [ ] Measure context size, retrieval latency, query count, and task success.
- [ ] Test with a large task tree and multiple sibling modules.
- [ ] Test behavior when required context is missing or stale.
- [ ] Confirm no projection can return another project's records.

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
[01](01-philosophy.md) applied to memory rather than to disk. A projection that crosses a project
boundary is the same defect as an artifact written into the platform.
