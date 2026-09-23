# 10. Context minimization

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
