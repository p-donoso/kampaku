# Eval board (product gaps)

Open gaps found while running the `docs/eval` lab. Language is **product gap**, not catalog patch.

Rows are opened from three sources: a suite run, a capability probe
([capability-probe-protocol.md](../capability-probe-protocol.md)), or a direct contradiction found by
reading the product's own artifacts. A row exists only for a **measured** gap — an unverified
capability is listed under *Unverified capabilities* below, not here.

## Status legend

- `open` — blocks or fails a suite
- `in_progress` — a change owns the fix
- `resolved` — fixed; suite re-run on a fresh data dir still required before calling the suite green
- `wontfix` — accepted debt; the suite stays failed until the bar changes with emperor approval

## Columns

| id | suites | symptom | product gap | likely layer | owner | status | notes |
|----|--------|---------|-------------|--------------|-------|--------|-------|

## Open rows — factory battery

| id | suites | symptom | product gap | likely layer | owner | status | notes |
|----|--------|---------|-------------|--------------|-------|--------|-------|
| **F-001** | 01, 02, 03, 04, 05, 06, 07, 08, 18, 19, 20, 21, 22, 25 | The root agent's system prompt instructs it to call `create_project` in five places, the tool is implemented and dispatched, and `submit_intent` refuses the root agent by naming that exact tool — but `KAMPAKU_BUILTIN_DEFINITION.tools` excludes it and `session.ts:244` filters tools by that list, so the model never sees it. No role can open a work order by the documented route | The front office must be able to open a work order. Add `create_project` to the root agent allowlist while keeping the line capabilities (plan submission, work-item mutation, plan approval, repository writes, shell, completion mutation, private memory, job control) absent | core | [ADR-0005](../../adr/0005-factory-authority-model.md) | **open** | Measured 2026-09-23: `definitions.ts` tools list (11) vs `KAMPAKU_TOOLS` dispatch; `session.ts:244`; `update_project.ts:38` and `tools/index.ts:299-306` both point at `create_project`. First found as probe gap `G-09`. This is the fatal one for a factory: a front desk that cannot open an order |
| **F-002** | 01, 04 | `apps/core/tests/eval/eval-orchestrator-contract.test.ts` asserts `KAMPAKU_BUILTIN_DEFINITION.tools` **equals** the 11-tool list that excludes `create_project`, and passes. The test is the lock on the contradiction above | The contract test must lock the boundary in **both** directions: front-office capabilities present, line capabilities absent. A rewrite that only adds a tool and drops the denied-path assertions does not satisfy this | core / docs | [ADR-0005](../../adr/0005-factory-authority-model.md) | **open** | A passing test that enforces a broken contract is worse than a failing one. Must be fixed in the same change as F-001, not after |
| **F-003** | 07, 18, 22, 23, 25 | Acceptance evidence is templated instead of derived: a seeded README documents `npm install` / `npm run dev` / `npm test` in a checkout with no `package.json`; the worker's required-check runner assumes a package-script convention; criterion patterns and skill assignment are Node-shaped | Stack-neutral evidence end-to-end: discover the toolchain from manifests, lockfiles, CI, and existing tests; derive each criterion's check from the project; fail closed with a question when nothing is discoverable; scaffold only what was written | core / worker / contracts | [roadmap](../../roadmap/03-quality-and-testing.md) | **open** | Measured twice in evaluation runs; probe gap `G-21`. Blocks invariant §1 ([agnosticism invariants](../../concepts/agnosticism-invariants.md)) |
| **F-004** | 06 | The seed records `defaultBranch: main` for a linked repository but never runs `git init`, so the "repository" is files without version control. A project declares a branch against a directory that is not a repository | Seeding must initialize version control and report `initializedRepository`, and must report when git is unavailable rather than implying success | core / application | [roadmap](../../roadmap/05-adoption-sequence.md) | **open** | Probe gap `G-22`; the branch claim is still recorded from a template rather than from the checkout |
| **F-005** | 03, 25 | A project records no lead (`projectLeadAgentId: null`, or the root agent itself) while the reply lists a lead as created and verified. The agent exists but is not linked, so nobody owns scope, plans, or phase gates | Linking the lead is part of opening the work order and must be verified, not reported. A container without an accountable owner is not an acceptable intake outcome | core | roadmap § Front-office work-order intake | **open** | Probe gaps `G-14` and `G-24`, measured on the same project in one arc |
| **F-006** | 03 | The factory proposed a 6-role team with a dedicated owner for the hard subsystem, then created 5 and absorbed the missing role into another — while the lead's own description still claimed 6. The agreed station layout was silently reshaped | Staffing must create what it proposed, or state the difference and why. An internal contradiction between a role's description and the tree is a durable false claim | core / model | roadmap § Front-office work-order intake | **open** | Probe gap `G-04`. Not blocking progression, but it is the same class as the fabricated status report: a claim the tree contradicts |
| **F-007** | 10, 25 | A question asked from chat is durable, but answering it does not resume anything — chat conversations carry no project, so nothing is parked and no work advances. The CLI acknowledgement previously implied a resumption that did not happen | Either park the linked work durably when a required question is open, or state plainly that a following turn is needed. An unanswered required question with no blocked work is not a gate | core / cli | [roadmap](../../roadmap/05-adoption-sequence.md) | **open** | Remaining work for durable human gates. Blocks suite 10's "linked work visibly blocked" oracle |
| **F-008** | 17 | The effective agent model is not controllable through a resolving alias: it resolved to a different upstream model mid-run, and that model emitted a garbled turn (raw control tokens, malformed tool name, no tool call executed, exit 0). A model can also advertise tool support and fail to call tools in practice | Capability must be negotiated and verified per endpoint, and a tool-incapable model must be detected and reported as an endpoint gap rather than silently retried into a green run. Operators need a pin they can rely on | core / worker | roadmap § Provider-agnostic model plane | **open** | Probe gap `G-15` and `G-20`; the probe's own pin was wrong once, which is recorded as an operator defect too |
| **F-009** | 11, 25 | The worker cannot verify audio or speech behavior: `transcribeAudio()` raises `INSPECTION_UNSUPPORTED` and `inspect_audio` returns duration, codec, and signal statistics — all of which a 44-byte header-only WAV passes. Any project whose acceptance depends on produced audio can be satisfied by a structurally valid but meaningless artifact | Either provide a real round-trip capability for audio-bearing criteria, or refuse to claim verification for them and mark the criterion unverified. A metadata check must never be represented as content verification | worker | roadmap § Later (stack knowledge packs) | **open** | Measured three independent ways in one probe (`§4.1`, `PF-5`). Scoped: it blocks only projects whose deliverable includes audio behavior, but it is the canonical example of the evidence defect the product exists to prevent |
| **F-019** | 01–25 (U4) | Most of the battery has no committed automated lock. `apps/core/tests/eval/` holds four files (`eval-orchestrator-contract`, `eval-execution-assurance`, `eval-software-scope`, `eval-docs-coherence`) and `apps/web/e2e/` one, while most suites' **Automated tests** tables are still marked *to author* | A battery whose promises are not locked by tests cannot score 10 by its own rules. Either author the locks suite by suite as each is taken, or accept that the battery is a manual lab capped at 9 and say so | core / web | roadmap § Next priorities | **open** | Confirmed by listing the test directories. Partially closed 2026-09-23: the F1 software-scope contract and the product-documentation coherence are now locked, and the locks run in the default test command. The row stays open for the remaining suites |

### Non-blocking rows

Measured gaps that do not block a suite's oracle but degrade the factory.

| id | suites | symptom | product gap | likely layer | owner | status | notes |
|----|--------|---------|-------------|--------------|-------|--------|-------|
| **F-010** | 16 | There is no `conversations` CLI command, so listing and resuming a conversation requires the REST API. Web/CLI parity is a stated golden rule | Add the parity command, or state the exception | core / cli | [roadmap](../../roadmap/05-adoption-sequence.md) | open | Remaining work for three-surface parity |
| **F-011** | 01 | There is no documented path to decommission a project created in error; an operator needs a raw REST call | Provide a `decommission` path or document the delete route as the supported one | core / cli | [roadmap](../../roadmap/05-adoption-sequence.md) | open | Remaining work for project lifecycle management |
| **F-012** | 12 | Plan previews never expire, so a preview from any point in history remains approvable, while approvals themselves carry an expiry | A bounded preview lifetime | core | [roadmap](../../roadmap/05-adoption-sequence.md) | open | Remaining work for approval lifecycle management |
| **F-013** | 13, 16 | A turn's in-progress state is not persisted: an interrupted turn leaves side effects on disk with no record until (or unless) the response returns. A multi-minute turn is indistinguishable from a hung one | Persist in-progress turn state so an interrupted turn is visible while it runs | core / cli / web | [roadmap](../../roadmap/05-adoption-sequence.md) | open | Remaining work for interruption and execution visibility |
| **F-014** | 11 | The claim/state audit reconciles creation claims (projects, agents, repositories, work items) but not misstated **state** ("the project is active" when it is not) | Extend reconciliation to state claims, or document the deliberate narrowness where operators will see it | core | [roadmap](../../roadmap/05-adoption-sequence.md) | open | Remaining work for claim reconciliation |
| **F-015** | 14, 19 | The bootstrap filesystem settings grant the whole home directory read-write, so isolation between projects depends on self-restraint rather than policy, and a project checkout outside the platform is only protected by convention | Project-scoped writable roots, with the home directory excluded unless explicitly granted | core / contracts | roadmap § Multi-repository and multi-service work | open | Measured in the probe's pre-flight (`§3.4 PF-2`): `bootstrapFilesystemSettings()` granted `$HOME` read-write, which is also why the platform monorepo was writable |
| **F-016** | 16 | `start.sh`/`stop.sh` cannot reclaim their own orphaned listeners: a stale process holding a port is reported but not resolvable by a later run | Record a port-ownership marker per service so a later run can reclaim its own orphans | scripts | [roadmap](../../roadmap/05-adoption-sequence.md) | open | Remaining work for service lifecycle management |
| **F-020** | all (U4) | Two worker tests that shell out (`tests/empty-repository-tools.test.ts`, `tests/model-agent-checks.test.ts`) hit vitest's 5000 ms default and fail on a loaded host: measured 2026-09-23 at load average 20, where `npm test` exited 1, while the same tree and the same two tests passed in isolation in about 2 s each and `npm test` exited 0 on an idle host. A red suite that is only an environment artifact teaches the operator to ignore red | Raise the timeout for tests that shell out, or make them deterministic under load, so `npm test` failing always means a product failure | worker / tests | [roadmap § quality and testing](../../roadmap/03-quality-and-testing.md) | open | Not caused by phase 01 (no worker file changed); surfaced while validating it |

## Unverified capabilities (no row yet)

These are promised by the factory framing or the roadmap but have **not been measured**. The first
run of the corresponding suite decides whether they are gaps. They are listed so nobody mistakes
"not measured" for "working".

| Capability | Suite that will decide it |
|------------|---------------------------|
| A project can link and change more than one repository atomically | [20](../20-multi-repo-and-services.md) |
| A non-Node toolchain's checks are derived correctly | [18](../18-language-agnostic.md) |
| A polyglot repository is planned per package | [18](../18-language-agnostic.md) |
| An existing repository's conventions beat the factory's defaults | [19](../19-brownfield-and-legacy.md) |
| A small maintenance request produces a small response | [21](../21-maintenance-and-bugfix.md) |
| Dependency and license claims are real | [22](../22-dependencies-and-supply-chain.md) |
| A shipped version reproduces in a clean directory | [23](../23-shipment-gate.md) |
| The factory refuses non-technical deliverables with a named boundary | [04](../04-capability-boundary.md) |

## Dependency rule

Do not start suite **N** if an `open` row marked as blocking that path exists for a suite earlier in
the order. F-001 blocks the arc entry point; prefer closing it first.

## How to add a row

1. `id`: `F-NNN` for the current battery, continuing from the highest existing number.
2. `suites`: which suites the gap blocks or fails.
3. `symptom`: what the operator saw, with the exact evidence.
4. `product gap`: what a credible factory would do instead.
5. `likely layer`: core / worker / web / contracts / scripts / docs — not a skill slug.
6. `owner`: the ADR, roadmap phase, or current product document that owns the fix.
7. `status`: see the legend.
8. `notes`: evidence paths, commits, suite run dates, and whether the gap came from a suite or a probe.

A gap that only exists in a probe's ledger is not yet a row. Promote it here when it blocks a suite or
when a suite is written for it.
