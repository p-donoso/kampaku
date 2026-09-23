# 1. Product philosophy

## North star

Kampaku takes a software work order from one person, runs it through a bounded production line,
and reports what actually shipped.

## Permanent principles

1. Software is the deliverable. Non-technical work is refused clearly.
2. The person defines intent, priorities, and business decisions.
3. Kampaku manages execution, preserves visibility, and never invents authority.
4. A claim is not evidence. Completion requires re-executable or independently inspectable proof.
5. The project's own conventions and toolchain take precedence over factory defaults.
6. Workers are autonomous only inside explicit project, work-item, and skill boundaries.
7. The platform and the managed project remain separate.
8. Interruption, resumption, failure, and absence are durable and truthful states.

## Three invariants

- **Language-agnostic:** any language or polyglot repository.
- **Project-type-agnostic:** greenfield, brownfield, legacy, maintenance, migration, or hardening.
- **Architecture-agnostic:** single repository, monorepo, multi-repo, services, embedded, or other
  existing shapes.

These invariants constrain implementation choices, not the product's purpose.

## Consequence for future work

New features should be expressed as factory capabilities or gates, not as promises to handle every
kind of human work.

## Adoption checklist

- [ ] Every new product document names software as the deliverable.
- [ ] Out-of-scope work is refused with the boundary named.
- [ ] Every capability preserves the three agnosticism invariants.
- [ ] Every completion claim has re-executable or independently inspectable evidence.
- [ ] Every authority expansion is narrow, explicit, and tested.
- [ ] Every project-facing change preserves repository isolation.
- [ ] Missing, stale, blocked, and unverified states remain visible.
