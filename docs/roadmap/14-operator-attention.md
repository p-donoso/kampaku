# 14. Operator attention and decision load

- **Document:** `14 — Operator attention and decision load`
- **Kind:** `deliverable`
- **Status:** `Proposed`
- **Owner:** product / web
- **Dependencies:** [01](01-philosophy.md), [02](02-factory-flow.md), [13](13-evidence-decay.md)
- **Related documents:** [statute](../product/software-factory.md),
  [agnosticism invariants](../concepts/agnosticism-invariants.md), [eval 10](../eval/10-human-in-the-loop.md),
  [eval 16](../eval/16-operator-ui.md), [BOARD](../eval/results/BOARD.md)
- **Last reviewed:** 2026-09-24

## Purpose

The product's premise is **one person**. The roadmap specifies the line's throughput in detail — workers,
leases, budgets, context, routing — and specifies the operator's capacity not at all. The word
"operator" appears throughout the roadmap and is never scoped as a resource.

That inversion is the gap. The human is the binding constraint on a personal factory, so a factory that
optimizes everything except the human's attention optimizes the wrong end.

The symptoms are already recorded as separate defects, and they are one defect:

- [F-007](../eval/results/BOARD.md) — a question asked from chat is durable, but answering it resumes
  nothing, so the gate is not a gate.
- [F-012](../eval/results/BOARD.md) — plan previews never expire, so a preview from any point in
  history remains approvable while approvals themselves expire.
- Gate **P3** — a pending question must be visible *and answerable* in the web UI, which presupposes
  knowing which pending question matters now.
- [F-013](../eval/results/BOARD.md) — an interrupted turn leaves no record while it runs, so the
  operator cannot tell waiting from hung.

Each is an instance of an unspecified attention model. Fixing them individually will produce four
patches to a model that does not exist yet.

## Outcome

An operator can answer, in one place:

- **What needs me now?** — a ranked, bounded list of decisions, each with the consequence of
  answering and the cost of not answering.
- **What can wait?** — work the factory correctly deferred instead of asking.
- **What did it decide without me?** — every decision the factory made from the repository, and why
  that was in its authority.
- **How much of me has it used?** — attention spent, and the trend.

The observable change is that the factory asks fewer questions, and the ones it asks are the ones only
the operator can answer.

## Scope

### In scope

- [ ] A canonical, ranked **decision queue**: what is pending, what it blocks, what it unlocks, and
      how long it has been waiting.
- [ ] A rule separating a **blocking decision** (no defensible default exists) from a **deferrable
      one** (the line can continue on a stated assumption). Only the first interrupts.
- [ ] An **interrupt budget**: a bounded number of outstanding decisions, with the factory changing
      strategy rather than queueing without limit.
- [ ] **Assumption-and-continue**: where a deferrable decision exists, proceed on a recorded
      assumption that is visible, reversible, and surfaced at the next natural pause.
- [ ] **Batching**: related decisions arrive together with the context needed to answer them in one
      pass, instead of one at a time.
- [ ] **A live status surface**: what is running, what is waiting, and what is blocked, in one view.
- [ ] Answering a decision **resumes the work it gates**, which is [F-007](../eval/results/BOARD.md)
      satisfied rather than patched.
- [ ] Decision **expiry**: a pending decision that nothing is waiting on is closed as expired rather
      than accumulating ([F-012](../eval/results/BOARD.md)).
- [ ] Measurement of attention: how many decisions per order, how long they waited, how many were
      deferred, and how many were answered by taking the recommendation.

### Out of scope

- [ ] Notifications to external channels: email, chat, push. A later concern; the durable queue comes
      first, because a notification for a decision with no durable home is the F-007 defect again.
- [ ] Multi-operator concerns: assignment, delegation between people, escalation to a team. The
      product is a personal factory.
- [ ] A general workflow engine or inbox. This is one bounded queue with one ranking rule.
- [ ] Removing human gates. The phase reduces *unnecessary* interruption; it never reduces authority.

## Definition of done

Every box ticked closes this deliverable. Nothing here needs a judgement call.

- [ ] One ranked view of what needs the operator, on chat, CLI, and web
- [ ] A deferrable decision does not stop the line; the assumption is recorded and reported
- [ ] Answering a decision resumes the work it gated, without a follow-up turn
- [ ] Outstanding decisions are bounded, and a full queue changes behavior rather than growing
- [ ] A decision nothing is waiting on expires and is recorded as expired
## Gate

**The factory never blocks on a decision it could have deferred, and never needs the operator to
search for what needs them.**

- [ ] Every pending decision is visible in one ranked list on every surface, with what it blocks.
- [ ] A deferrable decision does not stop the line: work proceeds on a recorded, reversible
      assumption.
- [ ] A blocking decision stops exactly the work that depends on it, and that work is visibly blocked
      with a reason.
- [ ] Answering a decision resumes the work it gated, on the same work item, without a follow-up turn
      ([F-007](../eval/results/BOARD.md)).
- [ ] Outstanding decisions are bounded; a full queue changes behavior rather than growing.
- [ ] A decision nothing is waiting on expires and is recorded as expired.
- [ ] Every decision the factory made autonomously is visible with the authority it used.

Scored by a new oracle, extending [eval 10](../eval/10-human-in-the-loop.md) (the gate is real and
durable) and [eval 16](../eval/16-operator-ui.md) (the journey is walkable without CLI knowledge),
with gate **P3** as its floor.

## Software scope and invariants

**The operator is the decision source for business calls, not for technical ones.** This phase
sharpens [principle 2](01-philosophy.md): the person defines intent, priorities, and business
decisions. A factory that asks the operator to choose a test runner, a directory layout, or a toolchain
is asking a question the repository already answers, and the question itself is the defect
([invariants](../concepts/agnosticism-invariants.md) § what must be discovered).

**Language-agnostic and project-type-agnostic.** The decision model must be derived from what the
*repository* cannot answer, never from a template of "questions a project like this usually raises". A
model that asks a Python project the questions a Node project needs breaks **F2**; a model that assumes
greenfield breaks **F4**.

**Architecture-agnostic.** A decision spanning two repositories is one decision naming both, not two
decisions. An operator is a person, not a per-repository process.

**Durable and truthful.** A pending decision is durable state that survives a closed chat, a crashed
process, and a model swap, exactly as work items do. An assumption the factory proceeded on must be
reportable later, or "we continued on an assumption" becomes a silent scope change.

**Repository isolation.** Everything on the attention surface belongs to one project. Attention spent
on one project must not leak another project's state into the same view.

## Design rules

- [ ] Ask only what the repository cannot answer. If a check, a manifest, or a convention decides it,
      the factory decides it.
- [ ] Every question states its consequence, its options, and the cost of waiting.
- [ ] Rank by what the answer unblocks, not by when the question was asked.
- [ ] Prefer the smallest reversible assumption over a question, and record the assumption.
- [ ] Never ask two questions where one answer determines both.
- [ ] A gate that cannot be answered is not a gate: every decision has a durable home and a way to
      answer it on every surface.
- [ ] Never make the operator read the database or the CLI to discover what needs them.

## Work checklist

### Model and contracts

- [ ] Define the decision record: kind, blocking or deferrable, what it blocks, options, consequence,
      recommendation, expiry, and the authority that would resolve it.
- [ ] Define the assumption record: what was assumed, on what evidence, and how it is reversed.
- [ ] Define the interrupt budget and the behavior when it is full.
- [ ] Define attention accounting: decisions per order, wait time, deferral rate, acceptance rate.

### Behavior

- [ ] Rank the queue by unblocked work, with blocking decisions first.
- [ ] Resume gated work on answer, within the same order ([F-007](../eval/results/BOARD.md)).
- [ ] Expire decisions nothing waits on, recording the expiry ([F-012](../eval/results/BOARD.md)).
- [ ] Surface deferrable decisions as assumptions at the next natural pause.
- [ ] Show the factory's own decisions with the authority they used.

### Operator surfaces

- [ ] One attention view showing running, waiting, and blocked, on web, chat, and CLI.
- [ ] Answer a decision from any surface, with the same ids and states everywhere.
- [ ] Show attention spent against the budget over the life of an order.
- [ ] Keep every pending decision answerable in the web UI without CLI knowledge (gate **P3**).

### Quality

- [ ] Test a long order whose decisions exceed the budget: behavior changes, nothing is dropped.
- [ ] Test answering a blocking decision: the dependent work resumes.
- [ ] Test a deferrable decision: the line continues and the assumption is reported.
- [ ] Test expiry: an unanswered decision with no dependent work closes as expired.

## Acceptance criteria

- [ ] A stranger can tell, in one view, what needs the operator and what does not.
- [ ] The factory asks materially fewer questions without losing a human gate.
- [ ] Every assumption is visible, reversible, and reported.
- [ ] Answering resumes work rather than requiring a follow-up turn.
- [ ] Nothing accumulates: decisions are answered, deferred, or expired.
- [ ] Attention spent is measurable, so it can be bounded and improved.

## Risks and open decisions

- [ ] **Fewer questions can become fewer gates.** The failure mode of this phase is a factory that
      silently assumes a business decision it should have asked. The rule must be "defer technical
      decisions, never business ones", and the audit must show which was which.
- [ ] **A plausible default can be worse than a question.** Assuming wrongly and continuing is more
      costly than waiting, because the work must be redone. Deferral must be limited to assumptions
      that are cheap to reverse.
- [ ] **Ranking needs a definition of "unblocks".** Counting dependent work items is the obvious
      metric and is gameable by a plan that over-decomposes. Decide before implementing.
- [ ] **Attention accounting is self-reported** unless derived from durable records, and a
      self-reported metric is the kind of claim this product refuses elsewhere.
- [ ] **Interaction with the measurement program.** The deferral rate is a product metric that a real
      run should decide; do not fix a target before [12](12-measurement-program.md) produces one.
