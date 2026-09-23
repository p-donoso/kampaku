# Roadmap

Sequenced by factory capability: what the line can do today, and what it must be able to do before
the [statute](software-factory.md) is honest.

## Shipped foundation

- Monorepo platform (`apps/core`, `apps/worker`, `apps/web`, `packages/contracts`)
- Durable SQLite control plane with recursive work items, jobs, leases
- Agent hierarchy, skills catalog, questions/blockers, wiki, journal
- Worker sandbox with provider-neutral model executors and coding tools
- Operator web UI (chat, projects, agents, settings) + CLI parity
- Evidence contract, quality gates, objective coverage audit, claim/state reconciliation
- Product evaluation lab (`docs/eval`) with the software-factory bar and suites 01–25

## Next priorities

- Close the front-office contradiction so a work order can actually be opened
  ([ADR-0005](../adr/0005-factory-authority-model.md), [BOARD F-001](../eval/results/BOARD.md))
- Remove the residual provider coupling so any OpenAI-compatible endpoint is first-class
- Make the line stack-neutral: acceptance evidence derived per project, never templated
- Make brownfield the default-path case in prompts, scaffolds, and planner instructions
- Keep the eval board clear of blocking `open` rows while raising provider fidelity

---

## Phase: Front-office work-order intake

Make opening a work order a real, tested path on every surface, so the factory can accept work.

### Why now

- The root agent's system prompt instructs it to call `create_project` in five places, the tool is
  implemented and registered, and `submit_intent`'s root refusal names it — but
  `KAMPAKU_BUILTIN_DEFINITION.tools` excludes it and `session.ts` filters tools by that list, so the
  model never sees it. The eval contract asserts the exclusion and passes.
- Measured consequence: asked to stand up new work, the agent creates the team, cannot create the
  container, and asks permission for the rest — five agents, no project, no repository, no work
  items, nothing executable.

### Scope

- Add `create_project` to the root agent allowlist; keep the denied set intact (plan submission,
  work-item mutation, plan approval, repository writes, shell, completion mutation, private
  specialist memory, durable job control).
- Rewrite `apps/core/tests/eval/eval-orchestrator-contract.test.ts` so it locks the new boundary in
  both directions: front-office capabilities present, line capabilities absent. A rewrite that only
  adds a tool and drops the denied-path assertions does not satisfy this phase.
- Make the refusal paths teach: `submit_intent` keeps refusing the root agent and keeps naming the
  tool that works; `update_project` keeps naming `create_project` for a missing container.
- Verify the tool is reachable from chat, CLI, REST, and the agent, with the same ids and fields
  ([suite 01](../eval/01-work-order-intake.md), [suite 02](../eval/02-three-surfaces.md)).

### Acceptance criteria

- From an empty instance, one chat turn asking for a new piece of work creates a project container
  with a linked repository path that exists, and a responsible lead; `projects list`, the REST API,
  and the web UI agree on slug and id.
- The root agent still cannot submit a plan, mutate a work item, approve a plan, write a repository,
  reach a shell, or close work; each refusal is locked by a test.
- The published operating model, the ADR, and the allowlist no longer contradict each other.
- Suite 01 scores 10 and suite 04 still scores 10.

### Out of scope

- Letting the root agent plan, execute, verify, or close work.
- Removing delegation as the front-desk-to-line transition.

---

## Phase: Provider-agnostic model plane

Make the model endpoint a configuration an operator chooses, not a router the product knows by name.
After this phase, no surface of Kampaku names, defaults to, or requires any specific router; any
OpenAI-compatible endpoint is a first-class choice and no local port is an implicit default.

### Why now

- The worker executor was already renamed provider-neutral (`model-agent`,
  `openai-compatible-chat`), but config, CLI, startup scripts, env templates, error strings,
  contracts, docs, and tests still treat one router as if it were the product.
- Deprecated compatibility fields and a `freellmapi` executor alias keep the coupling alive and
  leak into eval prerequisites and operator-facing messages.
- A product that is provider-agnostic only when four environment variables are overridden is not
  provider-agnostic.

### Scope

Naming and modules

- Rename the provider dev helper to a neutral module with neutral exports (`probeModelInference`,
  `validateModelApiKey`, `maybeStartModelProvider`).
- Rename the model-broker error module to a provider-error module; messages describe the configured
  model endpoint and the setting to fix, not a named router or its dashboard URL.
- Drop the legacy executor alias and the vendor-prefixed compatibility paths in core and worker
  config, including the `legacyConfig` fallbacks in the model agent.
- Update the `code.agent` tool spec description to provider-neutral wording.

Configuration

- One documented contract: `KAMPAKU_MODEL_BASE_URL`, `KAMPAKU_MODEL_API_KEY`,
  `KAMPAKU_MODEL_INITIAL_TIMEOUT_MS`, `KAMPAKU_MODEL_INITIAL_RETRIES`,
  `KAMPAKU_EXECUTOR=openai-compatible|echo`.
- No provider default host. When the base URL or key is missing, fail with an actionable error that
  names the setting, instead of silently pointing at a local default.
- Workspace `.env` loading accepts `KAMPAKU_*` only.
- Runtime model-provider settings stay the source of truth, with documented precedence between
  environment and settings.

Runtime, scripts, and operations

- `scripts/start.sh`, `scripts/stop.sh`, and `scripts/README.md` no longer start, stop, or document
  a named router service; the optional provider readiness probe is provider-neutral and explicitly
  flagged.
- `kampaku dev` flags are renamed (`--no-model-provider`), and the welcome/status output reports a
  model-provider status derived from the configured endpoint.
- `.env.example` and the compose comment block describe the expected endpoint shape with clearly
  marked examples, not one vendor.
- Repository-level agent notes stop describing a specific router as if it were part of the
  monorepo; operator-local details move out of the tree.

Documentation

- README, architecture docs, and the MVP stack ADR speak of an OpenAI-compatible model endpoint and
  the executor names that actually exist.
- Eval suites and eval results replace router-specific prerequisites and smoke gates with "a
  configured model provider"; historical run logs stay as history and are marked superseded rather
  than silently rewritten.

Tests

- Worker and core fixtures use the generic keys; no vendor-specific executor mode or base-URL field
  in test setup.
- The provider dev test file is renamed and asserts on generic keys.
- A regression guard fails the build when a vendor router name appears again in shipped source,
  contracts, scripts, or env templates.

### Acceptance criteria

- A repository-wide search for the old router name over shipped source, contracts, scripts, env
  templates, README, and documentation returns nothing except marked historical records.
- With only `KAMPAKU_MODEL_BASE_URL` and `KAMPAKU_MODEL_API_KEY` set, `kampaku dev`, planning,
  worker execution, and the settings UI all work against an arbitrary OpenAI-compatible endpoint;
  verified against two different endpoints.
- With no model environment configured, startup fails with an error naming the missing setting and
  makes no implicit local connection attempt.
- The regression guard fails when an old reference is reintroduced and passes on the current branch.
- Full test suite green, and one recorded eval run exercises two non-default endpoints.

### Out of scope

- Multi-provider routing, failover, cost routing, or per-agent provider overrides.
- Provider-specific adapters beyond the OpenAI-compatible protocol.
- Changing the model broker's public tool contract or agent prompts.

---

## Phase: Stack-neutral evidence

Make acceptance evidence derive from the project's own toolchain instead of any templated command.
This is the executable half of the language-agnostic invariant
([invariants §1](../concepts/agnosticism-invariants.md)).

### Why now

- The scaffold writes a README documenting `npm install` / `npm run dev` / `npm test` into a
  checkout with no `package.json`. A README that documents commands that cannot run is the same
  defect shape as a silent audio file: it satisfies the letter of "documented commands" while
  proving nothing.
- Acceptance-criterion patterns, the worker's check runner, and the skill assignment map are all
  Node-shaped, so a Python, Rust, or Go project gets checks it cannot execute.
- Skill assignment keys off a small set of web-role suffixes, so specialists for data, mobile, IaC,
  or embedded work receive no stack skills at all.

### Scope

- **Toolchain discovery before planning**: read manifests, lockfiles, CI configuration, build files,
  shebangs, and existing test conventions. Record what was found and what was not.
- **Evidence derivation**: a criterion's check command is the project's own command. `cargo test`,
  `go test ./...`, `pytest`, `mix test`, `mvn verify`, `bazel test`, `make check`, `zig build test`
  must be equally ordinary, and a criterion that states no check must produce a question rather than
  a default.
- **Scaffold honesty**: the seed declares what it actually wrote (files, manifest presence, git
  initialization) and documents only commands that run in that checkout. It must be able to seed a
  declared stack, and must not document a toolchain it did not create.
- **Polyglot support**: the toolchain is resolved per directory or package, not once per project.
- **Skill coverage by aspect**: skills follow the aspects found on disk (data, mobile, IaC,
  embedded, compatibility) instead of a fixed web-role suffix list.
- **Adding a language is data**: a new toolchain profile is configuration, not a core code path.

### Acceptance criteria

- On a Python-only repository, the plan's checks are Python commands and none mention npm.
- On a polyglot repository (for example a Rust core with a Python binding), each package's checks
  use that package's toolchain.
- A repository with no discoverable check and no stated intent produces a question, not an invented
  command.
- A seeded checkout's README documents only commands that succeed in it, and the seed reports the
  manifest and git state it created.
- Adding a toolchain profile requires no change to planning or execution business logic.
- Suites [18](../eval/18-language-agnostic.md) and [22](../eval/22-dependencies-and-supply-chain.md)
  score 10.

### Out of scope

- Language-specific code intelligence, refactoring engines, or support for a language runtime that
  the worker host cannot install.
- Auto-installing arbitrary toolchains without policy.

---

## Phase: Brownfield-first

Make changing an existing codebase the default expectation rather than a special case.

### Why now

- Prompts, scaffolds, and planner instructions are greenfield-shaped: "seed a project", "bootstrap
  a stranger project", "propose the first slice". Most real work is a change to code the factory did
  not write.
- The invariants require existing conventions and existing tests to win over factory defaults, but
  nothing in the runtime expresses that preference.

### Scope

- Project intake distinguishes greenfield from brownfield from the evidence (repository present,
  history present, CI present, conventions present).
- Planner instructions require a failing-before/passing-after check for any change to existing
  behavior, and require the blast radius (packages, services, repositories that must change
  together) to be stated before approval.
- The factory must not write its scaffold into a repository that already has one, and must not
  propose restructuring as a precondition for requested work.
- Deletion, extraction, and simplification are first-class work types, not absent from the plan
  vocabulary.
- Small work has small plans: a one-line fix does not require a phase structure or a staffing ask.

### Acceptance criteria

- Pointed at an existing repository with its own conventions, the factory follows them and writes no
  scaffold files.
- A bug-fix request produces a plan with a reproduction check, a change, and a verification step,
  and does not propose a repository restructuring.
- A request for an unrequested refactor is parked for approval with the scope difference stated.
- Suites [19](../eval/19-brownfield-and-legacy.md) and
  [21](../eval/21-maintenance-and-bugfix.md) score 10.

### Out of scope

- Automated large-scale migration tooling.
- Multi-repository release orchestration (see the architecture phase below).

---

## Phase: Multi-repository and multi-service work

Make a project able to own more than one repository and more than one deployable, with cross-repo
changes approved and applied as one unit.

### Scope

- A project links a set of repositories with roles, and work items declare which repositories they
  touch.
- A cross-repository change requires a single approval that names every repository affected, and
  either applies consistently or reports partial application explicitly.
- Shared internal contracts (schemas, OpenAPI, protobuf, packages) get a versioning decision
  recorded when they change.
- Scoped operations: a package-scoped change must not require rebuilding or rewriting the workspace.

### Acceptance criteria

- A project with a service and a client in separate repositories can be created, planned, and
  changed, and both repositories end consistent or the partial state is reported.
- A change confined to one package of a large monorepo does not rebuild the whole workspace.
- A breaking contract change without a recorded versioning decision is refused.
- Suite [20](../eval/20-multi-repo-and-services.md) scores 10.

### Out of scope

- Coordinating releases across organizations or external teams.
- Deployment to production infrastructure the operator has not linked.

---

## Phase: Shipment gate

Make "shipped" a verified state rather than an implied one.

### Scope

- Define shipment criteria per project type: runnable artifact or installable package, versioned
  output (tag, release, or immutable build identifier), and documentation that matches the artifact.
- Require the artifact to be reproducible from its own documentation in a clean environment.
- Attach a human-readable and machine-readable shipment report: what shipped, what did not, what was
  deferred and why, risks, and follow-ups.
- Require shared knowledge (wiki) to match the shipped artifact, with unbuilt features labeled as
  future.

### Acceptance criteria

- A shipped item names an immutable version reference, and the artifact can be built or installed
  from its own README in a clean checkout.
- The shipment report reconciles the work order, the approved scope, the artifact, and the evidence,
  with gaps disclosed.
- A sabotaged artifact cannot remain shipped.
- Suite [23](../eval/23-shipment-gate.md) scores 10.

### Out of scope

- Publishing to package registries or app stores on the operator's behalf without explicit
  credentials and approval.
- Production deployment orchestration.

---

## Phase: Explicit post-action knowledge projection

Make important agent outcomes explicit, structured, and independently retryable. Use a second,
low-context call to the same agent after meaningful actions; do not rely on an unstructured final
paragraph or a separate evaluator unless independent review is required.

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

---

## Later

- Multi-worker capacity and richer schedules/budgets
- Optional automated prompt harness for eval run logs (does not replace suite tests)
- Stack knowledge packs for project categories the factory now promises: data/pipelines, mobile,
  IaC, embedded, and compatibility-bound libraries
- Cost and budget accounting per work order
