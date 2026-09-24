# Software-factory improvement roadmap

This roadmap records the improvement program after Kampaku's shift from a domain-agnostic harness
to a software factory.

Use [00-template.md](00-template.md) for every new phase or substantial roadmap item.

The factory is intentionally narrow about its deliverable and strict about its evidence, while
remaining neutral about language, project type, architecture, and provider. The deliverable and its
refusal boundary are stated once, in the [product statute](../product/software-factory.md).

## Status

**This table is the living record.** Update a row in the same change that lands the work, and keep
the reason honest: a phase whose documentation is complete but whose behavior is unproven is
`Documented`, not `Complete`.

| Phase | Status | What exists now | What still blocks the gate |
|-------|--------|-----------------|----------------------------|
| [01](01-philosophy.md) Product philosophy | **Complete** | Scope and refusal boundary stated in the front-office prompt, the intake skill, and the triage tool; metadata and documents describe one product; both locked by test | Nothing in phase scope. The live refusal oracle ([eval 04](../eval/04-capability-boundary.md)) is unrun, so the refusal is contractually locked and empirically unproven |
| [02](02-factory-flow.md) Factory flow | **In progress** | Intake can open a work order: `create_project` is in the front-office allowlist, reachable through the tool path, and closed to every other role. The line's first transition therefore exists | The other five stations are not exercised end to end in one run. [Eval 25](../eval/25-factory-arc.md) is the oracle and is unrun. Intake also does not yet *decide* scope per request — the classifier is phase 04 work |
| [03](03-quality-and-testing.md) Quality and testing | **In progress** | Execution resolves a check against the repository instead of npm, criteria that name `pytest`/`cargo test` produce a required check, and the seed and fallback leaves assert no ecosystem | Discovery is not persisted on the project, the skill catalog is still web-shaped ([F-003](../eval/results/BOARD.md) partially resolved), and a worker still cannot verify audio content ([F-009](../eval/results/BOARD.md)) |
| [04](04-capability-program.md) Capability program | **In progress** | The front office can open a work order from chat, CLI, REST, and the agent path. Capabilities are framed as gates with named oracles | The software-scope **classifier** does not exist; no capability yet runs with a project-scoped sandbox root ([F-015](../eval/results/BOARD.md)) |
| [05](05-adoption-sequence.md) Adoption sequence | **In progress** | Steps are ordered, numbered distinctly from the phases, and each names the phase document that specifies it. Step 3 (intake) is partly landed | Steps 4–11 are untouched. Steps 0–2 are prerequisites for the capability phases and are not done |
| [06](06-project-context.md) Project context | **Documented** | The schema, the provenance states, and the boundary between context and assumption are specified | No project-context schema exists yet; discovery is not persisted with provenance |
| [07](07-engineering-skills.md) Engineering skills | **Documented** | The baseline skill groups, the conditional roles, the skill contract, and both scope boundaries are specified | The catalog is still web-application-shaped: no station for data, IaC, mobile, embedded, or a compatibility-bound library |
| [08](08-project-agent-roster.md) Project agent roster | **Documented** | The catalog/roster split, the authority flow, the required metadata, and the memory boundary are specified | Staffing still absorbs a proposed role into another and reports the original count ([F-006](../eval/results/BOARD.md)) |
| [09](09-domain-model-naming.md) Domain model naming | **Proposed** | The mapping, the simplification rules, and the open `Shipment`/`Release` decision are recorded | No term has been renamed; the refactor is deliberately deferred behind steps 0–2 |
| [10](10-context-minimization.md) Context minimization | **Proposed** | The default projection, the query surface, and the scope rules are specified | Full-tree injection is still the behavior, so projections are undesigned |
| [11](11-multi-provider-routing.md) Multi-provider routing | **Proposed** | The chain, the eligibility rules, the compatibility gate, and the truth requirements are specified | Provider neutrality is unfinished: a provider is still named in configuration, scripts, error text, and the CLI status line, and there is no implicit-default removal yet |

Statuses: `Proposed` (specified only) · `Documented` (specified and internally consistent, no
behavior) · `In progress` (part of the gate holds, with the remainder named) · `Complete` (gate holds
with evidence) · `Blocked` (an external decision or dependency is missing).

## Documents

- [01-philosophy.md](01-philosophy.md) — the product principles that now govern future work.
- [02-factory-flow.md](02-factory-flow.md) — the normative production line and its gates.
- [03-quality-and-testing.md](03-quality-and-testing.md) — testing, verification, and evidence.
- [04-capability-program.md](04-capability-program.md) — the capability areas to strengthen.
- [05-adoption-sequence.md](05-adoption-sequence.md) — the order in which improvements should land.
- [06-project-context.md](06-project-context.md) — the software context the project entity should expose.
- [07-engineering-skills.md](07-engineering-skills.md) — the base programming skills the factory should strengthen.
- [08-project-agent-roster.md](08-project-agent-roster.md) — project-scoped agents, hierarchy, and memory.
- [09-domain-model-naming.md](09-domain-model-naming.md) — the initial model vocabulary refactor.
- [10-context-minimization.md](10-context-minimization.md) — bounded context projections and on-demand queries.
- [11-multi-provider-routing.md](11-multi-provider-routing.md) — staged model-provider routing and fallback.

[00-template.md](00-template.md) is the phase template; it is not itself a phase.

## Rule for future changes

Every improvement must strengthen the factory line, preserve the three
[agnosticism invariants](../concepts/agnosticism-invariants.md), or improve the honesty of its
evidence. Work that does none of these needs explicit justification.

Three rules keep this roadmap honest as it is worked:

1. **Status changes with evidence, not with effort.** A phase moves to `Complete` when its gate is
   demonstrated by a run or a test, and the completion record names both.
2. **A closed gap is not a green suite.** Resolving a blocker clears the path; it does not score the
   suite. Rows and statuses say which one happened
   ([BOARD](../eval/results/BOARD.md) legend).
3. **No phase widens the deliverable.** A capability that accepts work outside the software scope, or
   a vocabulary that could describe it, is a regression against the
   [statute](../product/software-factory.md) regardless of how well it works.
