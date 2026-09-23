# Product vision

Kampaku is a **personal software factory**.

It is not another chat interface and not a coding assistant. It is the production line between one
person's intent and shipped software: a work order goes in, a staffed line plans it, builds it,
verifies it against the project's own toolchain, and ships it — and the person keeps visibility and
control the whole way.

The guiding relationship is unchanged and is the reason Kampaku is a factory rather than a service:
**the person defines intent and priorities; Kampaku manages execution while preserving visibility
and control.**

## What it produces

Applications, services, libraries, SDKs, infrastructure, data and pipeline code, tooling, test
assets, and the technical documentation that ships with them. See the
[statute](software-factory.md) for the boundary and for what it refuses.

## What makes it a factory and not a script

1. **Durable over ephemeral.** A work order outlives the chat that created it, a crashed process,
   and a model swap.
2. **A line, not a prompt.** Intake → engineering → staffing → execution → inspection → shipment.
   Each station has an owner, an input, an output, and a gate.
3. **Verified, not claimed.** Done means the stated check was re-executed against the artifact.
   A claim the durable state does not support is reported as unverified.
4. **Bounded authority.** Sandboxed workers, path policy, least privilege per role, and durable
   human gates when a decision belongs to the person.
5. **Honest about absence.** Missing evidence, partial work, blocked work, and refused work are
   stated plainly. A green board over an empty repository is a defect, not a success.

## Three permanent invariants

The factory knows the deliverable is software. It does not know, and will not assume, anything else
about the work:

- **Language-agnostic** — any language, including polyglot repositories.
- **Project-type-agnostic** — greenfield, brownfield, legacy, maintenance, migration, hardening.
- **Architecture-agnostic** — single package, monorepo, multi-repo, microservices, embedded.

Read the project, then act inside it. Never reshape it to suit the factory.

## Product principles

- durable work over ephemeral conversation;
- autonomy bounded by explicit authority;
- inspectable plans and auditable actions;
- the project's own conventions and toolchain win over any factory default;
- provider, worker, language, project-type, and architecture portability;
- graceful interruption, resumption, and correction;
- private projects remain private runtime data;
- refusing unverifiable work is a feature, not a gap.

## Related

- [Statute — Kampaku is a software factory](software-factory.md)
- [Agnosticism invariants](../concepts/agnosticism-invariants.md)
- [Roadmap](roadmap.md)
- [Eval lab](../eval/README.md)
