# 18 — Language-agnostic

## Promise tested

The factory works in any language and any toolchain, including several in one project, and it derives
its acceptance evidence from what the project actually uses.

This suite is the executable form of invariant §1
([agnosticism invariants](../concepts/agnosticism-invariants.md)). It replaces the retired
"any domain" suite: the same class of claim (the factory has no baked favourite), narrowed to the
axis the product actually promises. The software-only scope itself is gate **F1**, scored by
[04](04-capability-boundary.md).

## Why it elevates

Weak: every plan's checks are `npm test`; a Python project's plan documents `npm install`; a Rust
project is staffed with a `frontend` specialist; "the project has no tests" is said about a project
with a `Makefile` target; a polyglot repository is treated as one language.

Credible: the factory reads the manifests, lockfiles, CI configuration, and existing test conventions,
names what it found, and uses it. Adding a language is data, not a new code path.

## Prereqs

- Suite [11](11-honest-done.md) green (the evidence machinery works).
- **Three** scenario repositories prepared outside the platform, of which at least two are not the
  platform's own language:
  - **A** — a non-Node, single-language project with an existing test runner (for example a Rust crate,
    a Go module, or a Python package with tests).
  - **B** — a project with **no** discoverable check and no stated check in the intent.
  - **C** — a **polyglot** repository: at least two languages with different toolchains.
- Record each path and the toolchain you expect the factory to discover.

## Emperor prompts

For each scenario, one order:

1. **A**: `Open a work order for the project at <A>. Plan and implement a small change, and include the checks you will use. Tell me which files told you the toolchain.`
2. **B**: `Open a work order for the project at <B> and plan a small change.`
3. **C**: `Open a work order for the project at <C> and plan a small change that touches both the <lang-1> and <lang-2> parts. Tell me which checks apply to which part.`
4. Cross-check: `Compare the three plans. Did you use the same check commands for all three? If so, explain why that is correct.`

## Oracle

- **Discovery before assertion.** For each scenario the factory names the evidence it used (a manifest,
  a lockfile, a CI workflow, a build file, a shebang, an existing test directory) and its answer is
  consistent with that evidence.
- **A**: the plan's checks are A's own commands, executed successfully by the operator. No
  package-manager command from another ecosystem appears.
- **B**: the factory asks for the missing check rather than inventing one. An invented `npm test`, an
  invented `pytest`, or any other default fails this suite. The question names what it looked for and
  did not find.
- **C**: the plan distinguishes the checks per part of the repository. A single check command for the
  whole polyglot repository fails unless the repository genuinely has one (for example a single
  `make check`), in which case that fact must come from the repository.
- **No ecosystem default anywhere.** Across the three plans, no command appears that is not traceable
  to a file in the corresponding repository.
- Role vocabulary follows the aspects present, not a web-app default (cross-check with
  [03](03-stations-and-staffing.md)).
- Seeded artifacts, if any, are in the project's own language and their README documents only commands
  that run.
- Prompt 4 produces a correct explanation: the checks differ because the projects differ. If the reply
  claims uniformity is correct, that is a failure.

## How to measure

- Execute every check command in every plan; record exit codes.
- For each command, locate the file or convention that justifies it; a command with no source is a
  finding.
- Check the plans and staffing for the string `npm`, `yarn`, `pnpm` outside a Node scenario.
- Confirm scenario B produced a durable question.
- Verify no scenario wrote into the platform checkout.

## 10/10 checklist

Universal gates: **U1** · **U2** · **U3** · **U4** · **U5** · **U6** · **U7** · **U8**
Factory gates: **F1** · **F2** · **F3** · **F4** · **F5**

- [ ] U1 Empty instance
- [ ] U2 Public docs sufficient
- [ ] U3 Plans/checks visible identically on chat, CLI, and web
- [ ] U4 Automated tests cited below are green
- [ ] U5 Fresh data-dir re-run after any fix
- [ ] U6 No silent budget failure hiding the oracle
- [ ] U7 Pass criteria stay product-level
- [ ] U8 No open blocking BOARD row for this suite
- [ ] F1 All three deliverables are software
- [ ] **F2 Satisfied by construction — this suite is F2's oracle**
- [ ] F3 Each plan respects the repository's existing package boundaries
- [ ] F4 No existing convention overwritten in any scenario
- [ ] F5 Every documented command run successfully

### Suite-specific

- [ ] Toolchain discovery named and consistent per scenario
- [ ] No cross-ecosystem command in any plan
- [ ] Undiscoverable check produced a question, not a default
- [ ] Polyglot repository differentiated per part
- [ ] Role vocabulary follows the aspects present
- [ ] Zero platform writes

### In-scope P-gates

- **P3** required for scenario B · **P6** required · **P7** required

## Automated tests

| Test | Locks | Status |
|------|-------|--------|
| `apps/core/tests/eval/eval-language-agnostic.test.ts` | Discovery from manifests/CI; per-scenario check derivation; no ecosystem default; question when undiscoverable; polyglot differentiation | **To author** |
| `apps/core/tests/eval/eval-seed-toolchain-freedom.test.ts` | Seeds in two languages produce their own commands | **To author** (shared with [06](06-greenfield-stranger-repo.md)) |
| Skill-assignment coverage tests | Specialists for non-web aspects receive skills | Exist in part; extend. The **catalog** itself still has no data, IaC, mobile, embedded, or compatibility station ([07](../roadmap/07-engineering-skills.md)) |
| `apps/worker/tests/project-toolchain.test.ts` | Discovery from repository markers; per-toolchain command resolution; fail-closed refusal with the markers it looked for; nested-package reporting; non-Node criteria producing a required check | Exists |
| `apps/core/tests/application/scaffold-toolchain-neutrality.test.ts` | The seed and fallback plan leaves name no ecosystem | Exists |

## Pass

- Binary: all oracle bullets hold for all three scenarios.
- Score: **10** / 10.

## Run log

| Field | Value |
|-------|-------|
| Date | not run |
| Data dir | — |
| Git SHA | — |
| Scenario A / B / C paths | — |
| Languages | — |
| Model / provider | — |
| Tests | not run |

## Result

`not run` — awaiting execution.

## Evidence

None yet.

## Blocker

No [BOARD F-001](results/BOARD.md) blocker remains (resolved 2026-09-23): the agent path can open a
container. If no non-Node scenario can be planned
without a templated command, record the stack-neutrality phase as the blocker
([stack-neutral quality roadmap](../roadmap/03-quality-and-testing.md)).
