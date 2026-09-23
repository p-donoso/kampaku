# 5. Adoption sequence

- **Phase:** `05 — Adoption sequence`
- **Status:** `In progress`
- **Owner:** product
- **Dependencies:** [01](01-philosophy.md)
- **Related documents:** [statute](../product/software-factory.md),
  [agnosticism invariants](../concepts/agnosticism-invariants.md), [00-template](00-template.md)
- **Last reviewed:** 2026-09-23

Order of adoption. Each **step** below points at the phase document that specifies it;
step numbers are sequencing order, not phase numbers, because one document can cover several steps
(step 5 refines [03](03-quality-and-testing.md), and step 0 spans
[09](09-domain-model-naming.md) and [10](10-context-minimization.md)).

Steps 0–2 land first because they are hard to do after the surface grows; steps 3–10 are the
capability phases; step 11 is the standing bar.

## Step 0 — Simplify and fix the canonical model

- Establish one canonical entity per durable concept.
- Express differences through roles, relationships, states, scopes, and capabilities.
- Keep the agent-facing vocabulary and tool surface minimal.
- Define lifecycle boundaries before adding new features or integrations.

See the model simplification rules in [09-domain-model-naming.md](09-domain-model-naming.md).

## Step 1 — Minimize agent context

- Give each agent only the project, role, task, skill, and gate context required for its current
  responsibility.
- Replace large injected trees with compact projections and on-demand queries.
- Provide bounded queries for objectives, task state, dependencies, decisions, blockers, evidence,
  repository context, and relevant sibling work.
- Record query provenance and enforce the same authorization boundaries on queried data.
- Measure context size, query count, latency, and whether the agent had enough information to act.

See [10-context-minimization.md](10-context-minimization.md).

## Step 2 — Refactor the domain model vocabulary

- Rename informal or ambiguous model terms before expanding the software-factory surface.
- Update the canonical noun list, contracts, APIs, documentation, and user-facing labels together.
- Preserve database compatibility through explicit migrations or aliases where needed.

See [09-domain-model-naming.md](09-domain-model-naming.md).

## Step 3 — Make intake real

Specified by [02](02-factory-flow.md) and [04](04-capability-program.md).

**Landed 2026-09-23**, except for the scope classifier.

- [x] Enable the front office to open a work order ([BOARD F-001](../eval/results/BOARD.md),
  resolved).
- [x] Preserve the denied line capabilities, with the denial locked by test.
- [ ] Re-score the affected intake and authority contracts: the authority contract is rewritten and
  green, but the intake **suites** (01, 02, 25) are unrun, so their scores are unchanged.
- [ ] Classify software scope per request so out-of-scope work is refused before a container exists
  ([04](04-capability-program.md)).

## Step 4 — Make quality mandatory

Specified by [03](03-quality-and-testing.md).

- Require criterion-level acceptance evidence.
- Require a project-appropriate verification strategy.
- Block closure on missing, failed, or unverified evidence.

## Step 5 — Make discovery stack-neutral

Specified by [03](03-quality-and-testing.md) and [06](06-project-context.md).

- Derive project commands from the repository.
- Make brownfield, legacy, and maintenance paths first-class.
- Add knowledge packs for additional software project types without hardcoding a taxonomy.
- Persist the project context described in [06-project-context.md](06-project-context.md).

## Step 6 — Link the operational wiki

Specified by [09](09-domain-model-naming.md).

- Connect the current wiki to projects, work orders, work items, decisions, and evidence.
- Require every project to resolve to a real managed repository, with the relationship visible from
  the public project surfaces.
- Make the project's repository `docs/` directory the home for documentation that must ship with
  the software.
- Define synchronization rules between repository documentation and the shared wiki.
- Define the wiki as a shared projection of verified durable state.
- Keep private agent memory, superior journals, and shared wiki knowledge distinct.
- Update or invalidate wiki entries when repository state changes.
- Require shipment to include documentation parity and an honest stale-knowledge report.

## Step 7 — Strengthen base engineering skills

- Define a shared programming foundation for repository discovery, implementation, testing,
  debugging, review, documentation, dependency work, and release preparation.
- Teach every skill to derive commands, conventions, and boundaries from project context.
- Add stack-specific skills only when the repository requires them.
- Add conditional specialist roles for UX/UI, security, legal and compliance, QA, architecture,
  platform/operations, and data.
- Keep skills composable, least-privileged, and independent of a single language or framework.
- Evaluate skills through shipped software and evidence, not prompt conformity.

See [07-engineering-skills.md](07-engineering-skills.md).

## Step 8 — Route across multiple model providers

- Support an ordered provider and model chain for each applicable workload.
- Advance to the next eligible option when a provider is exhausted, unavailable, or in cooldown.
- Apply cooldowns, retry limits, timeout budgets, and exhaustion detection per provider/model.
- Preserve task, agent, and execution context when routing to the next provider.
- Make routing policy, provider order, credentials, limits, cooldowns, and fallback behavior
  configurable from the Settings menu.
- Expose current provider health, cooldown state, routing decisions, and failures without exposing
  secrets.
- Keep provider-specific behavior behind a normalized model-executor contract.
- Record the provider and model used for each attempt so evidence and cost reports remain truthful.

See [11-multi-provider-routing.md](11-multi-provider-routing.md).

## Step 9 — Instantiate project agent rosters

- Keep skills reusable and agents project-specific.
- Have Kampaku delegate team formation to the responsible project lead.
- Let the lead create agents and sub-agents with a bounded hierarchy and clear responsibilities.
- Support multiple instances of one skill for separate modules, repositories, or subsystems.
- Keep private agent memory scoped to its project and responsibility.
- Make roster, reporting lines, and delegation visible and durable.

See [08-project-agent-roster.md](08-project-agent-roster.md).

## Step 10 — Make shipment reproducible

Specified by [03](03-quality-and-testing.md) and scored by [23](../eval/23-shipment-gate.md).

- Verify the artifact from a clean directory or equivalent reproducible environment.
- Reconcile repository state, published documentation, and completion claims.
- Record immutable version references and absence reports.

## Step 11 — Raise the factory bar

- Run the current eval suites on fresh instances.
- Convert repeated failures into product gates or durable board rows.
- Keep the roadmap, statute, contract, and eval criteria aligned.

## Gate

**The philosophy is adopted when the product consistently refuses unverifiable completion, follows
the line across supported project shapes, and can show a stranger how to reproduce the shipped
artifact from its own documentation.** Until then the statute describes an intent, and the eval board
says which part is still intent.

Scored by the whole battery ([eval 01–25](../eval/README.md)); the sequence is complete only when no
blocking row is open on [BOARD](../eval/results/BOARD.md).

## Software scope and invariants

Sequencing is itself a scope control: every step below must land **without** widening the deliverable.
The three invariants are constraints on all of them and are checked per step — a step that adds a
language-specific code path, a fixed project taxonomy, or a single-deployable assumption is not done
because the step's feature works ([invariants](../concepts/agnosticism-invariants.md)).

Two properties must survive every step, in the same way [01](01-philosophy.md) requires of any
capability: bounded authority with human decision gates, and durable state that stays truthful
through interruption, failure, and model change. A faster sequence that trades either away is a
regression, not progress.

## Roadmap governance checklist

- [ ] Each phase uses [00-template.md](00-template.md) and carries phase metadata.
- [ ] Each phase states its gate, its oracle, and the invariant it must not break.
- [ ] No phase widens the deliverable or frames a capability as accepting non-software work
  ([statute](../product/software-factory.md)).
- [ ] Dependencies and affected contracts are recorded before implementation.
- [ ] Each phase has observable acceptance criteria.
- [ ] Each phase has automated regression coverage or an explicit reason it does not.
- [ ] Fresh-data validation is run after changes to runtime behavior.
- [ ] Open gaps are recorded in the current evaluation board.
- [ ] Obsolete names, links, and duplicated sources are removed.
- [ ] Completed phases are marked with evidence, limitations, and follow-up work.
