# ADR-0004: Kampaku is a software factory

- Status: Accepted
- Date: 2026-09-23
- Supersedes: the "domain-agnostic personal orchestration harness" framing used across product docs
  and eval suites 01–20

## Context

Kampaku was defined by mechanism rather than by purpose. The product documents described it as a
personal harness for persistent agents that could govern **any** domain: software, novels,
research, documents, datasets, media, operations. The eval lab scored it against an
"emperor-grade product bar" that named no deliverable at all, and suite 18 was dedicated to
proving the product did **not** have a domain preference.

That position had three costs, all measurable in the repository:

1. **Nothing to measure.** "Done" for software is a passing check re-executed against a working
   artifact. "Done" for a novel is editorial judgment. A bar that must cover both cannot define
   either, so the lab fell back to scoring product mechanics (did it ask a question, did it
   respect a boundary) and never scored whether the deliverable was any good.
2. **Generic output.** The planner, the scaffold, and the skill catalog all had to avoid assuming
   software, so the scaffold wrote files whose README documented `npm install` in a checkout with
   no `package.json`, and the planner had to hedge its acceptance criteria. Generality was paid for
   in dishonesty.
3. **A refusal to state a purpose.** The domain-agnostic framing was never delivered as a
   capability — it was a constraint that made the software path worse in order to avoid looking
   like a software-only tool.

Meanwhile the product's own evidence pointed the other way. Every capability the factory actually
built — sandboxed workers, path policy, coding tools, repository seeding, dependency inspection,
build and check execution, artifact inspection, browser verification, IaC-shaped evidence — is
software work. The generic-sounding capabilities (`inspect_document`, `inspect_audio`) were built
to verify *software deliverables*, not to author documents or audio.

## Decision

Kampaku is a **software factory**. It takes a work order from one person and runs it through a
staffed line that plans, builds, verifies, and ships software and the technical artifacts software
cannot exist without.

1. **The deliverable is software and its technical satellites** — applications, services, libraries,
   SDKs, infrastructure as code, data and pipeline code, tooling, test assets, and the technical
   documentation that ships with them.
2. **Non-technical deliverables are out of scope by decision, not by limitation** — creative
   writing, open-ended research, non-technical documents, and standalone design work. The product
   refuses them explicitly rather than producing a degraded artifact.
3. **Three agnosticisms are permanent invariants**: language-agnostic (any language, including
   polyglot), project-type-agnostic (greenfield, brownfield, legacy, maintenance, migration,
   hardening), and architecture-agnostic (single package, monorepo, multi-repo, microservices,
   embedded). They are defined and scored in
   [agnosticism-invariants.md](../concepts/agnosticism-invariants.md).
4. **The product statute is [software-factory.md](../product/software-factory.md)**, which states
   the line, its stations, its gates, and what it refuses.

## Consequences

### Positive

- "Done" has a definition the lab can score, and evidence has a shape (a command re-executed
  against an artifact, a behavior observed, a contract inspected).
- The planner, scaffold, and catalog can be specific instead of hedging, which is what makes them
  honest: a scaffold that knows it produces software can document the toolchain it actually wrote.
- Refusing out-of-scope work becomes a testable product behavior, and the failure mode it prevents
  — a green board over an unverifiable artifact — is exactly the defect the evidence contract exists
  to catch.
- The three invariants give the eval lab three scoreable axes that were previously unmeasurable.

### Negative

- The framing *loses* a claim the product used to make. Requests for non-software work are now
  refusals. This is intended, and it will read as a narrowing to anyone who valued the generic
  positioning.
- Docs, skills, prompts, and eval suites that assumed cross-domain neutrality need rework; the
  domain-agnostic wording is now incorrect rather than merely vague.
- The skill catalog's role vocabulary has to grow per-stack knowledge (data, mobile, IaC, embedded)
  to serve the project types the factory now promises.

### Neutral

- The emperor metaphor, the agent hierarchy, the brand system, the durable stores, and provider
  neutrality are unchanged.
- The factory vocabulary (work order, line, station, gate, shipment) is added as a production view
  of the existing domain objects; it does not replace the canonical noun list.

## Alternatives considered

**Stay domain-agnostic.** Rejected: it produced no measure of the deliverable, forced generic and
therefore dishonest artifacts, and was never delivered as a capability.

**Software-only, no invariants.** Rejected: a factory that assumes Node and assumes greenfield is
not usable on a stranger's repository, which is the only test that matters. The invariants are what
make the narrowing an improvement rather than a retreat.

**Software-first but silent about the rest.** Rejected as dishonest. The product must state what it
refuses, because a refusal the user discovers empirically is a product defect, not a boundary.

## Related

- [ADR-0005](0005-factory-authority-model.md) — who may open a work order
- [Product statute](../product/software-factory.md)
- [Agnosticism invariants](../concepts/agnosticism-invariants.md)
- [Eval lab](../eval/README.md)
