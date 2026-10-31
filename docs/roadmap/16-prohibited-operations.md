# 16. Prohibited and irreversible operations

- **Document:** `16 — Prohibited and irreversible operations`
- **Kind:** `deliverable`
- **Tracking issue:** [#17](https://github.com/p-donoso/kampaku/issues/17)
- **Related documents:** [security model](../security/security-model.md) — **the policy this
  deliverable enforces**, [statute](../product/software-factory.md),
  [agnosticism invariants](../concepts/agnosticism-invariants.md),
  [eval 04](../eval/04-capability-boundary.md), [eval 15](../eval/15-do-not-eat-the-host.md)
- **Last reviewed:** 2026-09-24

> **The policy is not here.** The two tiers — what is prohibited and what is gated — live in the
> [security model](../security/security-model.md) § Prohibited and gated operations, because they are
> standing properties of the product rather than work. This document is the **work** that makes them
> true in runtime code.

## Purpose

The policy exists ([security model](../security/security-model.md)); its enforcement does not.

Measured 2026-09-24:

- The only destructive-operation rule in code or tests is "a bulk destructive request requires
  confirmation" ([eval 04](../eval/04-capability-boundary.md) prompt 5).
- Path policy can mark a folder prohibited (`apps/worker/src/sandbox/path-policy.ts`), which covers
  where a job writes and nothing about what it does.
- There is **no git-surface policy**. Force-push, history rewrite, and tag or release deletion are
  unaddressed anywhere in the tree.
- `github-admin` says "Never expose tokens" and nothing else.

So the product states seven things it will never do and enforces none of them in the layer where a
refusal could happen. That is the defect this deliverable removes: a prohibition that lives only in
prose is not a prohibition.

## What exists now

The security model states prohibited and gated operations, but runtime enforcement is incomplete:
path policy covers location while git-surface and operation-level rules remain open.

## Outcome

Every prohibited operation is unreachable through every surface, every gated operation produces a
durable approval that states its consequence, and one layer — not a prompt — is what refuses.

## Scope

### In scope

- [ ] A **git-surface policy** alongside the path policy, sharing its refusal and audit shape: history
      rewrite, protected branches, tag and release deletion.
- [ ] Fire the prohibitions in runtime code at the layer that owns them, per the security model's rule.
- [ ] A refusal that **names the rule**, and a way to find that rule from the refusal, rather than a
      message that reads like a capability limitation.
- [ ] Each gated operation produces an approval record stating the consequence; one unconfirmed turn is
      never enough.
- [ ] Audit every refusal, so the operator can see what was declined and which rule applied.
- [ ] Extend the secret handling from "scan artifacts" to "refuse the operation that would carry one".
- [ ] Confirm the platform tree is unreachable from a project job **by policy**, not by convention
      ([F-015](../eval/results/BOARD.md) is the open row for the bootstrap grant).

### Out of scope

- [ ] The tiers themselves. The [security model](../security/security-model.md) owns the list; changing
      what is prohibited is a product decision, not part of enforcing it.
- [ ] OS-level containment. The sandbox's path policy is the enforcement layer here; container or
      kernel isolation is a separate concern.
- [ ] Deployment and release orchestration. A gated operation is gated, not automated.

## Definition of done

Every box ticked closes this deliverable.

- [ ] A git-surface policy exists and covers history rewrite, protected branches, and tag deletion
- [ ] Every prohibited operation refuses when attempted through the tool path, REST, and the CLI, proven by a test per operation
- [ ] Every gated operation produces an approval record that states the consequence
- [ ] A refusal names the rule that produced it, and that rule is reachable from the refusal
- [ ] The platform checkout's `git status --porcelain` is unchanged after a full battery run
- [ ] F-015 closes, or its remaining scope is stated as a narrower row

## Gate

**No prohibited operation is reachable from any surface in one unconfirmed turn, and every gated
operation leaves a durable approval naming the consequence.**

Scored by [eval 04](../eval/04-capability-boundary.md) (denial paths, extended with a git-surface
oracle) and [eval 15](../eval/15-do-not-eat-the-host.md) (isolation).

## Software scope and invariants

**Scope.** A prohibition is defined over an *operation*, never over a language, toolchain, or project
type. A rule that names git is acceptable because the factory may assume the deliverable is versioned
with git ([invariants](../concepts/agnosticism-invariants.md) § assumptions); a rule that names a
package manager, a CI vendor, or a framework would break **F2**.

**Project-type-agnostic.** The prohibitions must hold equally for a greenfield repository and a legacy
one the factory did not write — and they matter more on brownfield, where history *is* the operator's
record and rewriting it destroys information the factory cannot restore.

**Architecture-agnostic.** "Repository" means any repository a project links, one or many. A
cross-repository operation is gated once, naming every repository it touches, not once per repository.

**Authority.** This deliverable strengthens bounded authority; it never widens it. Runtime
authorization still derives from actor, project, parent work item, and skill, and prompt text is still
not a grant. The prohibitions are a floor under every other rule, so no later deliverable may relax one
to unblock its own gate.

**Scope of the deliverable.** Nothing here widens what the factory accepts. It removes operations; it
adds none.

## Design rules

- [ ] Prefer unreachable over refused where the operation has no legitimate use: an absent tool cannot
      be argued into existing.
- [ ] Where an operation must exist for legitimate use, gate it and make the approval durable.
- [ ] Never implement a prohibition as a prompt instruction alone.
- [ ] Record the refusal in the audit trail, with the rule that produced it.
- [ ] Do not let a prohibition depend on the model's judgement of intent.

## Work checklist

### Enforcement

- [ ] Add a git-surface policy sharing the path policy's refusal and audit shape.
- [ ] Cover history rewrite, protected branches, and tag or release deletion.
- [ ] Extend secret handling from scanning artifacts to refusing the carrying operation.
- [ ] Confirm the platform tree is unreachable from a project job by policy.

### Where the policy lives

- [ ] Confirm the tiers are stated once, in the [security model](../security/security-model.md), and
      referenced — never restated — from here.
- [ ] Ensure a refusal points at the rule, so an operator can read it.

### Evidence

- [ ] Add a git-surface oracle to [eval 04](../eval/04-capability-boundary.md), or a suite if it does
      not fit.
- [ ] Assert each prohibited operation is refused through the tool path, not only in a reply.
- [ ] Assert each gated operation produces an approval record naming the consequence.

## Risks and open decisions

- [ ] **Over-prohibition makes the factory useless.** A rule broad enough to be safe can also block
      legitimate brownfield work, which is the normal case. Each entry needs a counter-example of the
      work it must not block.
- [ ] **A prohibition can hide a missing capability.** Refusing "delete a tag the factory did not
      create" is correct; refusing "manage releases" because release management is unimplemented is a
      gap wearing a policy's clothes. Do not let the second borrow the first's authority.
- [ ] **The gated tier can become a rubber stamp.** An approval that is always granted is a click, not
      a gate.
- [ ] **Git is assumed but not universal.** The factory may assume a project is versioned with git; it
      may not assume a *host*. The policy must hold for a local checkout with no remote at all.

## Delivery record

Not started. Filled when the definition of done is fully ticked.
