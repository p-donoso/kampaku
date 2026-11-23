# 18. Self-extension: authoring agents and skills

- **Document:** `18 — Self-extension`
- **Kind:** `deliverable`
- **Tracking issue:** [#19](https://github.com/p-donoso/kampaku/issues/19)
- **Related documents:** [statute](../product/software-factory.md),
  [agnosticism invariants](../concepts/agnosticism-invariants.md),
  [domain model](../concepts/domain-model.md), [eval 03](../eval/03-stations-and-staffing.md),
  [eval 18](../eval/18-language-agnostic.md)
- **Last reviewed:** 2026-09-24

## What exists now

The runtime can create some agents and assign existing skills, but it cannot author, scope, validate,
and promote missing skills through one durable product path.

## Purpose

The skills and stations that ship with the platform are a **seed set**: the initial capabilities the
factory knows about, offered as suggestions. They cannot be an enumeration of what real projects
need, because the factory promises to work on any language, any project type, and any architecture
([invariants](../concepts/agnosticism-invariants.md)). A seed set that cannot grow is a taxonomy in
disguise.

So the factory must be able to author what it is missing. Measured against `apps/core/src` on
2026-09-24, it largely cannot:

| Capability | State |
|-----------|-------|
| Create an agent | **Works**, but by the wrong role. `create_sub_agent` requires `system-agent-roster` or `workflow-specialist-delegation`. A project lead holds neither, so the lead cannot create the seats it proposes, while the specialists it should create can ([BOARD F-021](../eval/results/BOARD.md)) |
| Create a skill through the tool path | **Does not exist.** The runtime exposes `list_skills`, `assign_skill`, and `unassign_skill`. There is no `create_skill`. Authoring a skill means a person using the CLI or REST, or an agent writing into the platform's own repository with a code agent ([BOARD F-022](../eval/results/BOARD.md)) |
| Give a skill a project scope | **Not expressible.** `skill.schema.json` has `slug`, `name`, `description`, `capabilities`, `tools`, `promptFragment`, `default` — no project. A skill is global, so there is nowhere to put a capability that only one project needs ([BOARD F-022](../eval/results/BOARD.md)) |
| Generate a seat from a slug | **Works, but blind.** `createMissingAgentFromSlug` assigns skills by slug suffix. A slug matching no known suffix is created with **zero skills** and no warning |

That last row is the same failure the `-prompt` seat exposed: a capability that only exists if
somebody guessed the name right. This phase makes the missing thing authorable instead.

## Outcome

When a project needs a capability that does not exist, the factory **creates** it rather than
degrading the work, and it does so in a way that is durable, scoped, and auditable:

- a seat can be authored from the project's own evidence, and it records why it exists;
- a skill can be authored through the runtime, not only by a person with the CLI;
- an authored skill has a scope, so a project-specific capability does not become a global default;
- an authored skill is validated before it is used, and it cannot bake scenario copy into the product;
- an authored seat or skill that proves reusable is *promoted*, explicitly, and its origin is
  recorded — so the seed set grows from evidence rather than from guesswork;
- a seat whose role matches no known skill is **reported**, never silently created with no
  capabilities.

## Scope

### In scope

- [ ] An authoring path for skills through the runtime tool surface, with the same validation the
      catalog already enforces (`npm run contracts:check`'s rules: slug matches directory, description
      present, metadata well-formed, allowed tools declared).
- [ ] **Scope on a skill**: global, platform, or project. A project-scoped skill belongs to one
      project and is not offered to another.
- [ ] Authoring a seat: role, project and module scope, skills, parent, and creation reason.
- [ ] **Promotion**: moving an authored project skill into the shared catalog is an explicit,
      recorded act with an owner, not a side effect.
- [ ] Provenance for both: what evidence justified the capability, which project needed it first, and
      whether it has been reused.
- [ ] Refusal and reporting: a seat or skill that cannot be authored (missing scope, no evidence, an
      invalid definition) fails visibly rather than degrading silently.
- [ ] Guardrails on authored content: no scenario copy in a product default, no credential, no
      instruction naming a tool the runtime does not provide.

### Out of scope

- [ ] Autonomous self-modification of the platform. An authored skill is a *capability*, not a change
      to the factory's own code; a project may not rewrite the delegator because it needs a role.
- [ ] Letting a project-scoped skill leak into another project. Isolation is not negotiable for
      convenience.
- [ ] An unbounded self-improvement loop. Authoring is triggered by a project's need, not by a desire
      to have more skills.
- [ ] Generating prompts or skills for non-software work. The refusal boundary is unchanged
      ([statute](../product/software-factory.md)): "write me a skill for my marketing copy" is refused
      at intake.
- [ ] Fine-tuning, training, or distilling anything. The factory authors instructions, not models.

## Definition of done

Every box ticked closes this deliverable. Nothing here needs a judgement call.

- [ ] A skill can be authored through the runtime and is rejected when it fails catalog validation
- [ ] An authored project-scoped skill is invisible to another project, and a test proves it
- [ ] A seat is authored with role, scope, skills, parent, and a recorded creation reason
- [ ] A seat whose role matches nothing reports the gap instead of being created empty
- [ ] Promotion to the shared catalog requires an explicit act and records its origin
- [ ] No authored skill carries scenario copy, a credential, or an unreachable tool name
## Gate

**When nothing in the catalog fits, the factory authors what it needs, and the authored thing is
scoped, validated, provenance-tracked, and reusable — or the refusal is explicit.**

- [ ] A skill can be authored through the runtime and is rejected if it fails catalog validation.
- [ ] An authored project-scoped skill is visible to its project and **not** to another.
- [ ] A seat is authored with role, scope, skills, parent, and a recorded creation reason.
- [ ] A seat whose role matches no known skill reports the gap instead of being created with zero
      capabilities.
- [ ] Promotion from project scope to the shared catalog requires an explicit act and records its
      origin.
- [ ] No authored skill contains scenario copy, a credential, or an instruction naming a tool the
      runtime does not provide.
- [ ] A project whose aspects have no matching seed skill is staffed by authoring, not by degrading the
      plan.

Scored by a new suite, extending [03](../eval/03-stations-and-staffing.md) (staffing follows aspects
on disk) and [18](../eval/18-language-agnostic.md) (adding a capability is data, not a code path).

## Software scope and invariants

**This phase is what makes the seed set honest.** Without it, "language-agnostic, project-type-agnostic,
architecture-agnostic" is bounded by whatever the catalog happens to contain, and the invariant is
untestable: a project needing a capability nobody wrote is simply planned badly.

**Language-agnostic.** An authored skill must be authorable for any toolchain without touching the
delegator. If supporting a new language or role requires a code change, the invariant is broken —
this is the skill-level form of [invariants §1](../concepts/agnosticism-invariants.md)'s *"adding a
language is data, not branching"*.

**Project-type-agnostic.** The trigger for authoring is a discovered aspect, not a taxonomy match. A
legacy repository needing a compatibility-owner seat and a greenfield one needing a data-pipeline seat
author the same kind of object.

**Architecture-agnostic.** Skill scope must express per-module and per-repository work, so a monorepo
can have a seat whose capability applies to one package. A global-only skill model forces every
capability to be everybody's, which is both a scope and an authority leak.

**Bounded authority.** An authored skill **never** grants authority. Runtime authorization still derives
from actor, project, parent work item, and skill scope, and prompt text is not a grant
([06](../eval/06-greenfield-stranger-repo.md), [14](../eval/14-least-privilege.md)). A skill that
asserts it may do something it is not authorized to do must fail closed. This is the single most
important constraint in the phase: authoring capability, not authoring permission.

**Repository isolation.** A project-scoped skill and a project-authored seat belong to exactly one
project. Neither may become another project's starting point, and neither may be promoted without an
explicit, recorded decision.

**No scenario copy, ever.** The rule that a skill must not bake a demo project, stack, or vendor into a
product default ([skills](../concepts/skills.md)) applies *harder* to generated content, because
generation is where scenario copy enters unnoticed. An authored skill derived from one project's
details must be scoped to that project, and promotion must strip what is specific.

## Design rules

- [ ] Author from evidence: a discovered aspect, a missing capability the plan needs, or a role the
      objective requires. Never author because the catalog looks thin.
- [ ] Default new skills to the **narrowest** scope that works; widening is an explicit act.
- [ ] Validate before use, with the same rules the catalog already enforces, and refuse on failure.
- [ ] Record provenance: which project needed it, on what evidence, and whether it was later reused.
- [ ] Distinguish capability from authority: a new skill may enable work, never authorize it.
- [ ] Strip what is project-specific before promotion, or do not promote.
- [ ] Prefer a smaller number of general skills over many near-duplicates; report overlap rather than
      authoring a variant.
- [ ] Make the failure honest: if the factory cannot author the capability, say what is missing instead
      of planning work that cannot be done well.

## Work checklist

### Model and contracts

- [ ] Add a scope to the skill entity: global, platform, or project, with the owning project when
      scoped.
- [ ] Add authoring metadata: provenance (what evidence, which project first), and promotion state.
- [ ] Decide whether an authored seat needs a distinct `source` value so the roster can show which
      seats were authored versus seeded.
- [ ] Extend `skill.schema.json` and the domain model together, with a migration for existing records.

### Authoring path

- [ ] Add a skill-authoring tool to the runtime surface, with the same validation the catalog enforces.
- [ ] Let the role that proposes a roster author the seats it needs, subject to the ADR that fixes the
      current inversion ([F-021](../eval/results/BOARD.md)).
- [ ] Make `createMissingAgentFromSlug` report a slug whose role matches no known skill, instead of
      creating a capability-less seat.
- [ ] Wire the authoring path to the discovered aspect so a need is met rather than guessed.

### Guardrails

- [ ] Run the secret scan and the scenario-copy rules over authored skill content.
- [ ] Reject an authored skill whose `allowed-tools` names a tool that does not exist.
- [ ] Confirm an authored skill cannot widen its own authority at runtime.
- [ ] Test that a project-scoped skill is invisible to a second project.

### Provenance and promotion

- [ ] Record creation reason, evidence, and first-needing project for every authored capability.
- [ ] Require an explicit act to promote, and record who did it and why.
- [ ] Report reuse, so promotion is justified by evidence rather than by preference.

## Acceptance criteria

- [ ] A project needing a capability the catalog lacks is staffed by authoring it, and the gate
      records the gap that triggered it.
- [ ] The authored skill is validated, scoped, and invisible to other projects.
- [ ] A seat whose role matches nothing reports the gap instead of being created empty.
- [ ] An authored skill cannot grant authority it does not have.
- [ ] No authored or promoted skill contains scenario copy or a credential.
- [ ] Promotion is explicit, recorded, and justified by reuse.
- [ ] The refusal boundary is unchanged: a non-software request is still refused at intake, however
      authorable the factory is.

## Risks and open decisions

- [ ] **Self-extension is the most dangerous capability in this roadmap.** A factory that writes its
      own skills can quietly widen its own behaviour, and the failure is invisible because the skill
      looks like every other skill. The capability/authority split above is the only thing that makes
      this safe, and it needs a test that actually tries to abuse it.
- [ ] **A growing catalog degrades routing.** Every added skill makes "which seat fits this work?" a
      harder question, and [07](07-engineering-skills.md) already has to derive roles from aspects.
      Promotion should be justified by reuse, and overlap should be reported, or the catalog becomes
      noise.
- [ ] **Project scope versus the platform's own skills.** The platform needs skills that are not for
      projects, and projects need skills that are not for the platform. If scope is modelled as a
      single axis, one of the two will be expressed as a workaround.
- [ ] **Promotion can leak project detail.** A skill promoted out of one project carries that project's
      vocabulary. Stripping specific content is a judgement call, and a wrong one is
      [F-003](../eval/results/BOARD.md) all over again.
- [ ] **Overlap with [08](08-project-agent-roster.md) § The seat.** 08 defines the seat's fields; this
      phase defines how a seat or skill is *authored* when none exists. If the two are implemented
      separately without that split, the roster authority model will be specified twice.
- [ ] **Ordering.** This phase depends on the seat having explicit scope (08) and on skills not being
      suffix-matched (07). Implementing it before those produces an authoring path that writes
      capabilities nobody can address.

## Delivery record

Not started. Filled when the definition of done is fully ticked.
