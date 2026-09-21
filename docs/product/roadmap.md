# Roadmap

## Shipped foundation

- Monorepo platform (`apps/core`, `apps/worker`, `apps/web`, `packages/contracts`)
- Durable SQLite control plane with recursive work items, jobs, leases
- Agent hierarchy, skills catalog, questions/blockers, wiki, journal
- Worker sandbox with FreeLLM executors and coding tools
- Operator web UI (chat, projects, agents, settings) + CLI parity
- Product evaluation suite (`docs/eval` suites 01–19)

## Next priorities

- Harden operator journeys and three-surface truth under real providers
- Strengthen completion evidence and least-privilege observability
- Keep eval board clear of blocking `open` rows while raising provider fidelity

## Phase: Explicit post-action knowledge projection

Make important agent outcomes explicit, structured, and independently retryable. Use a second, low-context call to the same agent after meaningful actions; do not rely on an unstructured final paragraph or a separate evaluator unless independent review is required.

### Scope

- Add a `post_action_review` protocol with event types:
  `work_completed`, `delegation_completed`, `blocker_resolved`,
  `handoff_completed`, `work_failed`, `phase_completed`, `wiki_reviewed`,
  and `repo_changed`.
- Run the review after work completion using only the work result, files,
  decisions, checks, relevant wiki pages, and required project metadata.
- Return a strict structured result with separate projections for:
  - superior journal: summary, decisions, files, checks, acceptance criteria,
    and follow-ups;
  - private agent memory: reusable lessons, or an explicit `not_needed`;
  - shared wiki: `not_needed`, `propose_edit`, or `post_comment`, with page,
    reason, evidence, and Markdown when applicable.
- Keep projections as separate runtime mutations:
  `submit_completion_report`, memory logging, `propose_wiki_edit`, or
  `post_wiki_comment`.
- Validate every projection, support per-projection retries, and never claim
  that a wiki change is published when it is only proposed.
- Preserve current closure rules: journal evidence is required, private
  memory is distinct from the journal, and wiki synchronization blocks closure
  only for projects or phases that explicitly require it.

### Lifecycle coverage

- Work completion: journal, memory, wiki decision, and follow-ups.
- Delegation: decomposition lesson and durable team-structure knowledge.
- Blocker or question resolution: decision record, reusable lesson, and
  optional durable wiki update.
- Handoff: transferred context, ownership change, and receiver-facing memory.
- Failure or retry: root cause, strategy to avoid repetition, and operational
  documentation when durable.
- Phase completion: consolidated lessons, wiki synchronization, and phase-gate
  evidence.
- Wiki review: confirmation that approved content matches the proposal.
- Repository change: check README, docs, wiki, tests, and contracts for drift.

### Acceptance criteria

- A completed work item produces a structured journal projection through the
  second review call; the original execution result remains available.
- The same agent can explicitly choose `not_needed` for memory or wiki without
  fabricating content.
- Wiki proposals remain pending until project-lead approval.
- A failed projection can be retried without re-running the completed work.
- Closure status reports identify missing journal, memory, or required wiki
  evidence separately.
- Tests cover schema validation, idempotency, retry behavior, closure gating,
  and each lifecycle event above.
- Persisted output remains English-only and contains no raw transcripts or
  secrets.

## Later

- Multi-worker capacity and richer schedules/budgets
- Broader domain-agnostic staffing without software recipe capture
- Optional automated prompt harness for eval run logs (does not replace suite tests)
